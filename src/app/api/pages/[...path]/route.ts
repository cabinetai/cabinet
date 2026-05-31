import { NextRequest, NextResponse } from "next/server";
import { readPage, writePage, createPage, deletePage, movePage, renamePage } from "@/lib/storage/page-io";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";

type RouteParams = { params: Promise<{ path: string[] }> };

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
    const body = await req.json();
    await writePage(virtualPath, body.content, body.frontmatter);
    autoCommit(virtualPath, "Update");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    const body = await req.json();
    await createPage(virtualPath, body.title);
    invalidateTreeCache();
    autoCommit(virtualPath, "Add");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    const body = await req.json();
    if (body.rename) {
      const { newPath, references } = await renamePage(virtualPath, body.rename);
      invalidateTreeCache();
      return NextResponse.json({ ok: true, newPath, references });
    }
    const fromParent = virtualPath.split("/").slice(0, -1).join("/");
    const toParent =
      typeof body.toParent === "string" ? body.toParent : fromParent;
    const newPath = await movePage(virtualPath, toParent, {
      prevName: body.prevName ?? undefined,
      nextName: body.nextName ?? undefined,
    });
    invalidateTreeCache();
    return NextResponse.json({ ok: true, newPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { path: segments } = await params;
    const virtualPath = segments.join("/");
    await deletePage(virtualPath);
    invalidateTreeCache();
    autoCommit(virtualPath, "Delete");
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
