import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import yaml from "js-yaml";
import { DATA_DIR, resolveContentPath, isHiddenEntry } from "./path-utils";
import {
  readFileContent,
  writeFileContent,
  fileExists,
  listDirectory,
} from "./fs-operations";

export const ORDER_SIDECAR = ".cabinet-order.yaml";
export const ORDER_GAP = 100;

function parentDirAbs(parentVirtualPath: string): string {
  return parentVirtualPath ? resolveContentPath(parentVirtualPath) : DATA_DIR;
}

async function readSidecar(parentDir: string): Promise<Record<string, number>> {
  const sidecarPath = path.join(parentDir, ORDER_SIDECAR);
  if (!(await fileExists(sidecarPath))) return {};
  try {
    const raw = await readFileContent(sidecarPath);
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeSidecar(
  parentDir: string,
  data: Record<string, number>
): Promise<void> {
  const sidecarPath = path.join(parentDir, ORDER_SIDECAR);
  const keys = Object.keys(data).sort();
  if (keys.length === 0) {
    try {
      await fs.unlink(sidecarPath);
    } catch {
      // already gone
    }
    return;
  }
  const sorted: Record<string, number> = {};
  for (const k of keys) sorted[k] = data[k];
  await writeFileContent(sidecarPath, yaml.dump(sorted));
}

async function readMdOrder(mdPath: string): Promise<number | null> {
  try {
    const raw = await readFileContent(mdPath);
    const { data } = matter(raw);
    return typeof data.order === "number" ? data.order : null;
  } catch {
    return null;
  }
}

async function writeMdOrder(mdPath: string, order: number): Promise<void> {
  const raw = await readFileContent(mdPath);
  const { data, content } = matter(raw);
  data.order = order;
  data.modified = new Date().toISOString();
  const fm = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  await writeFileContent(mdPath, matter.stringify(content, fm));
}

async function findEntryMd(
  parentDir: string,
  name: string
): Promise<string | null> {
  const dirIndex = path.join(parentDir, name, "index.md");
  if (await fileExists(dirIndex)) return dirIndex;
  const standalone = path.join(parentDir, `${name}.md`);
  if (await fileExists(standalone)) return standalone;
  if (name.endsWith(".md")) {
    const direct = path.join(parentDir, name);
    if (await fileExists(direct)) return direct;
  }
  return null;
}

export async function getEntryOrder(
  parentVirtualPath: string,
  name: string
): Promise<number | null> {
  const parentDir = parentDirAbs(parentVirtualPath);
  const md = await findEntryMd(parentDir, name);
  if (md) {
    const v = await readMdOrder(md);
    if (v !== null) return v;
  }
  const sidecar = await readSidecar(parentDir);
  return typeof sidecar[name] === "number" ? sidecar[name] : null;
}

export async function setEntryOrder(
  parentVirtualPath: string,
  name: string,
  order: number
): Promise<void> {
  const parentDir = parentDirAbs(parentVirtualPath);
  const md = await findEntryMd(parentDir, name);
  if (md) {
    await writeMdOrder(md, order);
    return;
  }
  const sidecar = await readSidecar(parentDir);
  sidecar[name] = order;
  await writeSidecar(parentDir, sidecar);
}

export async function removeSidecarEntry(
  parentVirtualPath: string,
  name: string
): Promise<void> {
  const parentDir = parentDirAbs(parentVirtualPath);
  const sidecar = await readSidecar(parentDir);
  if (name in sidecar) {
    delete sidecar[name];
    await writeSidecar(parentDir, sidecar);
  }
}

interface SiblingEntry {
  name: string;
  order: number | null;
}

export async function listOrderedSiblings(
  parentVirtualPath: string
): Promise<SiblingEntry[]> {
  const parentDir = parentDirAbs(parentVirtualPath);
  const entries = await listDirectory(parentDir);
  const dirNames = new Set(
    entries.filter((e) => e.isDirectory && !isHiddenEntry(e.name)).map((e) => e.name)
  );
  const sidecar = await readSidecar(parentDir);

  const out: SiblingEntry[] = [];
  for (const e of entries) {
    if (isHiddenEntry(e.name)) continue;
    if (e.name === "CLAUDE.md") continue;
    if (e.name === "index.md") continue;

    let displayName = e.name;
    if (!e.isDirectory && e.name.endsWith(".md")) {
      const base = e.name.replace(/\.md$/, "");
      if (dirNames.has(base)) continue;
      displayName = base;
    }

    const md = await findEntryMd(parentDir, displayName);
    let order: number | null = null;
    if (md) {
      order = await readMdOrder(md);
    }
    if (order === null && typeof sidecar[displayName] === "number") {
      order = sidecar[displayName];
    }
    out.push({ name: displayName, order });
  }

  out.sort((a, b) => {
    const oa = a.order ?? Number.POSITIVE_INFINITY;
    const ob = b.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });
  return out;
}

export async function renumberSiblings(parentVirtualPath: string): Promise<void> {
  const sibs = await listOrderedSiblings(parentVirtualPath);
  let cur = ORDER_GAP;
  for (const s of sibs) {
    await setEntryOrder(parentVirtualPath, s.name, cur);
    cur += ORDER_GAP;
  }
}

export async function computeInsertOrder(
  parentVirtualPath: string,
  prevName: string | null,
  nextName: string | null,
  selfName: string | null = null
): Promise<number> {
  let sibs = await listOrderedSiblings(parentVirtualPath);
  const relevant = sibs.filter((s) => s.name !== selfName);

  const findOrder = (name: string | null): number | null => {
    if (!name) return null;
    const s = relevant.find((x) => x.name === name);
    return s ? s.order : null;
  };

  const referencesNull =
    (prevName && findOrder(prevName) === null) ||
    (nextName && findOrder(nextName) === null);

  if (referencesNull) {
    await renumberSiblings(parentVirtualPath);
    sibs = await listOrderedSiblings(parentVirtualPath);
  }

  const findOrder2 = (name: string | null): number | null => {
    if (!name) return null;
    const s = sibs.filter((x) => x.name !== selfName).find((x) => x.name === name);
    return s ? s.order : null;
  };

  const prevO = findOrder2(prevName);
  const nextO = findOrder2(nextName);

  if (prevO !== null && nextO !== null) {
    if (nextO - prevO > 1) {
      return Math.floor((prevO + nextO) / 2);
    }
    await renumberSiblings(parentVirtualPath);
    const after = await listOrderedSiblings(parentVirtualPath);
    const filtered = after.filter((x) => x.name !== selfName);
    const p = filtered.find((x) => x.name === prevName)?.order ?? null;
    const n = filtered.find((x) => x.name === nextName)?.order ?? null;
    if (p !== null && n !== null && n - p > 1) {
      return Math.floor((p + n) / 2);
    }
    return (p ?? 0) + 1;
  }

  if (prevO !== null) return prevO + ORDER_GAP;
  if (nextO !== null) {
    if (nextO - ORDER_GAP >= 1) return nextO - ORDER_GAP;
    await renumberSiblings(parentVirtualPath);
    const after = await listOrderedSiblings(parentVirtualPath);
    const refreshed = after
      .filter((x) => x.name !== selfName)
      .find((x) => x.name === nextName)?.order;
    if (typeof refreshed === "number") return Math.max(refreshed - ORDER_GAP, 1);
    // nextName disappeared between renumber and re-read (e.g. concurrent
    // delete). Land at 1 so the new item still sorts above whatever the
    // post-renumber first sibling is — ORDER_GAP would tie with it.
    return 1;
  }

  return ORDER_GAP;
}

export async function appendOrder(parentVirtualPath: string): Promise<number> {
  const sibs = await listOrderedSiblings(parentVirtualPath);
  const numeric = sibs.map((s) => s.order).filter((n): n is number => typeof n === "number");
  if (numeric.length === 0) return ORDER_GAP;
  return Math.max(...numeric) + ORDER_GAP;
}
