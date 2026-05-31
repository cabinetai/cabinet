import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/storage/path-utils";

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const WORKSPACE_FILE = path.join(CONFIG_DIR, "workspace.json");
const COMPANY_FILE = path.join(CONFIG_DIR, "company.json");

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET() {
  // Prefer the v2 workspace.json; fall back to legacy company.json.
  const workspace = await readJson(WORKSPACE_FILE);
  if (workspace) {
    return NextResponse.json(workspace);
  }

  const company = await readJson(COMPANY_FILE);
  if (company) {
    // Synthesize a v2-shaped payload so callers don't need to branch.
    const companyData =
      (company.company as { name?: string; description?: string; teamSize?: string }) || {};
    return NextResponse.json({
      exists: true,
      version: 1,
      home: { name: "Home" },
      room: { id: "office-01", type: "office", name: "The Office" },
      cabinet: {
        name: companyData.name || "My Cabinet",
        description: companyData.description || "",
        size: companyData.teamSize || "",
      },
      setupDate: company.setupDate,
      // Expose legacy shape alongside so existing consumers still work.
      company: companyData,
    });
  }

  return NextResponse.json({ exists: false });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  await fs.mkdir(CONFIG_DIR, { recursive: true });
  // Write to the legacy file for backward compatibility with callers that
  // still POST the old shape. The canonical config is managed by the
  // onboarding setup route now.
  await fs.writeFile(COMPANY_FILE, JSON.stringify(body, null, 2), "utf-8");

  return NextResponse.json({ ok: true }, { status: 201 });
}
