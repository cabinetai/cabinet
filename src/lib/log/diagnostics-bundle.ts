import fs from "fs";
import os from "os";
import path from "path";
import JSZip from "jszip";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { listLogFiles, getLogLevel, readCrashMarker } from "@/lib/log/logger";
import { redactSecrets } from "@/lib/log/redact";

/**
 * "Export diagnostics" bundle (PRD §3.4): logs + system facts + integration
 * NAMES + audit tail + conversation index. Safe to share by construction:
 * no secret values, no transcripts, no prompts, no page contents — and a
 * redaction pass over everything anyway.
 */

async function readAppVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(
      await fs.promises.readFile(
        path.join(process.cwd(), "package.json"),
        "utf-8"
      )
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function readRuntimePorts(): Promise<unknown> {
  try {
    const raw = await fs.promises.readFile(
      path.join(DATA_DIR, ".cabinet-state", "runtime-ports.json"),
      "utf-8"
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function integrationNames(): Promise<string[]> {
  // Connector NAMES only (never env values, never config bodies).
  try {
    const { MCP_CATALOG } = await import("@/lib/agents/mcp-catalog");
    const { connectedProvidersForEntry } = await import(
      "@/lib/agents/mcp-config-writer"
    );
    return MCP_CATALOG.flatMap((entry) => {
      const providers = connectedProvidersForEntry(entry);
      return providers.length
        ? [`${entry.mcpServerName} (${providers.join(", ")})`]
        : [];
    });
  } catch {
    return [];
  }
}

async function conversationsIndex(): Promise<unknown[]> {
  try {
    const { listConversationMetas } = await import(
      "@/lib/agents/conversation-store"
    );
    const metas = await listConversationMetas();
    return metas
      .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""))
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        status: m.status,
        trigger: m.trigger,
        startedAt: m.startedAt,
        completedAt: m.completedAt ?? null,
        exitCode: m.exitCode ?? null,
        providerId: m.providerId ?? null,
        adapterType: m.adapterType ?? null,
        // deliberately NO title/summary/transcript — could carry user content
      }));
  } catch {
    return [];
  }
}

async function auditTail(lines: number): Promise<string> {
  try {
    const raw = await fs.promises.readFile(
      path.join(DATA_DIR, ".cabinet-meta", "audit.log"),
      "utf-8"
    );
    return raw.split("\n").filter(Boolean).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

export async function buildDiagnosticsBundle(): Promise<Buffer> {
  const zip = new JSZip();

  for (const file of listLogFiles()) {
    try {
      const raw = await fs.promises.readFile(file, "utf-8");
      zip.file(`logs/${path.basename(file)}`, redactSecrets(raw));
    } catch {
      // unreadable stream — skip
    }
  }

  const system = {
    exportedAt: new Date().toISOString(),
    appVersion: await readAppVersion(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    nodeVersion: process.version,
    logLevel: getLogLevel(),
    lastCrash: readCrashMarker(),
    dataDirShape: redactSecrets(DATA_DIR),
    runtimePorts: await readRuntimePorts(),
  };
  zip.file("system.json", redactSecrets(JSON.stringify(system, null, 2)));

  zip.file(
    "integrations.json",
    JSON.stringify({ connected: await integrationNames() }, null, 2)
  );

  zip.file(
    "conversations-index.json",
    JSON.stringify(await conversationsIndex(), null, 2)
  );

  zip.file("audit-tail.txt", redactSecrets(await auditTail(200)));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
