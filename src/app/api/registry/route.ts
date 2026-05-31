import { NextResponse } from "next/server";
import { getRegistryTemplates } from "@/lib/registry/registry-manifest";

export async function GET(request: Request) {
  const templates = await getRegistryTemplates();
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  if (limitParam !== null) {
    const limit = Math.min(
      Math.max(1, Number(limitParam) || templates.length),
      templates.length,
    );
    return NextResponse.json({ templates: templates.slice(0, limit) });
  }
  return NextResponse.json({ templates });
}
