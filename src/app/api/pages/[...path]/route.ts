import { NextRequest, NextResponse } from "next/server";
import { readPage, writePage, createPage, deletePage, movePage, renamePage } from "@/lib/storage/page-io";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";
import { recordMutation } from "@/lib/history/engine";
import {
  assertWritablePath,
  ReadOnlySourceError,
  removeInlineSourceByTreePath,
} from "@/lib/knowledge-sources/store";
import { storageOverCap } from "@/lib/cloud/tier";

// Free cloud tier at its storage cap: block content writes (mirrors the upload route; reads,
// renames, and deletes stay allowed). Inert off-cloud — storageOverCap is always false there.
const storageFull = () =>
  NextResponse.json(
    { error: "Storage full — the free plan is capped. Upgrade for more room.", errorKind: "storage" },
    { status: 402 }
  );

type RouteParams = { params: Promise<{ path: string[] }> };

/** Convert a read-only-mount violation into a 403, else null (caller 500s). */
function readOnly(error: unknown): NextResponse | null {
  return error instanceof ReadOnlySourceError
    ? NextResponse.json({ error: error.message }, { status: 403 })
    : null;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    const page = await readPage(virtualPath);
    return NextResponse.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    await assertWritablePath(virtualPath);
    if (await storageOverCap()) return storageFull();
    const body = await req.json();
    await writePage(virtualPath, body.content, body.frontmatter);
    autoCommit(virtualPath, "Update");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const ro = readOnly(error);
    if (ro) return ro;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    await assertWritablePath(virtualPath);
    if (await storageOverCap()) return storageFull();
    const body = await req.json();
    await createPage(virtualPath, body.title);
    invalidateTreeCache();
    autoCommit(virtualPath, "Add");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const ro = readOnly(error);
    if (ro) return ro;
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    await assertWritablePath(virtualPath);
    const body = await req.json();
    if (body.rename) {
      const { newPath, references } = await renamePage(virtualPath, body.rename);
      invalidateTreeCache();
      void recordMutation({
        op: "rename",
        virtualPath: newPath,
        fromVirtualPath: virtualPath,
        message: `Rename ${virtualPath} to ${newPath}`,
      });
      return NextResponse.json({ ok: true, newPath, references });
    }
    const fromParent = virtualPath.split("/").slice(0, -1).join("/");
    const toParent =
      typeof body.toParent === "string" ? body.toParent : fromParent;
    // Block moving INTO a read-only mount (the new child path would sit under it).
    const movedName = virtualPath.split("/").pop() ?? "";
    await assertWritablePath(toParent ? `${toParent}/${movedName}` : movedName);
    const newPath = await movePage(virtualPath, toParent, {
      prevName: body.prevName ?? undefined,
      nextName: body.nextName ?? undefined,
    });
    invalidateTreeCache();
    if (newPath !== virtualPath) {
      void recordMutation({
        op: "move",
        virtualPath: newPath,
        fromVirtualPath: virtualPath,
        message: `Move ${virtualPath} to ${newPath}`,
      });
    }
    return NextResponse.json({ ok: true, newPath });
  } catch (error) {
    const ro = readOnly(error);
    if (ro) return ro;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    // Strictly-under check: a file inside a read-only mount can't be deleted,
    // but the mount node itself can (that's "disconnect").
    await assertWritablePath(virtualPath);
    await deletePage(virtualPath);
    // If this was an inline knowledge mount, clear its registry record too so
    // the source doesn't outlive the symlink (disconnect cleanup).
    await removeInlineSourceByTreePath(virtualPath).catch(() => {});
    invalidateTreeCache();
    autoCommit(virtualPath, "Delete");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const ro = readOnly(error);
    if (ro) return ro;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
