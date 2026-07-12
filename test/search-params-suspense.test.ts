import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Next.js refuses to prerender a page whose tree calls useSearchParams() outside a
// <Suspense> boundary, and `next build` exits on it — the /login failure in #141.
// A full production build takes minutes, so the invariant is guarded at the source
// level instead: any module that reads search params owns a Suspense boundary, and
// a page's default export never reads them itself (the boundary must sit above the
// reader, so wrapping the caller's own JSX in <Suspense> does not help).

const SRC_DIR = join(__dirname, "..", "src");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// Body of `export default function ...`, brace-matched, or null when the file has no
// function-declaration default export.
function defaultExportBody(source: string): string | null {
  const marker = /export\s+default\s+function\s+\w*\s*\([^)]*\)\s*{/.exec(source);
  if (!marker) return null;
  const start = marker.index + marker[0].length - 1;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

function findSearchParamsViolations(source: string): string[] {
  const code = stripComments(source);
  if (!/\buseSearchParams\s*\(/.test(code)) return [];

  const violations: string[] = [];
  if (!/<Suspense[\s/>]/.test(code)) {
    violations.push("reads useSearchParams() but declares no <Suspense> boundary");
  }
  const body = defaultExportBody(code);
  if (body && /\buseSearchParams\s*\(/.test(body)) {
    violations.push(
      "calls useSearchParams() inside the default-exported component; move the call " +
        "into a child rendered under <Suspense>"
    );
  }
  return violations;
}

function collectSources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSources(full));
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("the detector flags the unwrapped page shape reported in #141", () => {
  const brokenPage = `"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [error] = useState(searchParams.get("error") ?? "");
  return <p>{error}</p>;
}`;

  assert.deepEqual(findSearchParamsViolations(brokenPage), [
    "reads useSearchParams() but declares no <Suspense> boundary",
    "calls useSearchParams() inside the default-exported component; move the call " +
      "into a child rendered under <Suspense>",
  ]);
});

test("the detector flags a page that wraps its own JSX instead of a child", () => {
  const stillBroken = `"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const searchParams = useSearchParams();
  return <Suspense fallback={null}><p>{searchParams.get("error")}</p></Suspense>;
}`;

  assert.deepEqual(findSearchParamsViolations(stillBroken), [
    "calls useSearchParams() inside the default-exported component; move the call " +
      "into a child rendered under <Suspense>",
  ]);
});

test("the detector accepts a reader wrapped in a Suspense boundary", () => {
  const fixed = `"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  return <p>{searchParams.get("error")}</p>;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}`;

  assert.deepEqual(findSearchParamsViolations(fixed), []);
});

test("the detector ignores useSearchParams mentioned only in a comment", () => {
  const prose = `// useSearchParams() needs a boundary, which is why this file avoids it.
export default function Page() {
  return <p>hi</p>;
}`;

  assert.deepEqual(findSearchParamsViolations(prose), []);
});

test("no source file reads search params outside a Suspense boundary", () => {
  const sources = collectSources(SRC_DIR);
  assert.ok(sources.length > 0, "expected to scan at least one source file");

  const offenders: string[] = [];
  for (const file of sources) {
    for (const violation of findSearchParamsViolations(readFileSync(file, "utf8"))) {
      offenders.push(`${relative(SRC_DIR, file)}: ${violation}`);
    }
  }

  assert.deepEqual(offenders, [], `next build would fail to prerender:\n${offenders.join("\n")}`);
});

test("the login page keeps its search-param reader behind a Suspense boundary", () => {
  const source = readFileSync(join(SRC_DIR, "app", "login", "page.tsx"), "utf8");

  assert.match(source, /\buseSearchParams\s*\(/, "login page still reads the ?error param");
  assert.deepEqual(findSearchParamsViolations(source), []);
});
