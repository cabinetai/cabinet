import { Readable } from "node:stream";
import type {
  Express,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { NextRequest } from "next/server";
import { HTTP_METHODS, type HttpMethod } from "./manifest-lib";

/** Shape of a Next.js App Router route-handler module. */
export type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[]>> }
) => Response | Promise<Response>;

export type RouteModule = Partial<Record<HttpMethod, RouteHandler>> &
  Record<string, unknown>;

/**
 * Build a fetch-API request (NextRequest) from the incoming Node request.
 * The body is passed through as a stream so large payloads never buffer.
 */
export function toNextRequest(req: ExpressRequest): NextRequest {
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  }
  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  return new NextRequest(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
    // Node's fetch requires half-duplex for streamed request bodies;
    // RequestInit's TS type doesn't carry the field yet.
    ...({ duplex: "half" } as object),
  });
}

/** Stream a fetch-API Response back out over the Node response. */
export async function sendWebResponse(
  res: ExpressResponse,
  out: Response
): Promise<void> {
  res.status(out.status);
  out.headers.forEach((value, key) => {
    // Set-Cookie is multi-valued and collapsed by forEach; handled below.
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  for (const cookie of out.headers.getSetCookie()) {
    res.append("Set-Cookie", cookie);
  }
  if (!out.body) {
    res.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(
      out.body as unknown as import("node:stream/web").ReadableStream
    );
    body.once("error", reject);
    res.once("error", reject);
    res.once("close", resolve);
    body.pipe(res);
  });
}

const METHOD_SET = new Set<string>(HTTP_METHODS);

/** Mount every HTTP method a route module exports at the given Express path. */
export function mountRouteModule(
  app: Express,
  expressPath: string,
  mod: RouteModule
): void {
  for (const [name, handler] of Object.entries(mod)) {
    if (!METHOD_SET.has(name) || typeof handler !== "function") continue;
    const verb = name.toLowerCase() as "get";
    app[verb](expressPath, async (req, res, next) => {
      try {
        const out = await (handler as RouteHandler)(toNextRequest(req), {
          params: Promise.resolve(req.params as Record<string, string | string[]>),
        });
        await sendWebResponse(res, out);
      } catch (err) {
        next(err);
      }
    });
  }
}
