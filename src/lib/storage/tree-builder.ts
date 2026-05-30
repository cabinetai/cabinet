import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { createTtlCache, type TtlCache } from "@/lib/cache/ttl-cache";
import { CABINET_LINK_META_CANDIDATES, CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import type { TreeNode, GoogleFrontmatter } from "@/types";
import { DATA_DIR, virtualPathFromFs, isHiddenEntry } from "./path-utils";
import { listDirectory, readFileContent, fileExists } from "./fs-operations";
import { ORDER_SIDECAR } from "./order-store";

const CODE_EXTENSIONS = new Set([
  // Notes and plain text
  ".txt", ".text", ".log", ".mdx", ".rst",
  // Web and app code
  ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".css", ".scss", ".html",
  // Mobile and native code
  ".swift", ".kt", ".kts", ".java", ".go", ".rs", ".c", ".cpp", ".h",
  // Backend and scripting
  ".py", ".rb", ".php", ".sh", ".bash", ".zsh", ".ps1",
  // Config and structured text
  ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".env", ".xml",
  // Query and schema files
  ".sql", ".graphql", ".gql", ".prisma",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".ico",
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".webm", ".mov", ".m4v",
]);

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".wav", ".ogg", ".m4a", ".aac",
]);

const MERMAID_EXTENSIONS = new Set([".mermaid", ".mmd"]);

// Office types that Cabinet can render inline.
const DOCX_EXTENSIONS = new Set([".docx"]);
const XLSX_EXTENSIONS = new Set([".xlsx", ".xlsm"]);
const PPTX_EXTENSIONS = new Set([".pptx"]);

// Jupyter notebooks. Rendered as a custom viewer that shows cells + outputs.
const NOTEBOOK_EXTENSIONS = new Set([".ipynb"]);

// Files that should appear in the sidebar as "unknown" with an Open in Finder fallback.
// Only common document/archive types that a user would intentionally put in a KB.
// Everything not in a known set is silently skipped.
const UNKNOWN_EXTENSIONS = new Set([
  // Legacy Office / proprietary formats we don't render inline yet
  ".doc", ".ppt", ".xls",
  ".pages", ".numbers", ".key", ".odt", ".ods", ".odp",
  // Archives
  ".zip", ".tar", ".tgz", ".gz", ".rar", ".7z",
  // Installers / packages
  ".dmg", ".pkg", ".apk", ".ipa", ".msi", ".deb", ".rpm",
  // Design
  ".fig", ".sketch", ".psd", ".ai", ".xd",
  // Other documents
  ".epub", ".mobi", ".rtf",
]);

function classifyFile(ext: string): TreeNode["type"] | null {
  if (NOTEBOOK_EXTENSIONS.has(ext)) return "notebook";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (MERMAID_EXTENSIONS.has(ext)) return "mermaid";
  if (DOCX_EXTENSIONS.has(ext)) return "docx";
  if (XLSX_EXTENSIONS.has(ext)) return "xlsx";
  if (PPTX_EXTENSIONS.has(ext)) return "pptx";
  if (UNKNOWN_EXTENSIONS.has(ext)) return "unknown";
  return null;
}

async function readFrontmatter(
  filePath: string
): Promise<Record<string, unknown>> {
  try {
    const raw = await readFileContent(filePath);
    const { data } = matter(raw);
    return data;
  } catch {
    return {};
  }
}

async function readCabinetMeta(
  dirPath: string
): Promise<Record<string, unknown>> {
  for (const filename of CABINET_LINK_META_CANDIDATES) {
    try {
      const raw = await readFileContent(path.join(dirPath, filename));
      const parsed = yaml.load(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      // Try the next metadata filename.
    }
  }

  return {};
}

async function readCabinetManifest(
  dirPath: string
): Promise<Record<string, unknown>> {
  try {
    const raw = await readFileContent(path.join(dirPath, CABINET_MANIFEST_FILE));
    const parsed = yaml.load(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function buildTreeRecursive(
  dirPath: string,
  ancestorRealPaths = new Set<string>(),
  showHidden = false
): Promise<TreeNode[]> {
  let realDirPath = dirPath;
  try {
    realDirPath = await fs.realpath(dirPath);
  } catch {
    // Fall back to the incoming path if realpath fails.
  }

  if (ancestorRealPaths.has(realDirPath)) {
    return [];
  }

  const nextAncestorRealPaths = new Set(ancestorRealPaths);
  nextAncestorRealPaths.add(realDirPath);

  const entries = await listDirectory(dirPath);
  const nodes: TreeNode[] = [];

  // Collect directory names so we can skip standalone .md files that collide.
  const dirNames = new Set(
    entries
      .filter((e) => e.isDirectory && (!isHiddenEntry(e.name) || showHidden))
      .map((e) => e.name)
  );

  // Read order sidecar for non-frontmatter files.
  let sidecarOrders: Record<string, number> = {};
  const sidecarPath = path.join(dirPath, ORDER_SIDECAR);
  if (await fileExists(sidecarPath)) {
    try {
      const raw = await readFileContent(sidecarPath);
      const parsed = yaml.load(raw);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "number") sidecarOrders[k] = v;
        }
      }
    } catch {
      sidecarOrders = {};
    }
  }

  for (const entry of entries) {
    if (!showHidden && isHiddenEntry(entry.name)) continue;
    if (entry.name === "CLAUDE.md") continue;
    if (entry.name === ORDER_SIDECAR) continue;

    const fullPath = path.join(dirPath, entry.name);
    const vPath = virtualPathFromFs(fullPath);

    if (entry.isDirectory) {
      const indexMd = path.join(fullPath, "index.md");
      const indexHtml = path.join(fullPath, "index.html");
      const hasIndexMd = await fileExists(indexMd);
      const hasIndexHtml = await fileExists(indexHtml);
      const hasCabinet = await fileExists(path.join(fullPath, CABINET_MANIFEST_FILE));

      const repoYaml = path.join(fullPath, ".repo.yaml");
      const hasRepo = await fileExists(repoYaml);
      const isLinked = entry.isSymlink || undefined;

      // Website or App: has index.html but no index.md
      if (hasIndexHtml && !hasIndexMd) {
        const appMarker = path.join(fullPath, ".app");
        const isApp = await fileExists(appMarker);
        nodes.push({
          name: entry.name,
          path: vPath,
          type: isApp ? "app" : "website",
          hasRepo: hasRepo || undefined,
          isLinked,
          frontmatter: {
            title: entry.name,
            order: sidecarOrders[entry.name],
          },
        });
        continue;
      }

      // Resolve metadata: prefer index.md frontmatter, fall back to linked-folder metadata.
      let fm: Record<string, unknown> = {};
      if (hasIndexMd) {
        fm = await readFrontmatter(indexMd);
      } else if (isLinked) {
        fm = await readCabinetMeta(fullPath);
      }
      const children = await buildTreeRecursive(fullPath, nextAncestorRealPaths, showHidden);

      nodes.push({
        name: entry.name,
        path: vPath,
        type: hasCabinet ? "cabinet" : "directory",
        hasRepo: hasRepo || undefined,
        isLinked,
        frontmatter: {
          title: (fm.title as string) || entry.name,
          icon: fm.icon as string | undefined,
          order: (fm.order as number | undefined) ?? sidecarOrders[entry.name],
          google: (fm.google ?? undefined) as GoogleFrontmatter | undefined,
        },
        children,
      });
    } else if (entry.name.toLowerCase().endsWith(".pdf")) {
      nodes.push({
        name: entry.name,
        path: vPath,
        type: "pdf",
        frontmatter: {
          title: entry.name.replace(/\.pdf$/i, ""),
          order: sidecarOrders[entry.name],
        },
      });
    } else if (entry.name.toLowerCase().endsWith(".csv")) {
      nodes.push({
        name: entry.name,
        path: vPath,
        type: "csv",
        frontmatter: {
          title: entry.name.replace(/\.csv$/i, ""),
          order: sidecarOrders[entry.name],
        },
      });
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const fileType = classifyFile(ext);
      if (fileType) {
        nodes.push({
          name: entry.name,
          path: vPath,
          type: fileType,
          frontmatter: {
            title: entry.name.replace(new RegExp(`\\${ext}$`, "i"), ""),
            order: sidecarOrders[entry.name],
          },
        });
        continue;
      }

    }

    if (entry.name.endsWith(".md") && entry.name !== "index.md") {
      // Skip standalone .md if a same-named directory exists (avoids duplicate keys).
      const baseName = entry.name.replace(/\.md$/, "");
      if (dirNames.has(baseName)) continue;

      const fm = await readFrontmatter(fullPath);
      nodes.push({
        name: entry.name,
        path: vPath.replace(/\.md$/, ""),
        type: "file",
        frontmatter: {
          title: (fm.title as string) || entry.name.replace(/\.md$/, ""),
          icon: fm.icon as string | undefined,
          order: fm.order as number | undefined,
          google: (fm.google ?? undefined) as GoogleFrontmatter | undefined,
        },
      });
    }
  }

  // Sort by order field, then alphabetically
  nodes.sort((a, b) => {
    const orderA = a.frontmatter?.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.frontmatter?.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.frontmatter?.title || a.name;
    const nameB = b.frontmatter?.title || b.name;
    return nameA.localeCompare(nameB);
  });

  return nodes;
}

// 5-second TTL cache. buildTree walks the full data/ tree (~6k files including
// the data/archive dump) and is fired multiple times per page load (sidebar,
// search, auto-link, composer). Short TTL means freshness after user edits
// self-heals within a few seconds.
//
// Pinned to globalThis (not a bare module-level const): Next bundles each API
// route handler with its OWN copy of this module, so a plain `const` would give
// the mutation routes (create-file, link-repo, …) a DIFFERENT cache instance
// than `/api/tree` reads — making invalidateTreeCache() a no-op across routes
// and forcing users to wait out the 5s TTL (or hit refresh) after every create.
// globalThis is one object per process, so all route bundles share this cache.
const globalForTree = globalThis as unknown as {
  __cabinetTreeCache?: TtlCache<TreeNode[]>;
};
const treeCache =
  globalForTree.__cabinetTreeCache ??
  (globalForTree.__cabinetTreeCache = createTtlCache<TreeNode[]>({ ttlMs: 5000 }));

export function invalidateTreeCache() {
  treeCache.invalidate();
}

export async function buildTree(showHidden = false): Promise<TreeNode[]> {
  return treeCache.get(showHidden ? "1" : "0", () => buildTreeUncached(showHidden));
}

async function buildTreeUncached(showHidden: boolean): Promise<TreeNode[]> {
  const children = await buildTreeRecursive(DATA_DIR, new Set<string>(), showHidden);
  const rootManifest = await readCabinetManifest(DATA_DIR);

  if (Object.keys(rootManifest).length === 0) {
    return children;
  }

  const rootIndexPath = path.join(DATA_DIR, "index.md");
  const rootFrontmatter = (await fileExists(rootIndexPath))
    ? await readFrontmatter(rootIndexPath)
    : {};

  return [
    {
      name:
        (typeof rootManifest.name === "string" && rootManifest.name.trim()) ||
        "Cabinet",
      path: ROOT_CABINET_PATH,
      type: "cabinet",
      frontmatter: {
        title:
          (rootFrontmatter.title as string | undefined) ||
          (rootManifest.name as string | undefined) ||
          "Cabinet",
        icon: rootFrontmatter.icon as string | undefined,
        order: rootFrontmatter.order as number | undefined,
      },
      children,
    },
  ];
}
