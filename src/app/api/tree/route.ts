import { NextRequest, NextResponse } from "next/server";
import { buildTree } from "@/lib/storage/tree-builder";
import { ensureDataDir } from "@/lib/storage/fs-operations";
import { staleProcessResponse } from "@/lib/api/stale-process-response";

export async function GET(request: NextRequest) {
  try {
    await ensureDataDir();
    const showHidden = request.nextUrl.searchParams.get("showHidden") === "1";
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    const tree = await buildTree(showHidden, fresh);
    return NextResponse.json(tree);
  } catch (error) {
    const stale = staleProcessResponse(error);
    if (stale) return stale;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
