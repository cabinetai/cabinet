import test from "node:test";
import assert from "node:assert/strict";
import {
  compareExpressPaths,
  extractMethods,
  routeFileToExpressPath,
} from "../server/http/manifest-lib";

test("routeFileToExpressPath converts static, dynamic, and catch-all segments", () => {
  assert.equal(routeFileToExpressPath("src/app/api/health/route.ts"), "/api/health");
  assert.equal(
    routeFileToExpressPath("src/app/api/agents/[id]/jobs/[jobId]/route.ts"),
    "/api/agents/:id/jobs/:jobId"
  );
  assert.equal(routeFileToExpressPath("src/app/api/tree/[...path]/route.ts"), "/api/tree/*path");
});

test("extractMethods finds function and const exports, ignores non-method exports", () => {
  const source = [
    'export const dynamic = "force-dynamic";',
    "export async function GET(req: NextRequest) {}",
    "export function DELETE() {}",
    "export const POST = handler;",
  ].join("\n");
  assert.deepEqual(extractMethods(source).sort(), ["DELETE", "GET", "POST"]);
});

test("compareExpressPaths orders literals before params before wildcards", () => {
  const sorted = [
    "/api/agents/:id",
    "/api/agents/personas",
    "/api/tree/*path",
    "/api/tree/meta",
  ].sort(compareExpressPaths);
  assert.deepEqual(sorted, [
    "/api/agents/personas",
    "/api/agents/:id",
    "/api/tree/meta",
    "/api/tree/*path",
  ]);
});
