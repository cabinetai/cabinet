import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { scanCabinet, resolvePageBySlug } from "@/lib/storage/references";
import { readPage } from "@/lib/storage/page-io";
import { virtualPathFromFs } from "@/lib/storage/path-utils";
import { slugifyPageName, findWikiLinkOccurrences } from "@/lib/markdown/wiki-links";

// Helper to extract outgoing link paths from markdown
function extractOutgoingLinks(markdown: string, currentPagePath: string, pages: { path: string; name: string }[]): string[] {
  const outgoing = new Set<string>();

  // 1. Wiki Links
  const wikiOccs = findWikiLinkOccurrences(markdown);
  for (const occ of wikiOccs) {
    const slug = slugifyPageName(occ.inner);
    const resolvedPath = resolvePageBySlug(slug, currentPagePath, pages);
    if (resolvedPath && resolvedPath !== currentPagePath) {
      outgoing.add(resolvedPath);
    }
  }

  // 2. Standard markdown links
  const stdLinks = [...markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  for (const m of stdLinks) {
    const href = m[2];
    // Ignore external URLs
    if (/^(https?|mailto|tel|file):/i.test(href)) {
      continue;
    }
    // Clean up the href: strip .md extension, leading ./ or /
    const linkPath = href
      .replace(/\.md$/, "")
      .replace(/^\.\//, "")
      .replace(/^\//, "");

    // Try to resolve
    // A. Check exact path in pages
    const exactMatch = pages.find((p) => p.path === linkPath);
    if (exactMatch) {
      if (exactMatch.path !== currentPagePath) outgoing.add(exactMatch.path);
      continue;
    }

    // B. Check relative to current page's directory
    const parentDir = currentPagePath.includes("/")
      ? currentPagePath.substring(0, currentPagePath.lastIndexOf("/"))
      : "";
    const relativePath = parentDir ? parentDir + "/" + linkPath : linkPath;
    const relMatch = pages.find((p) => p.path === relativePath);
    if (relMatch) {
      if (relMatch.path !== currentPagePath) outgoing.add(relMatch.path);
      continue;
    }

    // C. Check by slug
    const slug = linkPath.includes("/") ? linkPath.split("/").pop()! : linkPath;
    const resolvedPath = resolvePageBySlug(slugifyPageName(slug), currentPagePath, pages);
    if (resolvedPath && resolvedPath !== currentPagePath) {
      outgoing.add(resolvedPath);
    }
  }

  return Array.from(outgoing);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pagePath = searchParams.get("path");
    if (!pagePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    // 1. Scan cabinet to find all pages and their files
    const { pages, markdownFiles } = await scanCabinet();

    // 2. Load and cache the content and title of each markdown file to avoid multiple reads
    const fileContents = new Map<string, { content: string; title: string; virtualPath: string }>();

    for (const fsPath of markdownFiles) {
      try {
        const raw = await fs.readFile(fsPath, "utf8");
        const { content, data } = matter(raw);
        
        const vPath = virtualPathFromFs(fsPath);
        const virtualPagePath = vPath.endsWith("/index.md")
          ? vPath.slice(0, -"/index.md".length)
          : vPath.replace(/\.md$/, "");

        const title = (typeof data.title === "string" && data.title.trim())
          ? data.title
          : path.basename(fsPath, ".md");

        fileContents.set(virtualPagePath, { content, title, virtualPath: virtualPagePath });
      } catch {
        // ignore read failures for specific files
      }
    }

    const currentPageData = fileContents.get(pagePath);
    if (!currentPageData) {
      return NextResponse.json({ incoming: [], outgoing: [] });
    }

    // 3. Extract outgoing links from the current page
    const outgoingPaths = extractOutgoingLinks(currentPageData.content, pagePath, pages);
    const outgoing = outgoingPaths.map((p) => {
      const match = fileContents.get(p);
      return {
        path: p,
        title: match ? match.title : p.split("/").pop() || p,
      };
    });

    // 4. Find incoming links (backlinks) by scanning other pages
    const incoming: { path: string; title: string }[] = [];
    for (const [otherPath, otherData] of fileContents.entries()) {
      if (otherPath === pagePath) continue;

      const otherOutgoings = extractOutgoingLinks(otherData.content, otherPath, pages);
      if (otherOutgoings.includes(pagePath)) {
        incoming.push({
          path: otherPath,
          title: otherData.title,
        });
      }
    }

    return NextResponse.json({ incoming, outgoing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
