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

interface CloneRepoRequest {
  remote?: string;
  localPath?: string;
  name?: string;
  branch?: string;
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
  let folderCloned = false;
  const writtenFiles: string[] = [];

  try {
    const body = (await req.json()) as CloneRepoRequest;
    const remote = body.remote?.trim();
    const localPathInput = body.localPath?.trim();

    if (!remote) {
      return NextResponse.json(
        { error: "Repository URL is required." },
        { status: 400 }
      );
    }
    if (!localPathInput) {
      return NextResponse.json(
        { error: "Local clone directory path is required." },
        { status: 400 }
      );
    }

    localPath = path.resolve(/*turbopackIgnore: true*/ localPathInput);

    // Validate that localPath is either empty or does not exist
    const exists = await fileExists(localPath);
    if (exists) {
      const files = await fs.readdir(localPath).catch(() => []);
      if (files.length > 0) {
        return NextResponse.json(
          { error: "Local clone directory already exists and is not empty." },
          { status: 400 }
        );
      }
    }

    // Determine the name
    const derivedName = body.name?.trim() || path.basename(localPath);
    const folderName = sanitizeFilename(derivedName);
    if (!folderName) {
      return NextResponse.json(
        { error: "A valid repository name is required." },
        { status: 400 }
      );
    }

    const parentPath = body.parentPath?.trim() || "";
    const relativePath = parentPath ? `${parentPath}/${folderName}` : folderName;
    targetDir = resolveContentPath(relativePath);

    // Check if symlink target already exists
    const existing = await fs.lstat(targetDir).catch(() => null);
    if (existing) {
      return NextResponse.json(
        { error: `A Knowledge Base folder named "${folderName}" already exists.` },
        { status: 409 }
      );
    }

    // Ensure parent of local clone directory exists
    await ensureDirectory(path.dirname(localPath));

    // Clone the repo
    const git = simpleGit();
    const cloneOptions = body.branch?.trim() ? ["--branch", body.branch.trim()] : [];
    await git.clone(remote, localPath, cloneOptions);
    folderCloned = true;

    // Detect git metadata
    const detected = await detectGitMetadata(localPath);
    const isRepo = detected.isRepo;
    const branchName = body.branch?.trim() || detected.branch || "main";
    const remoteUrl = remote || detected.remote;
    const description = body.description?.trim() || undefined;

    // Write cabinet meta
    const cabinetMetaPath = path.join(/*turbopackIgnore: true*/ localPath, CABINET_LINK_META_FILE);
    const cabinetMeta = {
      title: derivedName,
      tags: ["repo"],
      created: new Date().toISOString(),
      ...(description ? { description } : {}),
    };
    await writeFileContent(
      cabinetMetaPath,
      yaml.dump(cabinetMeta, { lineWidth: -1, noRefs: true })
    );
    writtenFiles.push(cabinetMetaPath);

    // Write .repo.yaml config
    const repoYamlPath = path.join(/*turbopackIgnore: true*/ localPath, ".repo.yaml");
    const repoConfig = {
      name: derivedName,
      local: localPath,
      ...(remoteUrl ? { remote: remoteUrl } : {}),
      source: "both",
      branch: branchName,
      ...(description ? { description } : {}),
    };
    await writeFileContent(
      repoYamlPath,
      yaml.dump(repoConfig, { lineWidth: -1, noRefs: true })
    );
    writtenFiles.push(repoYamlPath);

    // Ensure Cabinet parent dir exists
    await ensureDirectory(path.dirname(targetDir));

    // Create the symlink only if localPath is different from targetDir
    const isLocalClonedInline = path.resolve(localPath) === path.resolve(targetDir);
    if (!isLocalClonedInline) {
      await fs.symlink(
        localPath,
        targetDir,
        process.platform === "win32" ? "junction" : "dir"
      );
      symlinkCreated = true;
    }

    invalidateTreeCache();
    autoCommit(relativePath, "Add");

    return NextResponse.json({
      ok: true,
      path: relativePath,
    });
  } catch (error) {
    // Cleanup on failure
    if (symlinkCreated && targetDir) {
      await fs.unlink(targetDir).catch(() => {});
    }
    for (const f of writtenFiles) {
      await fs.unlink(f).catch(() => {});
    }
    if (folderCloned && localPath) {
      await fs.rm(localPath, { recursive: true, force: true }).catch(() => {});
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
