#!/usr/bin/env node
/**
 * Walks src/ for `t("namespace:key.path", ...)` calls and adds missing keys
 * to src/i18n/locales/{en,he}.json. Existing values are preserved.
 *
 * New English keys default to the key path so it's obvious which strings
 * still need real copy. New Hebrew keys default to "" so translators see
 * the gap clearly.
 *
 * Usage:
 *   npm run i18n:extract       # update en/he in place
 *   npm run i18n:extract --check    # exit non-zero if anything would change (CI)
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const EN_FILE = path.join(SRC, "i18n", "locales", "en.json");
const HE_FILE = path.join(SRC, "i18n", "locales", "he.json");

const CHECK = process.argv.includes("--check");

const T_CALL = /\bt\(\s*["'`]([a-zA-Z][a-zA-Z0-9_-]*:[a-zA-Z0-9_.-]+)["'`]/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    if (entry.name === "i18n") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function collectKeys() {
  const keys = new Map(); // "ns:dot.path" → true
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(T_CALL)) {
      keys.set(m[1], true);
    }
  }
  return [...keys.keys()].sort();
}

function getNested(obj, parts) {
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNested(obj, parts, value) {
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object" || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function merge(locale, defaults) {
  const file = locale === "en" ? EN_FILE : HE_FILE;
  const existing = JSON.parse(readFileSync(file, "utf8"));
  let added = 0;
  for (const fullKey of defaults.keys()) {
    const [ns, ...rest] = fullKey.split(":");
    const keyPath = rest.join(":");
    const parts = [ns, ...keyPath.split(".")];
    if (getNested(existing, parts) === undefined) {
      setNested(existing, parts, defaults.get(fullKey)(locale, ns, keyPath));
      added++;
    }
  }
  return { existing, added, file };
}

const keys = collectKeys();
const defaults = new Map();
for (const k of keys) {
  defaults.set(k, (locale, _ns, keyPath) => (locale === "en" ? keyPath : ""));
}

let changed = 0;
for (const locale of ["en", "he"]) {
  const { existing, added, file } = merge(locale, defaults);
  if (added > 0) {
    if (CHECK) {
      process.stdout.write(`${locale}: ${added} missing keys\n`);
    } else {
      writeFileSync(file, JSON.stringify(existing, null, 2) + "\n");
      process.stdout.write(`${locale}: added ${added} keys → ${path.relative(ROOT, file)}\n`);
    }
    changed += added;
  }
}

if (changed === 0) {
  process.stdout.write("All t() keys already present in locale files.\n");
}
if (CHECK && changed > 0) process.exit(1);
