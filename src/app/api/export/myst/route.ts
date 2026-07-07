import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { resolveContentPath } from "@/lib/storage/path-utils";

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const virtualPath = searchParams.get("path");
    const format = searchParams.get("format");

    if (!virtualPath || !format) {
      return NextResponse.json({ error: "Missing path or format parameter" }, { status: 400 });
    }

    const allowedFormats = ["pdf", "docx", "tex", "html"];
    if (!allowedFormats.includes(format)) {
      return NextResponse.json({ error: `Invalid format: ${format}` }, { status: 400 });
    }

    const resolvedPath = resolveContentPath(virtualPath);
    if (!existsSync(resolvedPath)) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const dir = path.dirname(resolvedPath);
    const filename = path.basename(resolvedPath);

    // Run myst build:
    // npx myst build <filename> --force --pdf/docx/...
    const command = `npx myst build "${filename}" --force --${format}`;
    
    try {
      await execAsync(command, { cwd: dir });
    } catch (execError: any) {
      const errMessage = execError.stderr || execError.message || "";
      if (errMessage.includes("typst: not found") || errMessage.includes("latex: not found")) {
        return NextResponse.json({
          error: "To export to PDF using MyST, you need Typst or LaTeX installed on your system. Please install Typst (recommended) and try again."
        }, { status: 500 });
      }
      return NextResponse.json({ error: `MyST build failed: ${errMessage}` }, { status: 500 });
    }

    const exportsDir = path.join(dir, "_build", "exports");
    if (!existsSync(exportsDir)) {
      return NextResponse.json({ error: "Build exports directory was not created" }, { status: 500 });
    }

    const files = await fs.readdir(exportsDir);
    const matchingFiles = files.filter(f => f.toLowerCase().endsWith(`.${format}`));
    if (matchingFiles.length === 0) {
      return NextResponse.json({ error: `Compiled ${format} file not found` }, { status: 500 });
    }

    // Pick the matching file
    const fileToStream = path.join(exportsDir, matchingFiles[0]);
    const fileBuffer = await fs.readFile(fileToStream);

    // Clean up _build directory
    await fs.rm(path.join(dir, "_build"), { recursive: true, force: true }).catch(() => {});

    // Content types
    const contentTypes: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      tex: "application/x-tex",
      html: "text/html"
    };

    const headers = new Headers();
    headers.set("Content-Type", contentTypes[format] || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${path.basename(fileToStream)}"`);

    return new NextResponse(fileBuffer, { headers });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Export failed" }, { status: 500 });
  }
}
