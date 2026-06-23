import { NextRequest, NextResponse } from "next/server";
import { findActiveJupyterServer } from "@/lib/notebook/jupyter";

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
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.arrayBuffer();
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

    const data = await res.arrayBuffer();
    return new Response(data, {
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
