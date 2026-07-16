import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import simpleGit from "simple-git";
import { NextRequest, NextResponse } from "next/server";
import { CABINET_LINK_META_FILE } from "@/lib/cabinets/files";
import {
  resolveContentPath,
  sanitizeFilename,
} from "@/lib/storage/path-utils";
import { ensureDirectory, fileExists, writeFileContent } from "@/lib/storage/fs-operations";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { autoCommit } from "@/lib/git/git-service";

export const dynamic = "force-dynamic";

interface LinkRepoRequest {
  localPath?: string;
  name?: string;
  remote?: string;
  description?: string;
  parentPath?: string;
}

async function detectGitMetadata(localPath: string): Promise<{
  isRepo: boolean;
  branch?: string;
  remote?: string;
}> {
  try {
    const git = simpleGit(/*turbopackIgnore: true*/ localPath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) return { isRepo: false };

    const branchSummary = await git.branchLocal();
    const remotes = await git.getRemotes(true);
    const preferredRemote =
      remotes.find((remote) => remote.name === "origin") || remotes[0];

    return {
      isRepo: true,
      branch: branchSummary.current || undefined,
      remote:
        preferredRemote?.refs.push ||
        preferredRemote?.refs.fetch ||
        undefined,
    };
  } catch {
    return { isRepo: false };
  }
}

export async function POST(req: NextRequest) {
  let symlinkCreated = false;
  let targetDir = "";
  let localPath = "";
  const writtenFiles: string[] = [];

  try {
    const body = (await req.json()) as LinkRepoRequest;
    const localPathInput = body.localPath?.trim();
    if (!localPathInput) {
      return NextResponse.json(
        { error: "localPath is required" },
        { status: 400 }
      );
    }

    localPath = path.resolve(/*turbopackIgnore: true*/ localPathInput);
    const stat = await fs.stat(/*turbopackIgnore: true*/ localPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return NextResponse.json(
        { error: "Local path must be an existing directory." },
        { status: 400 }
      );
    }

    const derivedName = body.name?.trim() || path.basename(localPath);
    const folderName = sanitizeFilename(derivedName);
    if (!folderName) {
      return NextResponse.json(
        { error: "A valid repo name is required." },
        { status: 400 }
      );
    }

    const parentPath = body.parentPath?.trim() || "";
    const relativePath = parentPath ? `${parentPath}/${folderName}` : folderName;
    targetDir = resolveContentPath(relativePath);

    // Use lstat to detect both real entries and symlinks (including broken ones)
    const existing = await fs.lstat(targetDir).catch(() => null);
    if (existing) {
      return NextResponse.json(
        { error: `A Knowledge Base folder named "${folderName}" already exists.` },
        { status: 409 }
      );
    }

    // If parentPath points to a standalone .md file, promote it to a directory
    if (parentPath) {
      const parentDir = resolveContentPath(parentPath);
      const parentMdFile = `${parentDir}.md`;
      const parentDirExists = await fileExists(parentDir);
      const parentMdExists = !parentDirExists && await fileExists(parentMdFile);
      if (parentMdExists) {
        await fs.mkdir(parentDir, { recursive: true });
        await fs.rename(parentMdFile, path.join(parentDir, "index.md"));
      }
    }

    // Ensure parent directory exists for the symlink
    await ensureDirectory(path.dirname(targetDir));

    const detected = await detectGitMetadata(localPath);
    const isRepo = detected.isRepo || !!body.remote?.trim();
    const branch = detected.branch || "main";
    const remote = body.remote?.trim() || detected.remote;
    const source = remote ? "both" : "local";
    const description = body.description?.trim() || undefined;

    // Write linked-folder metadata into the target directory.
    const cabinetMetaPath = path.join(
      /*turbopackIgnore: true*/ localPath,
      CABINET_LINK_META_FILE
    );
    const cabinetMeta = {
      title: derivedName,
      tags: isRepo ? ["repo"] : ["knowledge"],
      created: new Date().toISOString(),
      ...(description ? { description } : {}),
    };
    await writeFileContent(
      cabinetMetaPath,
      yaml.dump(cabinetMeta, { lineWidth: -1, noRefs: true })
    );
    writtenFiles.push(cabinetMetaPath);

    // Write .repo.yaml into the target directory (for git repos, skip if already exists)
    let warning: string | undefined;
    if (isRepo) {
      const repoYamlPath = path.join(
        /*turbopackIgnore: true*/ localPath,
        ".repo.yaml"
      );
      if (await fileExists(repoYamlPath)) {
        warning = ".repo.yaml already exists in the target directory, so writing was skipped.";
      } else {
        const repoConfig = {
          name: derivedName,
          local: localPath,
          ...(remote ? { remote } : {}),
          source,
          branch,
          ...(description ? { description } : {}),
        };
        await writeFileContent(
          repoYamlPath,
          yaml.dump(repoConfig, { lineWidth: -1, noRefs: true })
        );
        writtenFiles.push(repoYamlPath);
      }
    }

    // Create direct symlink: data/my-project -> /external/path
    await fs.symlink(
      localPath,
      targetDir,
      process.platform === "win32" ? "junction" : "dir"
    );
    symlinkCreated = true;

    // The symlink adds a node to the tree — drop the 5s buildTree cache so the
    // sidebar's immediate loadTree() reflects it instead of stale data.
    invalidateTreeCache();
    autoCommit(relativePath, "Add");

    return NextResponse.json({
      ok: true,
      path: relativePath,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    // Clean up on failure: remove symlink and written dotfiles
    if (symlinkCreated && targetDir) {
      await fs.unlink(targetDir).catch(() => {});
    }
    for (const f of writtenFiles) {
      await fs.unlink(f).catch(() => {});
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
