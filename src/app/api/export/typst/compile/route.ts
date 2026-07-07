import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  let tempDir = "";
  try {
    const { code } = await req.json();
    if (typeof code !== "string") {
      return NextResponse.json({ error: "Missing code parameter" }, { status: 400 });
    }

    const timestamp = Date.now();
    const rand = Math.floor(Math.random() * 1000);
    tempDir = path.resolve(process.cwd(), "tmp", `typst-comp-${timestamp}-${rand}`);
    await fs.mkdir(tempDir, { recursive: true });

    const sourceFile = path.join(tempDir, "document.typ");
    const outputFile = path.join(tempDir, "document.pdf");

    await fs.writeFile(sourceFile, code, "utf8");

    // Run typst compile:
    // First try npx typst compile (locally installed npm wrapper)
    // If that fails, try typst compile (globally installed native CLI)
    try {
      await execAsync(`npx typst compile document.typ document.pdf`, { cwd: tempDir });
    } catch (execError: any) {
      try {
        await execAsync(`typst compile document.typ document.pdf`, { cwd: tempDir });
      } catch (fallbackError: any) {
        const errMessage = fallbackError.stderr || fallbackError.message || execError.stderr || execError.message || "";
        return NextResponse.json({
          error: `Typst compilation failed. Please make sure Typst is installed on your system (e.g. brew install typst). Details: ${errMessage}`
        }, { status: 500 });
      }
    }

    if (!existsSync(outputFile)) {
      return NextResponse.json({ error: "Compiled PDF not found" }, { status: 500 });
    }

    const pdfBuffer = await fs.readFile(outputFile);

    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"document.pdf\"",
      },
    });
  } catch (error: any) {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    return NextResponse.json({ error: error.message || "Compilation failed" }, { status: 500 });
  }
}
