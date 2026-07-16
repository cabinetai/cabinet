/**
 * Connect-time health probe for token-authenticated STDIO MCP servers
 * (e.g. Snowflake's snowflake-labs-mcp). Unlike the OAuth stdio login flow
 * (stdio-mcp-login.ts), these servers authenticate purely from env credentials,
 * so we can verify them BEFORE the user commits: spawn the server, run the MCP
 * `initialize` handshake, and report success or the server's own error.
 *
 * Why it matters: servers like snowflake-labs-mcp open their upstream connection
 * at startup. A bad credential or a missing network policy makes the process die
 * during boot — which, at agent-run time, surfaces only as an endless "still
 * connecting" with no error. Probing here turns that silent hang into an
 * actionable ✗ carrying the real message (e.g. "Network policy is required").
 *
 * Nothing is persisted: credentials come from the request, and the required
 * service-config file is materialized to a throwaway temp path that's deleted
 * when the probe ends.
 */

import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { readCabinetEnvFile } from "@/lib/runtime/cabinet-env";
import { PROJECT_ROOT } from "@/lib/runtime/runtime-config";
import { getRuntimePath } from "./provider-cli";
import type { CatalogEntry } from "./mcp-catalog";

export interface StdioProbeResult {
  valid: boolean;
  detail: string;
}

/** How long to wait for the handshake before giving up (uvx cold-start aware). */
const PROBE_TIMEOUT_MS = 25_000;

/**
 * stdio servers we can meaningfully probe: local command, token auth (creds in
 * env), and NO OAuth login step (those are handled by stdio-mcp-login and would
 * just block waiting for a browser).
 */
export function canProbeStdio(entry: CatalogEntry): boolean {
  return (
    entry.transport === "stdio" &&
    !!entry.command &&
    !entry.connectAuth &&
    !!entry.serverEnv
  );
}

/**
 * Child env = process env + provider runtime PATH, then the entry's serverEnv
 * `${KEY}` placeholders resolved from saved .cabinet.env values overlaid with
 * the just-typed credentials (so we test exactly what the user is about to save).
 */
function buildEnv(
  entry: CatalogEntry,
  credsOverride: Record<string, string>,
): NodeJS.ProcessEnv {
  const values = { ...readCabinetEnvFile().values };
  for (const [k, v] of Object.entries(credsOverride)) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) values[k] = t;
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.PATH = [getRuntimePath(), process.env.PATH].filter(Boolean).join(path.delimiter);
  for (const [k, v] of Object.entries(entry.serverEnv ?? {})) {
    const m = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(v);
    if (m) {
      const val = values[m[1]];
      if (val) env[k] = val; // unset optional → let the server default
    } else {
      env[k] = v;
    }
  }
  return env;
}

/**
 * Resolve args, materializing `entry.configFile` to a temp path and swapping it
 * in for `${CONFIG_FILE}`. Returns a cleanup that removes the temp file.
 */
function resolveArgsWithTempConfig(entry: CatalogEntry): {
  args: string[];
  cleanup: () => void;
} {
  let args = entry.args ? [...entry.args] : [];
  let tmpFile: string | undefined;
  if (entry.configFile && args.some((a) => a.includes("${CONFIG_FILE}"))) {
    tmpFile = path.join(
      os.tmpdir(),
      `cabinet-probe-${randomUUID()}-${entry.configFile.name}`,
    );
    fs.writeFileSync(tmpFile, entry.configFile.contents, "utf8");
    const resolved = tmpFile;
    args = args.map((a) => a.replaceAll("${CONFIG_FILE}", resolved));
  }
  const cleanup = () => {
    if (tmpFile) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* best effort */
      }
    }
  };
  return { args, cleanup };
}

/** A Python traceback ends with the exception line — the most useful message. */
function lastMeaningfulLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

/**
 * Spawn the server, run `initialize`, and resolve to a pass/fail with a
 * human-readable detail. Best-effort and self-cleaning; never throws.
 */
export async function probeStdioMcp(
  entry: CatalogEntry,
  credsOverride: Record<string, string>,
): Promise<StdioProbeResult> {
  if (!canProbeStdio(entry)) {
    return { valid: true, detail: "This integration is verified at first use." };
  }

  let command = entry.command as string;
  const { args, cleanup } = resolveArgsWithTempConfig(entry);
  const env = buildEnv(entry, credsOverride);

  // Dev bootstrap: run a first-party source build directly, matching the writer.
  if (entry.localBuild) {
    const local = path.join(PROJECT_ROOT, entry.localBuild);
    if (fs.existsSync(local)) {
      command = "node";
      args.length = 0;
      args.push(local);
    }
  }

  // Redact any secret that could echo back in server output. Cover both the
  // just-typed creds AND the values buildEnv actually injected for secret-kind
  // credentials — the latter may come from saved .cabinet.env, not this request.
  const secretValues = [
    ...entry.credentials
      .filter((c) => c.kind === "secret")
      .map((c) => env[c.envKey]),
    ...Object.values(credsOverride),
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length >= 6);
  const scrub = (s: string): string => {
    let out = s;
    for (const v of secretValues) out = out.split(v).join("<redacted>");
    return out;
  };

  return new Promise<StdioProbeResult>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    let proc: ChildProcess;
    try {
      proc = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      cleanup();
      resolve({
        valid: false,
        detail: err instanceof Error ? err.message : "Could not start the server.",
      });
      return;
    }

    const finish = (r: StdioProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      cleanup();
      resolve({ valid: r.valid, detail: scrub(r.detail).slice(0, 400) });
    };

    const timer = setTimeout(() => {
      finish({
        valid: false,
        detail:
          "The server didn't respond in 25s. On its first run it may still be downloading, so try again in a moment.",
      });
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();

    // Scan stdout for the `initialize` reply (id:1). Success → serving normally;
    // an error object → the server refused the connection.
    const scanForReply = () => {
      for (const line of stdout.split(/\r?\n/)) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        let msg: { id?: unknown; result?: unknown; error?: unknown };
        try {
          msg = JSON.parse(t);
        } catch {
          continue; // partial/streamed line
        }
        if (msg.id !== 1) continue;
        if (msg.result && typeof msg.result === "object") {
          const info = (msg.result as { serverInfo?: { name?: string } }).serverInfo;
          finish({
            valid: true,
            detail: info?.name
              ? `Connected: ${info.name} is responding.`
              : "Connected: the server is responding.",
          });
          return;
        }
        if (msg.error) {
          const em = (msg.error as { message?: string }).message;
          finish({ valid: false, detail: em ? `Server error: ${em}` : "The server rejected the connection." });
          return;
        }
      }
    };

    proc.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
      scanForReply();
    });
    proc.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    proc.on("error", (err) => finish({ valid: false, detail: err.message }));
    proc.on("exit", () => {
      // Exited before answering initialize → startup/connection failure. The
      // last stderr line is the exception (e.g. "... Network policy is required").
      finish({
        valid: false,
        detail:
          lastMeaningfulLine(stderr) ||
          "The server exited before completing the connection.",
      });
    });

    try {
      proc.stdin?.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "cabinet-probe", version: "1.0.0" },
          },
        }) + "\n",
      );
      proc.stdin?.write(
        JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
      );
    } catch {
      finish({ valid: false, detail: "Could not talk to the server over stdio." });
    }
  });
}
