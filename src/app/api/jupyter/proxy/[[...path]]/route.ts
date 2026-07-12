import { NextRequest, NextResponse } from "next/server";
import { findActiveJupyterServer } from "@/lib/notebook/jupyter";
import path from "path";
import { resolveContentPath, virtualPathFromFs, DATA_DIR } from "@/lib/storage/path-utils";
import { decodeDrivePath, encodeDrivePath } from "@/lib/google-drive/paths";

function resolveToAbsPath(virtualPath: string): string {
  const driveAbsPath = decodeDrivePath(virtualPath);
  if (driveAbsPath !== null) {
    return path.normalize(driveAbsPath);
  }
  return resolveContentPath(virtualPath);
}

function toJupyterPath(virtualPath: string, rootDir: string): string {
  const absPath = resolveToAbsPath(virtualPath);
  return path.relative(rootDir, absPath);
}

function fromJupyterPath(jupyterPath: string, rootDir: string): string {
  const absPath = path.resolve(rootDir, jupyterPath);
  const relativeToData = path.relative(DATA_DIR, absPath);
  if (!relativeToData.startsWith("..") && !path.isAbsolute(relativeToData)) {
    return virtualPathFromFs(absPath);
  }
  return encodeDrivePath(absPath);
}

async function handleProxy(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  try {
    const server = await findActiveJupyterServer();
    if (!server) {
      return NextResponse.json({ error: "Jupyter server not active" }, { status: 503 });
    }

    const { path: segments } = await context.params;
    const subpath = segments ? segments.join("/") : "";
    
    // Construct destination URL
    const baseUrl = server.url.endsWith("/") ? server.url.slice(0, -1) : server.url;
    const url = new URL(req.url);
    const targetUrl = new URL(`${baseUrl}/${subpath}${url.search}`);
    
    // Set token in search params
    targetUrl.searchParams.set("token", server.token);

    // Forward headers
    const headers = new Headers();
    req.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "host" &&
        lowerKey !== "origin" &&
        lowerKey !== "referer" &&
        lowerKey !== "connection" &&
        lowerKey !== "authorization" &&
        lowerKey !== "cookie" &&
        !lowerKey.startsWith("sec-")
      ) {
        headers.set(key, value);
      }
    });

    let body: any = null;
    const contentTypeHeader = req.headers.get("content-type") || "";

    if (req.method !== "GET" && req.method !== "HEAD") {
      if (subpath === "api/sessions" && req.method === "POST" && contentTypeHeader.includes("application/json")) {
        const rawBody = await req.text();
        try {
          const json = JSON.parse(rawBody);
          
          // Unwrap model if the client wrapped it (like in notebook-viewer.tsx)
          if (json.model && typeof json.model === "object") {
            if (json.model.path) json.path = json.model.path;
            if (json.model.type) json.type = json.model.type;
            if (json.model.name) json.name = json.model.name;
            delete json.model;
          }

          if (typeof json.path === "string" && server.rootDir) {
            json.path = toJupyterPath(json.path, server.rootDir);
          }
          body = JSON.stringify(json);
          headers.delete("content-length");
        } catch {
          body = rawBody;
        }
      } else {
        body = await req.arrayBuffer();
      }
    }

    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
    });

    const resHeaders = new Headers();
    res.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "content-encoding" &&
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "connection" &&
        lowerKey !== "keep-alive"
      ) {
        resHeaders.set(key, value);
      }
    });

    let resBody: any;
    const resContentType = res.headers.get("content-type") || "";
    if (resContentType.includes("application/json") && server.rootDir && subpath.startsWith("api/sessions")) {
      const text = await res.text();
      try {
        let json = JSON.parse(text);
        if (Array.isArray(json)) {
          json = json.map((session) => {
            if (session.path && typeof session.path === "string") {
              session.path = fromJupyterPath(session.path, server.rootDir!);
            }
            return session;
          });
        } else if (json && typeof json === "object" && typeof json.path === "string") {
          json.path = fromJupyterPath(json.path, server.rootDir);
        }
        resBody = JSON.stringify(json);
        if (resHeaders.has("content-length")) {
          resHeaders.set("content-length", String(Buffer.byteLength(resBody)));
        }
      } catch {
        resBody = text;
      }
    } else {
      resBody = await res.arrayBuffer();
    }

    return new Response((res.status === 204 || res.status === 304) ? null : resBody, {
      status: res.status,
      headers: resHeaders,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Proxy error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export {
  handleProxy as GET,
  handleProxy as POST,
  handleProxy as PUT,
  handleProxy as DELETE,
  handleProxy as PATCH,
};
