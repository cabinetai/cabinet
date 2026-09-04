import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { readFileContent, writeFileAtomic } from "@/lib/storage/fs-operations";

const PALETTES_PATH = path.join(process.cwd(), "src", "components", "settings", "color-palettes.json");
const PASTEL_PALETTES_PATH = path.join(process.cwd(), "src", "components", "settings", "pastel-color-palettes.json");

type ColorPalettesMap = Record<string, string[]>;

function isValidColorPalettesMap(value: unknown): value is ColorPalettesMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([name, colors]) => {
    if (!name || typeof name !== "string") return false;
    if (!Array.isArray(colors) || colors.length !== 6) return false;
    return colors.every((color) => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color));
  });
}

export async function GET() {
  try {
    const content = await readFileContent(PALETTES_PATH);
    const palettes = JSON.parse(content) as unknown;
    if (!isValidColorPalettesMap(palettes)) {
      return NextResponse.json({ error: "Invalid color palettes file" }, { status: 500 });
    }
    return NextResponse.json({ palettes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "reset") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    const pastelContent = await readFileContent(PASTEL_PALETTES_PATH);
    const pastelPalettes = JSON.parse(pastelContent) as unknown;
    if (!isValidColorPalettesMap(pastelPalettes)) {
      return NextResponse.json({ error: "Invalid pastel color palettes file" }, { status: 500 });
    }
    const ordered = Object.fromEntries(
      Object.entries(pastelPalettes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, colors]) => [
          name,
          colors.map((color) => color.toUpperCase()),
        ])
    );
    await writeFileAtomic(PALETTES_PATH, `${JSON.stringify(ordered, null, 4)}\n`);
    return NextResponse.json({ ok: true, palettes: ordered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { palettes?: unknown };
    if (!isValidColorPalettesMap(body.palettes)) {
      return NextResponse.json({ error: "Invalid palettes payload" }, { status: 400 });
    }
    const ordered = Object.fromEntries(
      Object.entries(body.palettes)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, colors]) => [
          name,
          colors.map((color) => color.toUpperCase()),
        ])
    );
    await writeFileAtomic(PALETTES_PATH, `${JSON.stringify(ordered, null, 4)}\n`);
    return NextResponse.json({ ok: true, palettes: ordered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
