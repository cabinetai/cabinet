import fs from "fs/promises";
import path from "path";
import type { TreeNode, GoogleDriveSection, GoogleFrontmatter } from "@/types";
import { encodeDrivePath } from "./paths";

export { encodeDrivePath, decodeDrivePath, GDRIVE_PREFIX } from "./paths";

// Extensions for native Google Workspace shortcut files created by Drive for Desktop.
const GOOGLE_NATIVE: Record<string, GoogleFrontmatter["kind"]> = {
  ".gdoc": "docs",
  ".gsheet": "sheets",
  ".gslide": "slides",
  ".gform": "forms",
};

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Parse a .gdoc / .gsheet / .gslide shortcut file and return its Google URL.
async function parseGoogleShortcut(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.url === "string") return data.url;
  } catch {
    // not parseable — skip
  }
  return null;
}

async function buildDriveNodes(
  dirPath: string,
  visited = new Set<string>()
): Promise<TreeNode[]> {
  let realPath = dirPath;
  try {
    realPath = await fs.realpath(dirPath);
  } catch {
    // fall back
  }
  if (visited.has(realPath)) return [];
  const nextVisited = new Set(visited);
  nextVisited.add(realPath);

  let names: string[];
  try {
    names = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const nodes: TreeNode[] = [];

  for (const name of names) {
    if (name.startsWith(".") || name === "Icon\r") continue;

    const fullPath = path.join(dirPath, name);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }

    // Use the absolute filesystem path as node.path (prefixed with gdrive:).
    // This avoids :// URL-routing issues and lets us reconstruct the abs path trivially.
    const nodePath = encodeDrivePath(fullPath);

    if (stat.isDirectory()) {
      const children = await buildDriveNodes(fullPath, nextVisited);
      nodes.push({
        name,
        path: nodePath,
        type: "directory",
        source: "google-drive",
        frontmatter: { title: name },
        children,
      });
      continue;
    }

    if (!stat.isFile()) continue;

    const ext = path.extname(name).toLowerCase();
    const baseName = path.basename(name, ext);

    // Native Google Workspace shortcuts — parse URL, no content to serve
    if (GOOGLE_NATIVE[ext]) {
      const url = await parseGoogleShortcut(fullPath);
      if (url) {
        nodes.push({
          name,
          path: nodePath,
          type: "file",
          source: "google-drive",
          frontmatter: {
            title: baseName,
            google: { kind: GOOGLE_NATIVE[ext], url },
          },
        });
      }
      continue;
    }

    // Classify known file types — all use the same nodePath (abs path with prefix)
    const typeMap: Record<string, TreeNode["type"]> = {
      ".pdf": "pdf",
      ".md": "file",
      ".txt": "file",
      ".png": "image",
      ".jpg": "image",
      ".jpeg": "image",
      ".gif": "image",
      ".webp": "image",
      ".svg": "image",
      ".docx": "docx",
      ".xlsx": "xlsx",
      ".xlsm": "xlsx",
      ".pptx": "pptx",
      ".csv": "csv",
      ".ipynb": "notebook",
    };

    const fileType = typeMap[ext];
    if (fileType) {
      nodes.push({
        name,
        path: nodePath,
        type: fileType,
        source: "google-drive",
        frontmatter: { title: baseName },
      });
    }
    // Unknown types are silently skipped
  }

  // Sort: directories first, then alphabetically
  nodes.sort((a, b) => {
    const aIsDir = a.type === "directory" ? 0 : 1;
    const bIsDir = b.type === "directory" ? 0 : 1;
    if (aIsDir !== bIsDir) return aIsDir - bIsDir;
    return (a.frontmatter?.title || a.name).localeCompare(b.frontmatter?.title || b.name);
  });

  return nodes;
}

export async function buildGoogleDriveTree(
  mounts: { id: string; abs_path: string; folder_name: string }[]
): Promise<GoogleDriveSection[]> {
  const sections: GoogleDriveSection[] = [];
  for (const mount of mounts) {
    if (!(await exists(mount.abs_path))) continue;
    const children = await buildDriveNodes(mount.abs_path);
    sections.push({
      mountId: mount.id,
      folderName: mount.folder_name,
      absPath: mount.abs_path,
      children,
    });
  }
  return sections;
}
