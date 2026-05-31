import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { readPage, writePage, createPage } from "@/lib/storage/page-io";
import { fileExists, writeFileContent } from "@/lib/storage/fs-operations";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";

const ROOT_INDEX = path.join(DATA_DIR, "index.md");

async function ensureRootIndex() {
  if (!(await fileExists(ROOT_INDEX))) {
    const now = new Date().toISOString();
    await writeFileContent(
      ROOT_INDEX,
      `---\ntitle: Knowledge Base\ncreated: "${now}"\nmodified: "${now}"\ntags: []\n---\n`
    );
  }
}

export async function GET() {
  try {
    await ensureRootIndex();
    const page = await readPage("");
    return NextResponse.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await createPage("", body.title);
    invalidateTreeCache();
    autoCommit("", "Add");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    await writePage("", body.content, body.frontmatter);
    // Frontmatter title drives the root node label — invalidate so renames show.
    invalidateTreeCache();
    autoCommit("", "Update");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
