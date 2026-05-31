import { NextRequest, NextResponse } from "next/server";
import { buildTree } from "@/lib/storage/tree-builder";
import { ensureDataDir } from "@/lib/storage/fs-operations";

export async function GET(request: NextRequest) {
  try {
    await ensureDataDir();
    const showHidden = request.nextUrl.searchParams.get("showHidden") === "1";
    const tree = await buildTree(showHidden);
    return NextResponse.json(tree);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
