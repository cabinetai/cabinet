import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import simpleGit from "simple-git";
import { DATA_DIR, DATA_PARENT_DIR } from "@/lib/storage/path-utils";
import { getActiveCabinetName } from "@/lib/runtime/runtime-config";
import { fileExists } from "@/lib/storage/fs-operations";
import { readCabinetEnvFile } from "@/lib/runtime/cabinet-env";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";

const IGNORED_DIRS = new Set(["node_modules", "__pycache__", ".venv", "dist", "build", "out", "coverage", ".git", ".home", ".cabinet-state", ".cabinet-cache"]);

async function getFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...(await getFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function cleanEmptyDirs(dir: string): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let isEmpty = true;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childEmpty = await cleanEmptyDirs(fullPath);
      if (childEmpty) {
        await fs.rmdir(fullPath);
      } else {
        isEmpty = false;
      }
    } else {
      isEmpty = false;
    }
  }
  return isEmpty;
}

export async function POST(req: NextRequest) {
  try {
    const activeCabinetName = getActiveCabinetName();
    if (activeCabinetName === "Guest Room") {
      return NextResponse.json({ ok: true, skipped: true, reason: "Active cabinet is Guest Room" });
    }

    const guestRoomPath = path.join(DATA_PARENT_DIR, "Guest Room");
    const guestRoomActiveCabinetPath = path.join(guestRoomPath, activeCabinetName);

    // Ensure Guest Room directories exist and are scaffolded
    await fs.mkdir(guestRoomPath, { recursive: true });
    await scaffoldCabinet(guestRoomPath, { name: "Guest Room", kind: "root", skipExisting: true });
    await fs.mkdir(guestRoomActiveCabinetPath, { recursive: true });

    const allFiles = await getFilesRecursive(DATA_DIR);
    const publicFilesSet = new Set<string>();

    for (const file of allFiles) {
      const baseName = path.basename(file);
      const ext = path.extname(file).toLowerCase();
      const isMarkdown = (ext === ".md" || ext === ".mdx") && !baseName.startsWith(".");

      if (isMarkdown) {
        try {
          const raw = await fs.readFile(file, "utf-8");
          const parsed = matter(raw);
          if (parsed.data && parsed.data.public === true) {
            publicFilesSet.add(file);
          }
        } catch {
          // Ignore read errors
        }
      } else if (!isMarkdown && !baseName.startsWith(".")) {
        // Non-markdown, check for hidden sibling markdown
        const siblingPath = path.join(path.dirname(file), `.${baseName}.md`);
        if (await fileExists(siblingPath)) {
          try {
            const raw = await fs.readFile(siblingPath, "utf-8");
            const parsed = matter(raw);
            if (parsed.data && parsed.data.public === true) {
              publicFilesSet.add(file);
            }
          } catch {
            // Ignore read errors
          }
        }
      }
    }

    // Sync files to Guest Room cabinet
    for (const file of publicFilesSet) {
      const relPath = path.relative(DATA_DIR, file);
      const targetPath = path.join(guestRoomActiveCabinetPath, relPath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      let shouldCopy = true;
      try {
        const srcStat = await fs.stat(file);
        const destStat = await fs.stat(targetPath);
        if (srcStat.mtimeMs <= destStat.mtimeMs) {
          shouldCopy = false;
        }
      } catch {
        // Dest doesn't exist, always copy
      }

      if (shouldCopy) {
        await fs.copyFile(file, targetPath);
      }
    }

    // Clean up non-public files in Guest Room active cabinet path
    if (await fileExists(guestRoomActiveCabinetPath)) {
      const guestRoomFiles = await getFilesRecursive(guestRoomActiveCabinetPath);
      for (const grFile of guestRoomFiles) {
        const relPath = path.relative(guestRoomActiveCabinetPath, grFile);
        const originalFile = path.join(DATA_DIR, relPath);
        if (!publicFilesSet.has(originalFile)) {
          await fs.unlink(grFile);
        }
      }
      await cleanEmptyDirs(guestRoomActiveCabinetPath);
    }

    // Check remote GitHub repo configuration
    const { values } = readCabinetEnvFile();
    const githubRepo = process.env.PUBLIC_DIRECTORY_GITHUB_REPO || values.PUBLIC_DIRECTORY_GITHUB_REPO;

    let pushed = false;
    if (githubRepo && githubRepo.trim() !== "") {
      try {
        const git = simpleGit(guestRoomPath);
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
          await git.init();
          await git.addConfig("user.email", "public@cabinet.dev");
          await git.addConfig("user.name", "Cabinet Public Sync");
        }
        await git.add(".");
        const status = await git.status();
        if (status.files.length > 0) {
          await git.commit(`Sync public files: ${new Date().toISOString()}`);
        }

        const remotes = await git.getRemotes();
        const hasOrigin = remotes.some((r) => r.name === "origin");
        if (hasOrigin) {
          await git.remote(["set-url", "origin", githubRepo.trim()]);
        } else {
          await git.addRemote("origin", githubRepo.trim());
        }

        await git.push("origin", "main", { "--force": null });
        pushed = true;
      } catch (err) {
        console.error("Failed to push Guest Room to GitHub remote:", err);
      }
    }

    return NextResponse.json({ ok: true, publicFilesCount: publicFilesSet.size, pushed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
