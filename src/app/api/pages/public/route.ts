import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import { resolveContentPath, DATA_DIR, DATA_PARENT_DIR } from "@/lib/storage/path-utils";
import { getActiveCabinetName } from "@/lib/runtime/runtime-config";
import { fileExists } from "@/lib/storage/fs-operations";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { path: virtualPath, public: isPublic } = body as { path?: string; public?: boolean };

    if (typeof virtualPath !== "string" || typeof isPublic !== "boolean") {
      return NextResponse.json({ error: "Invalid path or public parameter" }, { status: 400 });
    }

    const resolved = resolveContentPath(virtualPath);
    const activeCabinetName = getActiveCabinetName();
    const guestRoomPath = path.join(DATA_PARENT_DIR, "Guest Room");

    // Try finding the actual file
    const indexPath = path.join(resolved, "index.md");
    const mdPath = resolved.endsWith(".md") ? resolved : `${resolved}.md`;
    const mdxPath = resolved.endsWith(".mdx") ? resolved : `${resolved}.mdx`;

    let filePath = "";
    let isDir = false;
    let targetIsMarkdown = false;

    if (await fileExists(mdxPath)) {
      filePath = mdxPath;
      targetIsMarkdown = true;
    } else if (await fileExists(mdPath)) {
      filePath = mdPath;
      targetIsMarkdown = true;
    } else if (await fileExists(indexPath)) {
      filePath = indexPath;
      targetIsMarkdown = true;
    } else if (await fileExists(resolved)) {
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        isDir = true;
        // Check for sibling folder page
        const dirMd = `${resolved}.md`;
        const dirMdx = `${resolved}.mdx`;
        if (await fileExists(dirMdx)) {
          filePath = dirMdx;
          targetIsMarkdown = true;
        } else if (await fileExists(dirMd)) {
          filePath = dirMd;
          targetIsMarkdown = true;
        } else {
          return NextResponse.json({ error: "Folder has no associated sibling markdown page" }, { status: 400 });
        }
      } else {
        filePath = resolved;
        targetIsMarkdown = false;
      }
    } else {
      filePath = resolved;
      targetIsMarkdown = false;
    }

    // Determine metadata file path
    let metaFilePath = filePath;
    if (!targetIsMarkdown && !isDir) {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      metaFilePath = path.join(dir, `.${base}.md`);
    }

    // Update frontmatter
    let currentFm: Record<string, unknown> = {};
    let fileContent = "";

    if (await fileExists(metaFilePath)) {
      const raw = await fs.readFile(metaFilePath, "utf-8");
      const parsed = matter(raw);
      currentFm = parsed.data || {};
      fileContent = parsed.content || "";
    }

    currentFm.public = isPublic;

    // If writing a new sibling hidden markdown file, add empty content
    if (fileContent === "" && metaFilePath !== filePath) {
      fileContent = "\n";
    }

    const newFileContent = matter.stringify(fileContent, currentFm);
    await fs.writeFile(metaFilePath, newFileContent, "utf-8");

    // Copy or delete the file in Guest Room cabinet
    const relativePath = path.relative(DATA_DIR, filePath);
    const targetPath = path.join(guestRoomPath, activeCabinetName, relativePath);

    if (isPublic) {
      await fs.mkdir(guestRoomPath, { recursive: true });
      await scaffoldCabinet(guestRoomPath, { name: "Guest Room", kind: "root", skipExisting: true });

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(filePath, targetPath);
    } else {
      try {
        if (await fileExists(targetPath)) {
          await fs.unlink(targetPath);
        }
        // Clean up empty directories recursively up to guestRoomActiveCabinetPath
        let currentDir = path.dirname(targetPath);
        const limitDir = path.join(guestRoomPath, activeCabinetName);
        while (currentDir !== limitDir && currentDir.startsWith(limitDir)) {
          const files = await fs.readdir(currentDir);
          if (files.length === 0) {
            await fs.rmdir(currentDir);
            currentDir = path.dirname(currentDir);
          } else {
            break;
          }
        }
      } catch {
        // Ignore errors during deletion
      }
    }

    invalidateTreeCache();

    // Trigger background sync to GitHub, without blocking the client response.
    const appOrigin = process.env.CABINET_APP_ORIGIN || "http://127.0.0.1:4000";
    fetch(`${appOrigin}/api/pages/public/sync`, { method: "POST" }).catch((err) => {
      console.error("Failed to trigger automatic background sync:", err);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
