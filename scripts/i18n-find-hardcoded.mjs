#!/usr/bin/env node
/**
 * Scans .tsx files under src/components for likely user-facing English text
 * that hasn't been wrapped in t(...). Best-effort regex pass — false
 * positives are expected (call-site context matters). The goal is to keep
 * a running list of "what's still hardcoded" so translation rounds don't
 * have to crawl the tree manually.
 *
 * Usage:
 *   node scripts/i18n-find-hardcoded.mjs           # human-readable report
 *   node scripts/i18n-find-hardcoded.mjs --json    # JSON output for CI
 *
 * Exits 0 always — this is a report, not a gate. Wire it into CI as
 * informational if you want a hardcoded-string budget over time.
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src", "components");

// Already-translated namespaces — used to ignore strings that look English
// but appear inside t("…") calls. We don't parse t() ourselves; instead we
// strip those substrings from each line before scanning.
const T_CALL = /\bt\(\s*["'`][^"'`]+["'`](?:,\s*\{[^}]*\})?\s*\)/g;

// Common JSX-attribute names that almost always carry user-facing copy.
const PROP_PATTERN =
  /\b(title|aria-label|placeholder|alt|label|tooltip)=\s*"([^"]{2,})"/g;

// JSX text content: `>Hello world<`. Excludes interpolated, single-char,
// and obvious code-shape content.
const JSX_TEXT_PATTERN = />\s*([A-Z][A-Za-z0-9 ,.'!?:;\-—]{2,}?)\s*</g;

// Strings that should be skipped — they're code identifiers, CSS classnames,
// or technical literals that won't be translated.
const IGNORE = [
  /^\s*$/,
  /^[A-Z_][A-Z0-9_]*$/, // ALL_CAPS constants
  /^[a-z][a-zA-Z0-9]*$/, // camelCase identifier
  /^\d+(\.\d+)?(px|rem|em|%|s|ms|deg)?$/, // CSS values
  /^#[0-9a-fA-F]{3,8}$/, // hex colors
  /^var\(/, // CSS var
  /^https?:\/\//, // URLs
  /^[\/\.]/, // file paths
  /^[a-z][a-z0-9-]*$/, // kebab-case (often slugs)
  /^@[a-z]/, // package names
  /^[A-Z][a-z]+[A-Z]/, // PascalCase identifiers
];

function isLikelyCode(value) {
  const trimmed = value.trim();
  if (trimmed.length < 3) return true;
  for (const rx of IGNORE) if (rx.test(trimmed)) return true;
  // No vowels — probably a code identifier.
  if (!/[aeiouAEIOU]/.test(trimmed)) return true;
  return false;
}

async function listFiles(dir = SRC, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      await listFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function scanFile(file) {
  const findings = [];
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  lines.forEach((rawLine, idx) => {
    // Strip out t("…") calls so we don't flag their string arguments.
    const line = rawLine.replace(T_CALL, "");
    if (line.includes("//")) return; // best-effort comment skip
    if (/^\s*(import|export|type|interface|const\s+[A-Z_]+\s*=)/.test(line))
      return;

    for (const m of line.matchAll(PROP_PATTERN)) {
      const value = m[2];
      if (isLikelyCode(value)) continue;
      findings.push({
        file: path.relative(ROOT, file),
        line: idx + 1,
        kind: m[1],
        text: value,
      });
    }

    for (const m of line.matchAll(JSX_TEXT_PATTERN)) {
      const value = m[1];
      if (isLikelyCode(value)) continue;
      // Skip stray fragments like ">X<" where X is one word and could be
      // a variable.
      if (!/\s/.test(value) && value.length < 5) continue;
      findings.push({
        file: path.relative(ROOT, file),
        line: idx + 1,
        kind: "jsx",
        text: value,
      });
    }
  });

  return findings;
}

const json = process.argv.includes("--json");
const files = await listFiles();
const all = [];
for (const f of files) all.push(...scanFile(f));

if (json) {
  process.stdout.write(JSON.stringify(all, null, 2) + "\n");
} else {
  const byFile = new Map();
  for (const f of all) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  const sorted = [...byFile.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  process.stdout.write(`Hardcoded English strings (likely): ${all.length}\n`);
  process.stdout.write(`Files affected: ${byFile.size}\n\n`);
  for (const [file, hits] of sorted.slice(0, 40)) {
    process.stdout.write(`${file} — ${hits.length}\n`);
    for (const h of hits.slice(0, 4)) {
      process.stdout.write(
        `  ${h.line}: [${h.kind}] ${JSON.stringify(h.text)}\n`,
      );
    }
    if (hits.length > 4) {
      process.stdout.write(`  … ${hits.length - 4} more\n`);
    }
  }
  if (sorted.length > 40) {
    process.stdout.write(`\n… plus ${sorted.length - 40} more files\n`);
  }
}
