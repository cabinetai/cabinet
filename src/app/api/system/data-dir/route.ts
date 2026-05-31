import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { INSTALL_CONFIG_PATH } from "@/lib/runtime/runtime-config";

export const dynamic = "force-dynamic";

function electronConfigPath(): string | null {
  const userData = process.env.CABINET_USER_DATA?.trim();
  if (!userData) return null;
  return path.join(userData, "cabinet-config.json");
}

async function persistDataDir(newDir: string): Promise<void> {
  const writeTo = async (target: string) => {
    let config: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(target, "utf-8");
      config = JSON.parse(raw);
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
    config.dataDir = newDir;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(config, null, 2) + "\n", "utf-8");
  };

  // Always write to PROJECT_ROOT/.cabinet-install.json (source-mode path).
  // In Electron mode, also write to <userData>/cabinet-config.json — that's
  // the file the Electron main process reads at boot.
  await writeTo(INSTALL_CONFIG_PATH).catch(() => {});
  const electronPath = electronConfigPath();
  if (electronPath) {
    await writeTo(electronPath);
  }
}

/** GET — return the current data directory */
export async function GET() {
  return NextResponse.json({ dataDir: DATA_DIR });
}

/** PUT — persist a new data directory (requires restart) */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const newDir = body.dataDir?.trim();

    if (!newDir) {
      return NextResponse.json(
        { error: "dataDir is required" },
        { status: 400 }
      );
    }

    const resolved = path.resolve(newDir);

    // Verify the directory exists
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return NextResponse.json(
        { error: "Path must be an existing directory." },
        { status: 400 }
      );
    }

    await persistDataDir(resolved);

    return NextResponse.json({
      ok: true,
      dataDir: resolved,
      restartRequired: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — remove persisted data dir (revert to default, requires restart) */
export async function DELETE() {
  try {
    let config: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(INSTALL_CONFIG_PATH, "utf-8");
      config = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: true });
    }

    delete config.dataDir;

    if (Object.keys(config).length === 0) {
      await fs.unlink(INSTALL_CONFIG_PATH).catch(() => {});
    } else {
      await fs.writeFile(
        INSTALL_CONFIG_PATH,
        JSON.stringify(config, null, 2) + "\n",
        "utf-8"
      );
    }

    return NextResponse.json({ ok: true, restartRequired: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
