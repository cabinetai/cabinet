import { NextRequest, NextResponse } from "next/server";

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  wasm: "application/wasm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path: pathParts = [] } = await params;
  const relativePath = pathParts.join("/");
  
  const isHtml = relativePath === "" || relativePath === "index.html";
  const targetUrl = `https://threejs.org/editor/${isHtml ? "index.html" : relativePath}`;

  console.log(`[ThreeJS-Proxy] Requesting: ${relativePath} -> ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(`[ThreeJS-Proxy] Target returned error status: ${response.status} for ${targetUrl}`);
      return new NextResponse("Not Found", { status: response.status });
    }

    const ext = relativePath.split(".").pop()?.toLowerCase() || "";
    let contentType = response.headers.get("content-type") || MIME_TYPES[ext] || "application/octet-stream";
    if (isHtml) contentType = "text/html; charset=utf-8";

    // For HTML, CSS, and JS, perform URL rewrites to absolute threejs.org directories
    if (isHtml || ext === "js" || ext === "css" || relativePath === "") {
      let text = await response.text();
      
      // Rewrite parent relative references to threejs.org absolute paths
      text = text.replaceAll("../build/", "https://threejs.org/build/");
      text = text.replaceAll("../examples/", "https://threejs.org/examples/");
      
      console.log(`[ThreeJS-Proxy] Served rewritten text asset: ${relativePath} (${contentType})`);
      return new NextResponse(text, {
        headers: { "content-type": contentType },
      });
    }

    // Serve binary assets (wasm, png, ico, etc.)
    const data = await response.arrayBuffer();
    console.log(`[ThreeJS-Proxy] Served binary asset: ${relativePath} (${contentType})`);
    return new NextResponse(data, {
      headers: { "content-type": contentType },
    });
  } catch (err: any) {
    console.error(`[ThreeJS-Proxy] Exception serving ${relativePath}:`, err);
    return new NextResponse("Error fetching editor asset: " + err.message, { status: 500 });
  }
}
