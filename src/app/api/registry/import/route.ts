import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";
import {
  resolveContentPath,
  sanitizeFilename,
} from "@/lib/storage/path-utils";
import { seedGettingStartedDir } from "@/lib/storage/cabinet-scaffold";
import { downloadRegistryTemplate } from "@/lib/registry/github-fetch";
import { getRegistryTemplates } from "@/lib/registry/registry-manifest";
import { CABINET_MANIFEST_FILE } from "@/lib/cabinets/files";
import { emit as emitTelemetry } from "@/lib/telemetry";

interface ImportRequest {
  slug: string;
  targetPath?: string;
  name?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportRequest;
    const { slug, targetPath = "" } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "Template slug is required" },
        { status: 400 }
      );
    }

    // Verify the template exists in our manifest
    const templates = await getRegistryTemplates();
    const template = templates.find((t) => t.slug === slug);
    if (!template) {
      return NextResponse.json(
        { error: `Unknown template: ${slug}` },
        { status: 404 }
      );
    }

    // Determine target directory
    const dirName = body.name ? sanitizeFilename(body.name) : slug;
    const virtualPath = targetPath ? `${targetPath}/${dirName}` : dirName;
    const targetDir = resolveContentPath(virtualPath);

    // Check if already exists
    try {
      await fs.access(targetDir);
      return NextResponse.json(
        { error: `Directory "${dirName}" already exists` },
        { status: 409 }
      );
    } catch {
      // Good
    }

    // Download template from GitHub
    await downloadRegistryTemplate(slug, targetDir);

    try {
      // If the user gave a custom name, update the .cabinet manifest's name field
      if (body.name && body.name.trim() !== template.name) {
        const manifestPath = path.join(targetDir, CABINET_MANIFEST_FILE);
        try {
          const raw = await fs.readFile(manifestPath, "utf-8");
          const parsed = yaml.load(raw) as Record<string, unknown>;
          parsed.name = body.name.trim();
          await fs.writeFile(manifestPath, yaml.dump(parsed), "utf-8");
        } catch {
          // Non-fatal: manifest may not exist for all templates
        }
      }

      // Ensure .cabinet-state exists
      await fs
        .mkdir(path.join(targetDir, ".cabinet-state"), { recursive: true })
        .catch(() => {});

      await seedGettingStartedDir(targetDir);
    } catch (err) {
      // Any post-download failure: remove the partial install so retries work.
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }

    emitTelemetry("template.installed", {
      templateKind: "cabinet",
      templateSlug: template.slug,
    });

    return NextResponse.json(
      {
        ok: true,
        path: virtualPath,
        name: template.name,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Import failed: ${message}` },
      { status: 500 }
    );
  }
}
