import {
  AppWindow,
  Archive,
  Code,
  File,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  Image,
  Link2,
  Music,
  Table,
  Video,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type PageTypeKind =
  | "csv"
  | "pdf"
  | "app"
  | "website"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "mermaid"
  | "drawio"
  | "excalidraw"
  | "cabinet"
  | "markdown"
  | "unknown"
  | "folder"
  | "folder-open"
  | "linked"
  | "repo";

interface IconConfig {
  icon: LucideIcon;
  color: string;
}

const ICONS: Record<PageTypeKind, IconConfig> = {
  csv: { icon: Table, color: "text-green-400" },
  pdf: { icon: FileType, color: "text-red-400" },
  app: { icon: AppWindow, color: "text-emerald-400" },
  website: { icon: Globe, color: "text-blue-400" },
  code: { icon: Code, color: "text-violet-400" },
  image: { icon: Image, color: "text-pink-400" },
  video: { icon: Video, color: "text-cyan-400" },
  audio: { icon: Music, color: "text-amber-400" },
  mermaid: { icon: Workflow, color: "text-teal-400" },
  drawio: { icon: Workflow, color: "text-orange-400" },
  excalidraw: { icon: Workflow, color: "text-indigo-400" },
  cabinet: { icon: Archive, color: "text-amber-400" },
  markdown: { icon: FileText, color: "text-muted-foreground" },
  unknown: { icon: File, color: "text-muted-foreground/50" },
  folder: { icon: Folder, color: "text-muted-foreground" },
  "folder-open": { icon: FolderOpen, color: "text-muted-foreground" },
  linked: { icon: Link2, color: "text-blue-400" },
  repo: { icon: GitBranch, color: "text-orange-400" },
};

export function pageTypeIcon(kind: PageTypeKind): LucideIcon {
  return ICONS[kind].icon;
}

export function pageTypeColor(kind: PageTypeKind): string {
  return ICONS[kind].color;
}

/**
 * Infer a PageTypeKind from a KB page path — used when we only have a path
 * string (e.g. parsed from an ARTIFACT: line) and haven't loaded the page
 * frontmatter yet.
 */
export function inferPageTypeFromPath(path: string): PageTypeKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".mmd") || lower.endsWith(".mermaid")) return "mermaid";
  if (lower.endsWith(".drawio") || lower.endsWith(".dio") || lower.endsWith(".drawio.svg")) return "drawio";
  if (lower.endsWith(".excalidraw") || lower.endsWith(".excalidraw.svg")) return "excalidraw";
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(lower)) return "image";
  if (/\.(mp4|mov|webm|avi|mkv)$/.test(lower)) return "video";
  if (/\.(mp3|wav|ogg|flac|m4a)$/.test(lower)) return "audio";
  if (/\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cpp|cs|php|sh|html|css)$/.test(lower)) {
    return "code";
  }
  if (lower.endsWith(".md") || lower.endsWith("index.md") || lower.endsWith("/")) {
    return "markdown";
  }
  return "unknown";
}

/**
 * Normalize an agent-authored artifact path so it matches the KB tree's
 * canonical `selectedPath` format. Tree nodes are rooted AT `data/` and
 * drop `.md` / `/index.md` extensions, so e.g. `data/have-fun/bellatrix.md`
 * must be rewritten to `have-fun/bellatrix` before calling `selectPage`.
 *
 * Idempotent — safe to apply twice.
 */
export function artifactPathToTreePath(path: string): string {
  if (!path) return path;
  let next = path.trim();
  next = next.replace(/^\/+/, "");
  if (next.startsWith("data/")) next = next.slice(5);
  next = next.replace(/\/index\.md$/, "");
  next = next.replace(/\/index\.html$/, "");
  next = next.replace(/\.md$/, "");
  return next;
}

/**
 * Resolve an agent-authored artifact path to the full, `data/`-rooted tree path
 * the sidebar + `/room/<path>` URL scheme expect.
 *
 * Agents run with cwd `DATA_DIR/<cabinetPath>` (see conversation-runner's
 * `baseCwd`), so the artifact paths they report are RELATIVE TO that cwd —
 * e.g. `github/contributors.md` for a task whose `cabinetPath` is
 * `hilas-home/cabinet-data/dev`. Tree nodes are rooted at `data/`, so the
 * cwd-relative path must be re-rooted to
 * `hilas-home/cabinet-data/dev/github/contributors` before it can address the
 * tree. Without this the first segment is mistaken for a top-level room
 * (`/room/github/...`) and the page 404s to a "create page" prompt.
 *
 * Idempotent and defensive:
 *   - normalizes via {@link artifactPathToTreePath} (strips `data/`, `.md`, …)
 *   - no-ops when `cabinetPath` is missing or the root cabinet (`.`)
 *   - never double-prefixes a path that is already cabinet-rooted
 *   - never prefixes an external (absolute-system) path — see
 *     {@link isExternalArtifactPath}
 */
export function resolveArtifactTreePath(
  path: string,
  cabinetPath?: string | null
): string {
  const treePath = artifactPathToTreePath(path);
  if (!treePath) return treePath;
  // External (absolute-system) paths live outside DATA_DIR; the page API
  // can't read them, so grafting a cabinet prefix on would just produce a
  // bogus tree path. Callers should short-circuit navigation via
  // isExternalArtifactPath; this is a backstop so resolution never lies.
  if (isExternalArtifactPath(path)) return treePath;
  const base = (cabinetPath ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!base || base === ".") return treePath;
  if (treePath === base || treePath.startsWith(`${base}/`)) return treePath;
  return `${base}/${treePath}`;
}

/**
 * True when an artifact path points outside the cabinet's DATA_DIR — i.e. it's
 * an *absolute* filesystem path rather than a cabinet-relative one. Such paths
 * (e.g. files an agent wrote to Claude Code's auto-memory at
 * `/Users/.../.claude/projects/.../memory/`) can't be read through the page
 * API, whose path-traversal guard refuses anything outside DATA_DIR — so
 * callers should surface an "outside cabinet" message instead of letting the
 * editor render blank.
 *
 * This tests the *logical* property "is this absolute?", not a denylist of
 * system directory names. The forms that are unambiguously absolute:
 *   - POSIX-absolute (`/…`), except the `/data` cabinet-root alias
 *   - home-relative (`~/…`)
 *   - Windows drive (`C:\…`, `C:/…`) or UNC (`\\host\share`)
 * Anything else is cabinet-relative and therefore internal — even when its
 * first segment happens to be a name like `var`, `lib`, or `dev` (which a
 * denylist would wrongly flag, breaking a real in-cabinet folder).
 */
export function isExternalArtifactPath(path: string): boolean {
  const p = path?.trim();
  if (!p) return false;
  // Home-relative and Windows drive / UNC paths are unambiguously absolute.
  if (p.startsWith("~")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\")) return true;
  // POSIX-absolute. `/data` (and `/data/…`) is the cabinet-root alias and is
  // internal; any other absolute path points outside DATA_DIR.
  if (p.startsWith("/")) {
    const rooted = p.replace(/^\/+/, "");
    return rooted !== "data" && !rooted.startsWith("data/");
  }
  return false;
}
