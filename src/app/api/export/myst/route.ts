import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import matter from "gray-matter";
import { resolveContentPath } from "@/lib/storage/path-utils";
import {
  applyLayoutToDocx,
  buildMystLatexTemplate,
  buildMystTemplateManifest,
  parseExportLayout,
} from "@/lib/export/myst-layout";

const execFileAsync = promisify(execFile);
const allowedFormats = ["pdf", "docx", "tex", "html"] as const;
type ExportFormat = (typeof allowedFormats)[number];

function isExportFormat(value: string | null): value is ExportFormat {
  return allowedFormats.includes(value as ExportFormat);
}

function commandError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const value = error as { stderr?: string; message?: string };
  return value.stderr || value.message || String(error);
}

async function runMyst(args: string[], cwd: string): Promise<void> {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  await execFileAsync(command, ["myst", ...args], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function GET(req: NextRequest) {
  let temporaryRoot: string | null = null;
  let temporarySource: string | null = null;
  let legacyBuildDir: string | null = null;

  try {
    const { searchParams } = new URL(req.url);
    const virtualPath = searchParams.get("path");
    const format = searchParams.get("format");

    if (!virtualPath || !format) {
      return NextResponse.json(
        { error: "Missing path or format parameter" },
        { status: 400 }
      );
    }
    if (!isExportFormat(format)) {
      return NextResponse.json(
        { error: `Invalid format: ${format}` },
        { status: 400 }
      );
    }

    const resolvedPath = resolveContentPath(virtualPath);
    if (!existsSync(resolvedPath)) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const dir = path.dirname(resolvedPath);
    const filename = path.basename(resolvedPath);
    const requestedPaperSize = searchParams.get("paperSize");
    const requestedOrientation = searchParams.get("orientation");
    const layout =
      requestedPaperSize === null && requestedOrientation === null
        ? { paperSize: "a4" as const, orientation: "auto" as const }
        : parseExportLayout(requestedPaperSize, requestedOrientation);

    if (!layout) {
      return NextResponse.json(
        { error: "Invalid paper size or orientation" },
        { status: 400 }
      );
    }

    let fileBuffer: Buffer;
    let outputName: string;

    try {
      if (format === "html") {
        legacyBuildDir = path.join(dir, "_build");
        await runMyst(["build", filename, "--force", "--html"], dir);
        const exportsDir = path.join(legacyBuildDir, "exports");
        if (!existsSync(exportsDir)) {
          throw new Error("Build exports directory was not created");
        }
        const files = await fs.readdir(exportsDir);
        const match = files.find((file) => file.toLowerCase().endsWith(".html"));
        if (!match) throw new Error("Compiled html file not found");
        outputName = match;
        fileBuffer = await fs.readFile(path.join(exportsDir, match));
      } else {
        const exportRoot = await fs.mkdtemp(
          path.join(os.tmpdir(), "cabinet-myst-export-")
        );
        temporaryRoot = exportRoot;
        const outputBase = path.basename(filename, path.extname(filename));
        outputName = `${outputBase}.${format}`;
        const outputPath = path.join(exportRoot, outputName);
        let templatePath: string | undefined;

        if (format === "pdf" || format === "tex") {
          templatePath = path.join(exportRoot, "template");
          await fs.mkdir(templatePath);
          await Promise.all([
            fs.writeFile(
              path.join(templatePath, "template.yml"),
              buildMystTemplateManifest()
            ),
            fs.writeFile(
              path.join(templatePath, "template.tex"),
              buildMystLatexTemplate(layout)
            ),
          ]);
        }

        const source = matter(await fs.readFile(resolvedPath, "utf8"));
        temporarySource = path.join(
          dir,
          `cabinet-export-${path.basename(exportRoot)}.md`
        );
        await fs.writeFile(
          temporarySource,
          matter.stringify(source.content, {
            ...source.data,
            exports: [
              {
                format,
                output: outputPath,
                ...(templatePath ? { template: templatePath } : {}),
              },
            ],
          })
        );
        legacyBuildDir = path.join(dir, "_build");
        await runMyst(["build", path.basename(temporarySource)], dir);

        if (!existsSync(outputPath)) {
          throw new Error(`Compiled ${format} file not found`);
        }
        fileBuffer = await fs.readFile(outputPath);
        if (format === "docx") {
          fileBuffer = await applyLayoutToDocx(fileBuffer, layout);
        }
      }
    } catch (error) {
      const message = commandError(error);
      if (
        message.includes("typst: not found") ||
        message.includes("latex: not found") ||
        message.includes("Compiled pdf file not found")
      ) {
        return NextResponse.json(
          {
            error:
              "To export to PDF using MyST, you need LaTeX installed on your system. Please install LaTeX and try again.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: `MyST build failed: ${message}` },
        { status: 500 }
      );
    }

    const contentTypes: Record<ExportFormat, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      tex: "application/x-tex",
      html: "text/html",
    };
    const headers = new Headers();
    headers.set("Content-Type", contentTypes[format]);
    headers.set("Content-Disposition", `attachment; filename="${outputName}"`);
    return new NextResponse(new Uint8Array(fileBuffer), { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  } finally {
    if (temporarySource) await fs.rm(temporarySource, { force: true }).catch(() => {});
    if (temporaryRoot) {
      await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
    }
    if (legacyBuildDir) {
      await fs.rm(legacyBuildDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
