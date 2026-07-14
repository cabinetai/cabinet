import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { NextResponse } from "next/server";
import { mountRouteModule, type RouteModule } from "../server/http/next-route-adapter";

async function withApp(
  mods: Array<[string, RouteModule]>,
  fn: (origin: string) => Promise<void>
): Promise<void> {
  const app = express();
  for (const [p, m] of mods) mountRouteModule(app, p, m);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("adapter passes params, query, and JSON body through and writes the Response", async () => {
  const mod: RouteModule = {
    POST: async (req, ctx) => {
      const params = await ctx.params;
      const body = (await req.json()) as { value: string };
      return NextResponse.json(
        { id: params.id, q: req.nextUrl.searchParams.get("q"), echo: body.value },
        { status: 201 }
      );
    },
  };
  await withApp([["/api/things/:id", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/things/42?q=hello`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: "42", q: "hello", echo: "x" });
  });
});

test("adapter yields catch-all params as a string array", async () => {
  const mod: RouteModule = {
    GET: async (_req, ctx) => NextResponse.json({ path: (await ctx.params).path }),
  };
  await withApp([["/api/tree/*path", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/tree/a/b/c.md`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { path: ["a", "b", "c.md"] });
  });
});

test("adapter forwards multiple Set-Cookie headers and streams bodies", async () => {
  const mod: RouteModule = {
    GET: async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("chunk1"));
          controller.enqueue(new TextEncoder().encode("chunk2"));
          controller.close();
        },
      });
      const res = new NextResponse(stream);
      res.headers.append("set-cookie", "a=1; Path=/");
      res.headers.append("set-cookie", "b=2; Path=/");
      return res;
    },
  };
  await withApp([["/api/stream", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/stream`);
    assert.deepEqual(res.headers.getSetCookie(), ["a=1; Path=/", "b=2; Path=/"]);
    assert.equal(await res.text(), "chunk1chunk2");
  });
});

test("adapter maps a thrown handler error to a 500 via the error middleware", async () => {
  const mod: RouteModule = {
    GET: async () => {
      throw new Error("boom");
    },
  };
  await withApp([["/api/broken", mod]], async (origin) => {
    const res = await fetch(`${origin}/api/broken`);
    assert.equal(res.status, 500);
  });
});
