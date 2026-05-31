import { NextRequest, NextResponse } from "next/server";
import { readPage } from "@/lib/storage/page-io";
import { inferPageTypeFromPath, type PageTypeKind } from "@/lib/ui/page-type-icons";

interface PageMetaEntry {
  path: string;
  title: string;
  type: PageTypeKind;
}

/**
 * Resolve a list of KB page paths to { path, title, type } entries.
 *
 *   POST body: { paths: string[] }
 *   Response: { entries: PageMetaEntry[] }
 *
 * Paths that can't be read fall back to their basename as title + inferred
 * page type from the file extension.
 */
export async function POST(req: NextRequest) {
  let body: { paths?: string[] } = {};
  try {
    body = (await req.json()) as { paths?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paths = (body.paths ?? []).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );

  const entries: PageMetaEntry[] = await Promise.all(
    paths.map(async (pagePath): Promise<PageMetaEntry> => {
      try {
        const page = await readPage(pagePath);
        return {
          path: pagePath,
          title: page.frontmatter.title || basename(pagePath),
          type: inferPageTypeFromPath(pagePath),
        };
      } catch {
        return {
          path: pagePath,
          title: basename(pagePath),
          type: inferPageTypeFromPath(pagePath),
        };
      }
    })
  );

  return NextResponse.json({ entries });
}

function basename(p: string): string {
  const cleaned = p.replace(/\/index\.md$/, "").replace(/\.md$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  return parts[parts.length - 1] || p;
}
