import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import {
  resolveContentPath,
  sanitizeFilename,
} from "@/lib/storage/path-utils";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";
import {
  MANDATORY_AGENT_SLUGS,
  mergeMandatoryAgentSlugs,
  resolveAgentLibraryDir,
} from "@/lib/agents/library-manager";
import { ensureAgentScaffold } from "@/lib/agents/scaffold";

interface CreateCabinetRequest {
  name: string;
  parentPath?: string;
  description?: string;
  selectedAgents?: string[];
  locale?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateCabinetRequest;
    const { name, parentPath = "", description = "", selectedAgents = [] } = body;
    const normalizedSelectedAgents = mergeMandatoryAgentSlugs(selectedAgents);
    const libraryDir = await resolveAgentLibraryDir();

    if (!libraryDir) {
      return NextResponse.json(
        { error: "Agent library is unavailable" },
        { status: 500 }
      );
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const slug = sanitizeFilename(name);
    if (!slug) {
      return NextResponse.json(
        { error: "Name must contain alphanumeric characters" },
        { status: 400 }
      );
    }

    // Resolve target directory
    const virtualPath = parentPath ? `${parentPath}/${slug}` : slug;
    const targetDir = resolveContentPath(virtualPath);

    // Check if directory already exists
    try {
      await fs.access(targetDir);
      return NextResponse.json(
        { error: `Directory "${slug}" already exists` },
        { status: 409 }
      );
    } catch {
      // Good — doesn't exist
    }

    // Create cabinet directory and bootstrap structure
    await fs.mkdir(targetDir, { recursive: true });
    const kind = parentPath ? "child" : "root";
    await scaffoldCabinet(targetDir, {
      name: name.trim(),
      kind,
      description,
      locale: body.locale,
    });

    // Copy selected agents from library
    for (const agentSlug of normalizedSelectedAgents) {
      const templateDir = path.join(libraryDir, agentSlug);
      const agentTargetDir = path.join(targetDir, ".agents", agentSlug);

      try {
        await fs.access(templateDir);
      } catch {
        if (MANDATORY_AGENT_SLUGS.includes(agentSlug as (typeof MANDATORY_AGENT_SLUGS)[number])) {
          return NextResponse.json(
            { error: `Required agent template "${agentSlug}" is unavailable` },
            { status: 500 }
          );
        }
        continue; // Template doesn't exist, skip
      }

      try {
        await fs.access(agentTargetDir);
        continue; // Already exists
      } catch {
        // Good
      }

      await copyDir(templateDir, agentTargetDir);
      await ensureAgentScaffold(agentTargetDir);
    }

    return NextResponse.json(
      { ok: true, path: virtualPath, name: name.trim() },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
