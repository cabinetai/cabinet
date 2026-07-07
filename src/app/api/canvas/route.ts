import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveCabinetDir } from "@/lib/cabinets/server-paths";
import { normalizeCabinetPath, ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { autoCommit } from "@/lib/git/git-service";
import { ensureDirectory, fileExists, readFileContent, writeFileAtomic } from "@/lib/storage/fs-operations";

const CANVAS_FILENAME = "canvas.json";

function getCommitPath(cabinetPath: string): string {
  return cabinetPath === ROOT_CABINET_PATH ? CANVAS_FILENAME : `${cabinetPath}/${CANVAS_FILENAME}`;
}

export async function GET(request: NextRequest) {
  try {
    const cabinetPath = normalizeCabinetPath(request.nextUrl.searchParams.get("cabinetPath"), true) ?? ROOT_CABINET_PATH;
    const cabinetDir = resolveCabinetDir(cabinetPath);
    const canvasPath = path.join(cabinetDir, CANVAS_FILENAME);

    if (!(await fileExists(canvasPath))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const content = await readFileContent(canvasPath);
    return NextResponse.json(JSON.parse(content));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cabinetPath = normalizeCabinetPath(request.nextUrl.searchParams.get("cabinetPath"), true) ?? ROOT_CABINET_PATH;
    const snapshot = await request.json();

    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ error: "Invalid canvas snapshot" }, { status: 400 });
    }

    const cabinetDir = resolveCabinetDir(cabinetPath);
    await ensureDirectory(cabinetDir);

    const canvasPath = path.join(cabinetDir, CANVAS_FILENAME);
    const content = JSON.stringify(snapshot, null, 2) + "\n";
    await writeFileAtomic(canvasPath, content);
    await autoCommit(getCommitPath(cabinetPath), "Update");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
