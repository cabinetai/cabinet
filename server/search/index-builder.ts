import { Document } from "flexsearch";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { DATA_DIR, isHiddenEntry } from "../../src/lib/storage/path-utils";
import { markdownToPlaintext, extractHeadings } from "../../src/lib/markdown/to-plaintext";
import type { IndexedPageRecord } from "./types";

type Doc = {
  id: string;
  title: string;
  headings: string;
  tags: string;
  body: string;
};

export class SearchIndex {
  private index: Document<Doc, false>;
  private records = new Map<string, IndexedPageRecord>();

  constructor() {
    this.index = new Document<Doc, false>({
      tokenize: "forward",
      cache: 100,
      document: {
        id: "id",
        index: ["title", "headings", "tags", "body"],
        store: false,
      },
    });
  }

  size(): number {
    return this.records.size;
  }

  get(id: string): IndexedPageRecord | undefined {
    return this.records.get(id);
  }

  listIds(): string[] {
    return Array.from(this.records.keys());
  }

  add(record: IndexedPageRecord): void {
    this.records.set(record.id, record);
    this.index.add({
      id: record.id,
      title: record.title,
      headings: record.headings,
      tags: record.tags,
      body: record.body,
    });
  }

  update(record: IndexedPageRecord): void {
    this.records.set(record.id, record);
    this.index.update({
      id: record.id,
      title: record.title,
      headings: record.headings,
      tags: record.tags,
      body: record.body,
    });
  }

  remove(id: string): void {
    if (!this.records.has(id)) return;
    this.records.delete(id);
    this.index.remove(id);
  }

  search(query: string, limit: number): Array<{ id: string; fields: string[] }> {
    const raw = this.index.search(query, {
      limit,
      merge: true,
      enrich: false,
    }) as unknown as Array<{ id: string; field?: string[] }>;

    return raw.map((entry) => ({
      id: String(entry.id),
      fields: (entry.field ?? []) as string[],
    }));
  }
}

export async function buildPageRecord(
  fsPath: string,
  virtualPath: string
): Promise<IndexedPageRecord | null> {
  let raw: string;
  try {
    raw = await fs.readFile(fsPath, "utf8");
  } catch {
    return null;
  }
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch {
    parsed = { data: {}, content: raw } as ReturnType<typeof matter>;
  }
  const data = parsed.data as Record<string, unknown>;
  const content = parsed.content;
  const plain = markdownToPlaintext(content);
  const headings = extractHeadings(content);
  const titleFromFrontmatter = typeof data.title === "string" ? data.title : null;
  const fallbackTitle = virtualPath.split("/").pop() || virtualPath;
  const title = titleFromFrontmatter || fallbackTitle;
  const tagList = Array.isArray(data.tags)
    ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const modified = typeof data.modified === "string" ? data.modified : undefined;
  const icon = typeof data.icon === "string" ? data.icon : undefined;

  return {
    id: virtualPath,
    title,
    path: virtualPath,
    headings: headings.join(" \n "),
    tags: tagList.join(" "),
    body: plain.text,
    lines: plain.lines,
    tagList,
    icon,
    modified,
  };
}

function toVirtualPath(fsPath: string): string {
  let v = fsPath.replace(DATA_DIR, "").replace(/^\//, "");
  v = v.replace(/\/index\.md$/, "");
  v = v.replace(/\.md$/, "");
  return v;
}

export async function walkDataDir(): Promise<Array<{ fsPath: string; virtualPath: string }>> {
  const out: Array<{ fsPath: string; virtualPath: string }> = [];
  // Resolved real paths already walked — guards against symlink cycles.
  const visited = new Set<string>();

  async function resolvesToDir(p: string): Promise<boolean> {
    try {
      // fs.stat follows symlinks; Dirent.isDirectory() does not.
      return (await fs.stat(p)).isDirectory();
    } catch {
      return false;
    }
  }

  async function walk(dir: string): Promise<void> {
    let real: string;
    try {
      real = await fs.realpath(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);

    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const indexMd = path.join(dir, "index.md");
    const indexHtml = path.join(dir, "index.html");
    const [hasIndexMd, hasIndexHtml] = await Promise.all([
      fileExists(indexMd),
      fileExists(indexHtml),
    ]);

    if (dir !== DATA_DIR && hasIndexHtml && !hasIndexMd) {
      return;
    }

    if (hasIndexMd) {
      out.push({ fsPath: indexMd, virtualPath: toVirtualPath(indexMd) });
    }

    for (const entry of entries) {
      if (isHiddenEntry(entry.name)) continue;
      if (entry.name === "CLAUDE.md") continue;
      const childPath = path.join(dir, entry.name);
      // Symlinked cabinet roots (e.g. data/cabinet-data -> ~/dev/cabinet-data)
      // surface in the sidebar tree; index them too. Dirent.isDirectory() is
      // false for a symlink, so resolve the target type explicitly.
      const isDirectory =
        entry.isDirectory() ||
        (entry.isSymbolicLink() && (await resolvesToDir(childPath)));
      if (isDirectory) {
        await walk(childPath);
      } else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
        out.push({ fsPath: childPath, virtualPath: toVirtualPath(childPath) });
      }
    }
  }

  await walk(DATA_DIR);
  return out;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function virtualPathFor(fsPath: string): string | null {
  if (!fsPath.startsWith(DATA_DIR)) return null;
  if (!fsPath.endsWith(".md")) return null;
  const base = path.basename(fsPath);
  if (base === "CLAUDE.md") return null;
  const rel = fsPath.slice(DATA_DIR.length).replace(/^\//, "");
  const segments = rel.split("/");
  if (segments.some((seg) => seg.startsWith(".") && seg !== base)) return null;
  return toVirtualPath(fsPath);
}
