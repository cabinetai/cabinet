import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { readPersona, writePersona } from "@/lib/agents/persona-manager";

type RouteParams = { params: Promise<{ slug: string }> };

const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "svg"]);
const MAX_BYTES = 1024 * 1024; // 1 MB

function resolveAgentDir(slug: string, cabinetPath: string | undefined): string {
  const base = cabinetPath
    ? path.join(DATA_DIR, cabinetPath, ".agents", slug)
    : path.join(DATA_DIR, ".agents", slug);
  const resolved = path.resolve(base);
  const root = path.resolve(DATA_DIR);
  if (!resolved.startsWith(root)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

function extFromMime(mime: string): string | null {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  return null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const ext = (searchParams.get("ext") || "").toLowerCase();
  const cabinetPath = searchParams.get("cabinet") || undefined;

  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: "Invalid extension" }, { status: 400 });
  }

  const agentDir = resolveAgentDir(slug, cabinetPath);
  const filePath = path.join(agentDir, `avatar.${ext}`);
  try {
    const buf = await fs.readFile(filePath);
    const contentType =
      ext === "png"
        ? "image/png"
        : ext === "svg"
          ? "image/svg+xml"
          : "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const form = await req.formData();
  const file = form.get("file");
  const cabinetPath =
    typeof form.get("cabinetPath") === "string"
      ? (form.get("cabinetPath") as string)
      : undefined;

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const f = file as File;
  if (f.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 1 MB)" }, { status: 413 });
  }

  const ext = extFromMime(f.type);
  if (!ext) {
    return NextResponse.json({ error: "Unsupported type" }, { status: 415 });
  }

  const persona = await readPersona(slug, cabinetPath);
  if (!persona) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agentDir = resolveAgentDir(slug, cabinetPath);
  const buf = Buffer.from(await f.arrayBuffer());

  // Clean up any older avatar file so there's exactly one on disk.
  for (const e of ALLOWED_EXT) {
    await fs.unlink(path.join(agentDir, `avatar.${e}`)).catch(() => {});
  }

  await fs.writeFile(path.join(agentDir, `avatar.${ext}`), buf);
  await writePersona(slug, { avatar: "custom", avatarExt: ext }, cabinetPath);

  return NextResponse.json({ ok: true, ext });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const cabinetPath = req.nextUrl.searchParams.get("cabinet") || undefined;

  const agentDir = resolveAgentDir(slug, cabinetPath);
  for (const e of ALLOWED_EXT) {
    await fs.unlink(path.join(agentDir, `avatar.${e}`)).catch(() => {});
  }
  // Clearing avatar: pass empty strings so writePersona drops the fields.
  await writePersona(slug, { avatar: "", avatarExt: "" }, cabinetPath);
  return NextResponse.json({ ok: true });
}
