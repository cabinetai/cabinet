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
 * Agents writing inside a sub-cabinet record paths CABINET-relative
 * ("kb/reports/foo.md"), not DATA_DIR-relative
 * ("zeropoint-capital/kb/reports/foo.md"). Pass `cabinetPath` so the
 * cabinet prefix gets added when it's missing — without this,
 * `loadPage("kb/reports/foo")` fetches `/api/pages/kb/...` which 404s
 * under any non-root cabinet (manifested as a permanently blank editor
 * when an artifact is clicked from a task panel).
 *
 * Idempotent — safe to apply twice. Safe to call with `cabinetPath`
 * omitted for root-cabinet (".") paths.
 */
export function artifactPathToTreePath(path: string, cabinetPath?: string): string {
  if (!path) return path;
  let next = path.trim();
  next = next.replace(/^\/+/, "");
  if (next.startsWith("data/")) next = next.slice(5);
  next = next.replace(/\/index\.md$/, "");
  next = next.replace(/\/index\.html$/, "");
  next = next.replace(/\.md$/, "");
  // External (absolute-system) artifact paths must NOT get the cabinet
  // prefix — they live outside DATA_DIR and the page API can't read them.
  // See isExternalArtifactPath for the heuristic. Callers should check
  // isExternalArtifactPath first and short-circuit the navigation; this
  // guard is a backstop in case they don't.
  if (
    !isExternalArtifactPath(path) &&
    cabinetPath &&
    cabinetPath !== "." &&
    next !== cabinetPath &&
    !next.startsWith(`${cabinetPath}/`)
  ) {
    next = `${cabinetPath}/${next}`;
  }
  return next;
}

/**
 * macOS/Linux system-root segments that an artifact path under DATA_DIR
 * could never legitimately start with. Used to detect absolute filesystem
 * paths an agent recorded as artifacts (e.g. files it wrote to Claude
 * Code's auto-memory dir at `/Users/.../.claude/projects/.../memory/`).
 * The page API path-traversal guard refuses anything outside DATA_DIR, so
 * these would silently 404 if we tried to render them through the editor.
 */
const EXTERNAL_PATH_ROOTS = new Set([
  "Users",
  "home",
  "private",
  "tmp",
  "var",
  "etc",
  "opt",
  "bin",
  "sbin",
  "lib",
  "usr",
  "dev",
  "Volumes",
  "Library",
  "Applications",
  "System",
]);

/**
 * True when an artifact path points outside the cabinet's DATA_DIR. Such
 * paths can't be rendered through the page API — callers should either
 * disable navigation or surface a clear "outside cabinet" message instead
 * of letting the editor render blank.
 */
export function isExternalArtifactPath(path: string): boolean {
  if (!path) return false;
  const trimmed = path.trim();
  // Windows drive prefixes (C:/, D:\, ...) are unambiguously absolute.
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true;
  const noSlashes = trimmed.replace(/^\/+/, "");
  if (noSlashes.startsWith("data/")) return false;
  const firstSeg = noSlashes.split("/", 1)[0] ?? "";
  return EXTERNAL_PATH_ROOTS.has(firstSeg);
}
