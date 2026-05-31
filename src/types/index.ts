export interface FrontMatter {
  title: string;
  created: string;
  modified: string;
  tags: string[];
  icon?: string;
  order?: number;
  dir?: "ltr" | "rtl";
  google?: GoogleFrontmatter;
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
    | "docx"
    | "xlsx"
    | "pptx"
    | "notebook"
    | "unknown";
  hasRepo?: boolean;
  isLinked?: boolean;
  frontmatter?: Partial<FrontMatter>;
  children?: TreeNode[];
}

export interface PageData {
  path: string;
  content: string;
  frontmatter: FrontMatter;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export * from "./update";
