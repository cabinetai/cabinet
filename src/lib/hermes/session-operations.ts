import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";

type OperationRecord = {
  state: "claimed" | "completed";
  claimedAt: string;
  result?: Record<string, unknown>;
};

function operationPath(identity: string): string {
  const digest = createHash("sha256").update(identity).digest("hex");
  return path.join(CABINET_INTERNAL_DIR, "hermes-session-operations", `${digest}.json`);
}

export async function claimHermesSessionOperation(
  identity: string
): Promise<{ claimed: boolean; result?: Record<string, unknown> }> {
  const file = operationPath(identity);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const handle = await fs.open(file, "wx", 0o600);
    try {
      const record: OperationRecord = {
        state: "claimed",
        claimedAt: new Date().toISOString(),
      };
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf-8");
    } finally {
      await handle.close();
    }
    return { claimed: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const existing = JSON.parse(await fs.readFile(file, "utf-8")) as OperationRecord;
      return { claimed: false, result: existing.state === "completed" ? existing.result : undefined };
    } catch {
      return { claimed: false };
    }
  }
}

export async function completeHermesSessionOperation(
  identity: string,
  result: Record<string, unknown>
): Promise<void> {
  const file = operationPath(identity);
  const record: OperationRecord = {
    state: "completed",
    claimedAt: new Date().toISOString(),
    result,
  };
  await fs.writeFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf-8", mode: 0o600 });
}

export async function releaseHermesSessionOperation(identity: string): Promise<void> {
  await fs.unlink(operationPath(identity)).catch(() => undefined);
}
