import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { resolveContentPath } from "@/lib/storage/path-utils";
import { fileExists, writeFileContent } from "@/lib/storage/fs-operations";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import { CABINET_LINK_META_FILE } from "@/lib/cabinets/files";
import { autoCommit } from "@/lib/git/git-service";

export const dynamic = "force-dynamic";

interface LinkMeta {
  title?: string;
  tags?: string[];
  created?: string;
  description?: string;
}

async function readMeta(targetDir: string): Promise<LinkMeta | null> {
  const metaPath = path.join(targetDir, CABINET_LINK_META_FILE);
  if (!(await fileExists(metaPath))) return null;
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    return (yaml.load(raw) as LinkMeta) || null;
  } catch {
    return null;
  }
}

async function resolveSymlink(kbPath: string): Promise<{
  abs: string;
  target: string;
  exists: boolean;
}> {
  const abs = resolveContentPath(kbPath);
  const stat = await fs.lstat(abs).catch(() => null);
  if (!stat || !stat.isSymbolicLink()) {
    throw new Error("This item is not a symlink.");
  }
  const link = await fs.readlink(abs);
  const target = path.isAbsolute(link)
    ? link
    : path.resolve(path.dirname(abs), link);
  const targetStat = await fs.stat(target).catch(() => null);
  return { abs, target, exists: !!targetStat?.isDirectory() };
}

export async function GET(req: NextRequest) {
  try {
    const kbPath = new URL(req.url).searchParams.get("path")?.trim();
    if (!kbPath) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }
    const { target, exists } = await resolveSymlink(kbPath);
    const meta = exists ? await readMeta(target) : null;
    return NextResponse.json({
      kbPath,
      target,
      exists,
      name: meta?.title || path.basename(kbPath),
      description: meta?.description || "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      path?: string;
      newTarget?: string;
      name?: string;
      description?: string;
    };
    const kbPath = body.path?.trim();
    if (!kbPath) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const { abs, target: currentTarget } = await resolveSymlink(kbPath);

    // Re-point: validate the new directory, then atomically replace the link.
    let target = currentTarget;
    const newTarget = body.newTarget?.trim();
    if (newTarget) {
      const resolvedNew = path.resolve(newTarget);
      const stat = await fs.stat(resolvedNew).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return NextResponse.json(
          { error: "New target must be an existing directory." },
          { status: 400 }
        );
      }
      await fs.unlink(abs);
      await fs.symlink(
        resolvedNew,
        abs,
        process.platform === "win32" ? "junction" : "dir"
      );
      target = resolvedNew;
    }

    // Update metadata (name/description) on the (possibly new) target.
    const name = body.name?.trim();
    const description = body.description?.trim();
    if (name !== undefined || description !== undefined || newTarget) {
      const existing = (await readMeta(target)) || {};
      const meta: LinkMeta = {
        title: name || existing.title || path.basename(kbPath),
        tags: existing.tags || ["knowledge"],
        created: existing.created || new Date().toISOString(),
        ...(description || existing.description
          ? { description: description ?? existing.description }
          : {}),
      };
      await writeFileContent(
        path.join(target, CABINET_LINK_META_FILE),
        yaml.dump(meta, { lineWidth: -1, noRefs: true })
      );
    }

    // Re-point / rename changes the node — invalidate so the sidebar refresh
    // doesn't read the stale buildTree cache.
    invalidateTreeCache();
    autoCommit(kbPath, "Update");
    return NextResponse.json({ ok: true, target });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
