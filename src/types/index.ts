export interface FrontMatter {
  /** Free-form classification (Obsidian-style). Defaults to "Untyped". */
  type: string;
  title: string;
  created: string;
  modified: string;
  tags: string[];
  icon?: string;
  order?: number;
  dir?: "ltr" | "rtl";
  google?: GoogleFrontmatter;
  /** Set on pages imported from Apple Notes — the upsert key for re-import. */
  appleNotes?: AppleNotesFrontmatter;
  /** Arbitrary user-defined frontmatter properties (Obsidian-style). */
  [key: string]: unknown;
}

export interface AppleNotesFrontmatter {
  /** AppleScript note id (x-coredata://…/ICNote/p<rowid>) — stable across edits. */
  id: string;
  /** The note's modification date in Notes.app (ISO 8601). Newer wins on re-import. */
  modified: string;
}

export interface GoogleFrontmatter {
  /** sheets | slides | docs | forms | drive (auto-detected if omitted). */
  kind?: "sheets" | "slides" | "docs" | "forms" | "drive";
  /** Public or shareable Google URL. Required. */
  url: string;
  /** Optional override when the auto-computed embed URL doesn't work. */
  embedUrl?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type:
    | "file"
    | "directory"
    | "cabinet"
    | "website"
    | "app"
    | "pdf"
    | "csv"
    | "code"
    | "image"
    | "video"
    | "audio"
    | "mermaid"
    | "drawio"
    | "excalidraw"
    | "docx"
    | "xlsx"
    | "pptx"
    | "notebook"
    | "latex"
    | "typst"
    | "model3d"
    | "unknown";
  hasRepo?: boolean;
  isLinked?: boolean;
  /** "google-drive" when the node comes from a Drive for Desktop mount. */
  source?: "google-drive";
  /**
   * Set when the node is (or sits under) an inline Connect Knowledge mount.
   * `knowledgeProvider` marks the mount node itself (drives its brand icon);
   * `knowledgePolicy` is inherited by descendants so the UI can gate edits.
   * See docs/CONNECT_KNOWLEDGE_PRD.md §6.
   */
  knowledgeProvider?: "local" | "google-drive" | "icloud" | "onedrive" | "sharepoint" | "dropbox";
  knowledgePolicy?: "read-only" | "read-write";
  frontmatter?: Partial<FrontMatter>;
  children?: TreeNode[];
}

export interface GoogleDriveSection {
  mountId: string;
  folderName: string;
  absPath: string;
  /** The provider this mount belongs to (drives the section's brand icon). */
  provider?: "local" | "google-drive" | "icloud" | "onedrive" | "sharepoint" | "dropbox";
  children: TreeNode[];
}

export interface PageData {
  path: string;
  content: string;
  frontmatter: FrontMatter;
  /**
   * Directory whose files relative asset refs (./img.png, img.png) resolve
   * against. Equals `path` for directory pages (assets live next to
   * index.md); the PARENT directory for standalone .md pages (assets are
   * siblings of the file). Empty string = data root. Absent on older cached
   * payloads — consumers fall back to `path`.
   */
  assetBase?: string;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export * from "./update";
