import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import {
  resolveContentPath,
  sanitizeFilename,
} from "@/lib/storage/path-utils";
import { scaffoldCabinet } from "@/lib/storage/cabinet-scaffold";
import { invalidateTreeCache } from "@/lib/storage/tree-builder";
import {
  MANDATORY_AGENT_SLUGS,
  mergeMandatoryAgentSlugs,
  resolveAgentLibraryDir,
} from "@/lib/agents/library-manager";
import { ensureAgentScaffold } from "@/lib/agents/scaffold";
import { listRooms, updateRoomMeta } from "@/lib/cabinets/rooms";

// Distinct avatars for new top-level rooms (mirrors the migration + the
// ROOM_ICON_KEYS / ROOM_COLORS sets) so two fresh rooms never look identical.
const ROOM_ICONS = [
  "briefcase", "study", "lab", "family", "rocket",
  "studio", "coffee", "building", "school", "heart",
];
const ROOM_COLORS = [
  "rgb(99, 102, 241)", "rgb(236, 72, 153)", "rgb(34, 197, 94)",
  "rgb(249, 115, 22)", "rgb(14, 165, 233)", "rgb(168, 85, 247)",
  "rgb(245, 158, 11)", "rgb(20, 184, 166)",
];

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

    // Create cabinet directory and bootstrap structure. A top-level cabinet
    // (no parent) is a "room" — an isolated sibling workspace. A cabinet with a
    // parent is a "child" nested inside its room.
    await fs.mkdir(targetDir, { recursive: true });
    const isRoom = !parentPath;
    const kind = isRoom ? "room" : "child";
    await scaffoldCabinet(targetDir, {
      name: name.trim(),
      kind,
      description,
      locale: body.locale,
    });

    // Give a new room a distinct icon + accent color up front so the home
    // switcher avatars are easy to tell apart (the "one DP" fix).
    if (isRoom) {
      try {
        const existing = await listRooms();
        const idx = existing.length;
        await updateRoomMeta(virtualPath, {
          icon: ROOM_ICONS[idx % ROOM_ICONS.length],
          color: ROOM_COLORS[idx % ROOM_COLORS.length],
        });
      } catch {
        // Non-fatal: the room still works, it just falls back to a letter tile.
      }
    }

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

    // New cabinet/room dir — drop the buildTree cache so it shows immediately.
    invalidateTreeCache();
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
