import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import upstreamAudit from "./upstream-audit.json";

const AUDIT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function command(command: string, args: string[]): string | null {
  try {
    const result = execFileSync(command, args, {
      encoding: "utf8",
      timeout: 1_500,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function short(value: string | null): string | null {
  return value ? value.slice(0, 12) : null;
}

export type HermesInstallationDetection = {
  desktopVersion: string | null;
  desktopCommit: null;
  backendVersion: string | null;
  backendCommit: string | null;
  cabinetCommit: string | null;
  upstreamAudit: {
    auditedAt: string;
    auditedCommit: string;
    installedBackendVersion: string;
    installedBackendCommit: string;
    commitsBehind: number;
    stale: boolean;
  };
};

export function detectHermesInstallation(
  backendVersion: string | null,
  now = Date.now()
): HermesInstallationDetection {
  const desktopVersion = command("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleShortVersionString",
    "/Applications/Hermes.app/Contents/Info.plist",
  ]);
  const backendRepository = path.join(homedir(), ".hermes", "hermes-agent");
  const backendCommit = command("git", ["-C", backendRepository, "rev-parse", "HEAD"]);
  const cabinetCommit = command("git", ["rev-parse", "HEAD"]);
  const auditAge = now - Date.parse(upstreamAudit.auditedAt);
  const stale =
    !Number.isFinite(auditAge) ||
    auditAge < 0 ||
    auditAge > AUDIT_MAX_AGE_MS ||
    backendVersion !== upstreamAudit.installedBackendVersion ||
    backendCommit !== upstreamAudit.installedBackendCommit;

  return {
    desktopVersion,
    // The installed app bundle does not expose a stable source commit. Unknown
    // is more accurate than carrying the commit from a previous source audit.
    desktopCommit: null,
    backendVersion,
    backendCommit: short(backendCommit),
    // Evidence generation must be able to prove the exact source revision.
    cabinetCommit,
    upstreamAudit: { ...upstreamAudit, stale },
  };
}
