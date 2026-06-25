import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { CABINET_INTERNAL_DIR } from "@/lib/storage/path-utils";
import { safeFetch } from "@/lib/net/ssrf-guard";

export const dynamic = "force-dynamic";

type BookmarkUrlNode = {
  id: string;
  name: string;
  type: "url";
  date_added: string;
  date_last_used: string;
  url: string;
  tags: string[];
  meta_info?: Record<string, string>;
};

type BookmarkFolderNode = {
  id: string;
  name: string;
  type: "folder";
  date_added: string;
  date_modified: string;
  children: BookmarkNode[];
};

type BookmarkNode = BookmarkUrlNode | BookmarkFolderNode;

type BookmarkRoots = {
  bookmark_bar: BookmarkFolderNode;
  other: BookmarkFolderNode;
};

type BookmarkFile = {
  checksum: string;
  roots: BookmarkRoots;
  version: 1;
};

type AddBookmarkPayload = {
  action: "addBookmark";
  name?: string;
  url: string;
  parentId?: string;
  tags?: string[];
};

type CreateFolderPayload = {
  action: "createFolder";
  name?: string;
  parentId?: string;
};

type MarkUsedPayload = {
  action: "markUsed";
  id: string;
};

type ResolveTitlePayload = {
  action: "resolveTitle";
  url: string;
};

type PostPayload = AddBookmarkPayload | CreateFolderPayload | MarkUsedPayload | ResolveTitlePayload;

const BOOKMARKS_PATH = path.join(CABINET_INTERNAL_DIR, "bookmarks.json");
const EPOCH_OFFSET_US = BigInt("11644473600000000");

function chromeNow(): string {
  return (BigInt(Date.now()) * BigInt(1000) + EPOCH_OFFSET_US).toString();
}

function computeChecksum(roots: BookmarkRoots, version: number): string {
  return crypto.createHash("sha1").update(JSON.stringify({ roots, version })).digest("hex");
}

function makeDefaultBookmarks(): BookmarkFile {
  const now = chromeNow();
  const roots: BookmarkRoots = {
    bookmark_bar: {
      id: "1",
      name: "Bookmarks bar",
      type: "folder",
      date_added: now,
      date_modified: now,
      children: [],
    },
    other: {
      id: "2",
      name: "Other bookmarks",
      type: "folder",
      date_added: now,
      date_modified: now,
      children: [],
    },
  };
  return {
    checksum: computeChecksum(roots, 1),
    roots,
    version: 1,
  };
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function sanitizeNode(input: unknown): BookmarkNode | null {
  const node = input as Partial<BookmarkNode> | null;
  if (!node || typeof node !== "object") return null;
  if (node.type === "url") {
    if (typeof node.id !== "string") return null;
    if (typeof node.name !== "string") return null;
    if (typeof (node as Partial<BookmarkUrlNode>).url !== "string") return null;
      return {
        id: node.id,
        name: node.name,
        type: "url",
        url: (node as Partial<BookmarkUrlNode>).url || "about:blank",
        date_added: typeof node.date_added === "string" ? node.date_added : chromeNow(),
        date_last_used: typeof (node as Partial<BookmarkUrlNode>).date_last_used === "string"
          ? (node as Partial<BookmarkUrlNode>).date_last_used as string
          : "0",
        tags: normalizeTags((node as Partial<BookmarkUrlNode>).tags),
        meta_info: typeof (node as Partial<BookmarkUrlNode>).meta_info === "object"
          ? (node as Partial<BookmarkUrlNode>).meta_info as Record<string, string>
          : undefined,
      };
  }
  if (node.type === "folder") {
    if (typeof node.id !== "string") return null;
    if (typeof node.name !== "string") return null;
    const childrenRaw: unknown[] = Array.isArray((node as Partial<BookmarkFolderNode>).children)
      ? ((node as Partial<BookmarkFolderNode>).children as unknown[])
      : [];
    const children = childrenRaw
      .map((child) => sanitizeNode(child))
      .filter((child): child is BookmarkNode => child !== null);
    return {
      id: node.id,
      name: node.name,
      type: "folder",
      date_added: typeof node.date_added === "string" ? node.date_added : chromeNow(),
      date_modified: typeof (node as Partial<BookmarkFolderNode>).date_modified === "string"
        ? (node as Partial<BookmarkFolderNode>).date_modified as string
        : chromeNow(),
      children,
    };
  }
  return null;
}

function sanitizeRootFolder(input: unknown, fallbackName: string, fallbackId: string): BookmarkFolderNode {
  const node = sanitizeNode(input);
  if (node?.type === "folder") {
    return node;
  }
  const now = chromeNow();
  return {
    id: fallbackId,
    name: fallbackName,
    type: "folder",
    date_added: now,
    date_modified: now,
    children: [],
  };
}

function sanitizeBookmarkFile(input: unknown): BookmarkFile {
  const raw = input as Partial<BookmarkFile> | null;
  if (!raw || typeof raw !== "object") {
    return makeDefaultBookmarks();
  }
  const rootsObj = (raw.roots ?? {}) as Partial<BookmarkRoots>;
  const roots: BookmarkRoots = {
    bookmark_bar: sanitizeRootFolder(rootsObj.bookmark_bar, "Bookmarks bar", "1"),
    other: sanitizeRootFolder(rootsObj.other, "Other bookmarks", "2"),
  };
  return {
    checksum: computeChecksum(roots, 1),
    roots,
    version: 1,
  };
}

async function readBookmarks(): Promise<BookmarkFile> {
  let raw: string;
  try {
    raw = await fs.readFile(BOOKMARKS_PATH, "utf-8");
  } catch (err) {
    // Only seed defaults when the file genuinely doesn't exist. A transient
    // read error (permissions, EBUSY, …) must NOT overwrite existing data, so
    // rethrow anything that isn't ENOENT.
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      const defaults = makeDefaultBookmarks();
      await writeBookmarks(defaults);
      return defaults;
    }
    throw err;
  }
  return sanitizeBookmarkFile(JSON.parse(raw));
}

async function writeBookmarks(bookmarks: BookmarkFile): Promise<void> {
  const payload: BookmarkFile = {
    ...bookmarks,
    version: 1,
    checksum: computeChecksum(bookmarks.roots, 1),
  };
  await fs.mkdir(path.dirname(BOOKMARKS_PATH), { recursive: true });
  // Atomic write: serialize to a temp file then rename over the target so a
  // crash mid-write can't truncate or corrupt the existing bookmarks file.
  const tmpPath = `${BOOKMARKS_PATH}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    await fs.rename(tmpPath, BOOKMARKS_PATH);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

// Serialize read-modify-write cycles so concurrent requests can't clobber each
// other's updates or hand out duplicate ids. Single-process in-memory mutex —
// each mutation waits for the previous one to settle.
let mutationQueue: Promise<unknown> = Promise.resolve();
function withBookmarkLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(fn, fn);
  mutationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function walkNodes(folder: BookmarkFolderNode, visit: (node: BookmarkNode, parent: BookmarkFolderNode) => void): void {
  for (const child of folder.children) {
    visit(child, folder);
    if (child.type === "folder") {
      walkNodes(child, visit);
    }
  }
}

function getNextId(file: BookmarkFile): string {
  let maxId = 0;
  const parseId = (value: string) => {
    const num = Number.parseInt(value, 10);
    if (Number.isFinite(num) && num > maxId) {
      maxId = num;
    }
  };
  parseId(file.roots.bookmark_bar.id);
  parseId(file.roots.other.id);
  walkNodes(file.roots.bookmark_bar, (node) => parseId(node.id));
  walkNodes(file.roots.other, (node) => parseId(node.id));
  return String(maxId + 1);
}

function findFolderById(file: BookmarkFile, folderId: string | undefined): BookmarkFolderNode {
  const fallback = file.roots.bookmark_bar;
  if (!folderId) return fallback;
  if (file.roots.bookmark_bar.id === folderId) return file.roots.bookmark_bar;
  if (file.roots.other.id === folderId) return file.roots.other;
  let found: BookmarkFolderNode | null = null;
  const tryFind = (root: BookmarkFolderNode) => {
    walkNodes(root, (node) => {
      if (found) return;
      if (node.type === "folder" && node.id === folderId) {
        found = node;
      }
    });
  };
  tryFind(file.roots.bookmark_bar);
  tryFind(file.roots.other);
  return found ?? fallback;
}

function findNodeAndParent(
  file: BookmarkFile,
  nodeId: string
): { node: BookmarkNode; parent: BookmarkFolderNode } | null {
  let found: { node: BookmarkNode; parent: BookmarkFolderNode } | null = null;
  const inspectRoot = (root: BookmarkFolderNode) => {
    walkNodes(root, (node, parent) => {
      if (found) return;
      if (node.id === nodeId) {
        found = { node, parent };
      }
    });
  };
  inspectRoot(file.roots.bookmark_bar);
  inspectRoot(file.roots.other);
  return found;
}

function normalizeName(value: string | undefined, fallback: string): string {
  const next = value?.trim();
  return next && next.length > 0 ? next : fallback;
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "about:blank";
  if (trimmed.toLowerCase() === "about:blank") return "about:blank";
  // Protocol-relative → assume https.
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  // host:port (e.g. localhost:3000, 127.0.0.1:8080) — the colon is a port
  // separator, not a URL scheme, so keep the target and prefix https.
  if (/^[a-zA-Z0-9.-]+:\d+(?:[/?#]|$)/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z\d+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    // Only allow web schemes; reject file:, javascript:, data:, etc. so a
    // dangerous URL can't be persisted and later navigated to.
    if (scheme === "http" || scheme === "https") return trimmed;
    return "about:blank";
  }
  return `https://${trimmed}`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([\da-fA-F]+);/g, (_match, hex) => {
      const codepoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codepoint)) return _match;
      try {
        return String.fromCodePoint(codepoint);
      } catch {
        return _match;
      }
    })
    .replace(/&#(\d+);/g, (_match, dec) => {
      const codepoint = Number.parseInt(dec, 10);
      if (!Number.isFinite(codepoint)) return _match;
      try {
        return String.fromCodePoint(codepoint);
      } catch {
        return _match;
      }
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function extractTitleFromHtml(html: string): string | null {
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const source = headMatch?.[1] ?? html;
  const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return null;
  const cleaned = decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

// Cap the HTML we read while sniffing a <title> — it lives in <head>, so a
// few hundred KB is plenty and protects against a hostile/huge response.
const TITLE_FETCH_MAX_BYTES = 512 * 1024;

async function resolveBookmarkTitle(nextUrl: string): Promise<string | null> {
  try {
    // SSRF guard: http(s) only, no private/loopback hosts (re-validated across
    // redirects), with a timeout and a bounded read so this server-side fetch
    // of a user-supplied URL can't be abused.
    const result = await safeFetch(nextUrl, {
      method: "GET",
      timeoutMs: 8000,
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
    if (result.status < 200 || result.status >= 300) {
      result.dispose();
      return null;
    }
    const html = await result.readText(TITLE_FETCH_MAX_BYTES);
    return extractTitleFromHtml(html);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const bookmarks = await readBookmarks();
    return NextResponse.json(bookmarks);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read bookmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as PostPayload;

    // resolveTitle performs no file mutation — handle it outside the lock so a
    // slow title fetch can't block other bookmark writes.
    if (payload.action === "resolveTitle") {
      const nextUrl = normalizeUrl(payload.url);
      const title = await resolveBookmarkTitle(nextUrl);
      return NextResponse.json({ ok: true, title });
    }

    // For addBookmark, resolve the name (possibly a network fetch) before
    // taking the lock so we hold it only for the read-modify-write.
    let resolvedName: string | null = null;
    let normalizedAddUrl: string | null = null;
    if (payload.action === "addBookmark") {
      normalizedAddUrl = normalizeUrl(payload.url);
      const requestedName = payload.name?.trim();
      // Honor a user-supplied name verbatim; only fetch the page title when the
      // user didn't provide one (avoids clobbering edits and the round-trip).
      if (requestedName && requestedName.length > 0) {
        resolvedName = requestedName;
      } else {
        const fetchedTitle = await resolveBookmarkTitle(normalizedAddUrl);
        resolvedName = fetchedTitle ?? normalizedAddUrl;
      }
    }

    return await withBookmarkLock(async () => {
      const bookmarks = await readBookmarks();
      const now = chromeNow();

      if (payload.action === "addBookmark") {
        const targetFolder = findFolderById(bookmarks, payload.parentId);
        const node: BookmarkUrlNode = {
          id: getNextId(bookmarks),
          name: resolvedName ?? (normalizedAddUrl as string),
          type: "url",
          url: normalizedAddUrl as string,
          date_added: now,
          date_last_used: "0",
          tags: normalizeTags(payload.tags),
        };
        targetFolder.children.push(node);
        targetFolder.date_modified = now;
        await writeBookmarks(bookmarks);
        return NextResponse.json({ ok: true, bookmarks, node });
      }

      if (payload.action === "createFolder") {
        const targetFolder = findFolderById(bookmarks, payload.parentId);
        const folder: BookmarkFolderNode = {
          id: getNextId(bookmarks),
          name: normalizeName(payload.name, "New Folder"),
          type: "folder",
          date_added: now,
          date_modified: now,
          children: [],
        };
        targetFolder.children.push(folder);
        targetFolder.date_modified = now;
        await writeBookmarks(bookmarks);
        return NextResponse.json({ ok: true, bookmarks, node: folder });
      }

      if (payload.action === "markUsed") {
        const found = findNodeAndParent(bookmarks, payload.id);
        if (!found || found.node.type !== "url") {
          return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
        }
        found.node.date_last_used = now;
        found.parent.date_modified = now;
        await writeBookmarks(bookmarks);
        return NextResponse.json({ ok: true, bookmarks });
      }

      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update bookmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = (await request.json()) as { id?: string; name?: string; url?: string; tags?: unknown; parentId?: string };
    if (!payload.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    return await withBookmarkLock(async () => {
      const bookmarks = await readBookmarks();
      const found = findNodeAndParent(bookmarks, payload.id!);
      if (!found) {
        return NextResponse.json({ error: "Node not found" }, { status: 404 });
      }
      const now = chromeNow();
      found.node.name = normalizeName(payload.name, found.node.name);
      if (found.node.type === "url") {
        if (typeof payload.url === "string") {
          found.node.url = normalizeUrl(payload.url);
        }
        if (payload.tags !== undefined) {
          found.node.tags = normalizeTags(payload.tags);
        }
        if (typeof payload.parentId === "string") {
          const targetFolder = findFolderById(bookmarks, payload.parentId);
          if (targetFolder.id !== found.parent.id) {
            found.parent.children = found.parent.children.filter((child) => child.id !== found.node.id);
            targetFolder.children.push(found.node);
            targetFolder.date_modified = now;
          }
        }
      }
      found.parent.date_modified = now;
      await writeBookmarks(bookmarks);
      return NextResponse.json({ ok: true, bookmarks });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to patch bookmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = (await request.json()) as { id?: string };
    if (!payload.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    return await withBookmarkLock(async () => {
      const bookmarks = await readBookmarks();
      const found = findNodeAndParent(bookmarks, payload.id!);
      if (!found) {
        return NextResponse.json({ error: "Node not found" }, { status: 404 });
      }
      const now = chromeNow();
      found.parent.children = found.parent.children.filter((child) => child.id !== payload.id);
      found.parent.date_modified = now;
      await writeBookmarks(bookmarks);
      return NextResponse.json({ ok: true, bookmarks });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete bookmark";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
