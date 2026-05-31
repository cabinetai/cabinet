import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "../src/lib/storage/path-utils";
import { renamePage } from "../src/lib/storage/page-io";
import { undoRename } from "../src/lib/storage/rename-undo";

function uniqueRoot(): string {
  return `__rnrefs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function writePageDir(root: string, rel: string, title: string, body: string) {
  const dir = path.join(DATA_DIR, root, rel);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "index.md"),
    `---\ntitle: ${title}\n---\n\n${body}\n`,
    "utf8"
  );
}

async function readPageBody(root: string, rel: string): Promise<string> {
  return fs.readFile(path.join(DATA_DIR, root, rel, "index.md"), "utf8");
}

test("rename rewrites every inbound wiki-link and leaves others alone", async () => {
  const root = uniqueRoot();
  try {
    await writePageDir(root, "alpha", "Alpha", "# Alpha");
    await writePageDir(
      root,
      "beta",
      "Beta",
      "See [[Alpha]] and again [[alpha]] but not [[Unrelated]]."
    );
    await writePageDir(root, "gamma", "Gamma", "Ref [[Alpha]] here.");

    const { newPath, references } = await renamePage(
      `${root}/alpha`,
      "Alpha Prime"
    );

    assert.equal(newPath, `${root}/alpha-prime`);
    assert.equal(references.linkCount, 3);
    assert.equal(references.pageCount, 2);

    const beta = await readPageBody(root, "beta");
    assert.match(beta, /\[\[Alpha Prime\]\] and again \[\[Alpha Prime\]\]/);
    assert.match(beta, /\[\[Unrelated\]\]/);
    assert.ok(!/\[\[Alpha\]\]/.test(beta) && !/\[\[alpha\]\]/.test(beta));

    const gamma = await readPageBody(root, "gamma");
    assert.match(gamma, /\[\[Alpha Prime\]\]/);
  } finally {
    await fs.rm(path.join(DATA_DIR, root), { recursive: true, force: true });
  }
});

test("ambiguous slugs: only links resolving to the renamed page are rewritten", async () => {
  const root = uniqueRoot();
  try {
    await writePageDir(root, "teamA/notes", "Notes", "# A notes");
    await writePageDir(root, "teamA/log", "A Log", "Track [[Notes]] daily.");
    await writePageDir(root, "teamB/notes", "Notes", "# B notes");
    await writePageDir(root, "teamB/log", "B Log", "Track [[Notes]] daily.");

    const { references } = await renamePage(
      `${root}/teamA/notes`,
      "Notes Renamed"
    );

    assert.equal(references.linkCount, 1);
    const aLog = await readPageBody(root, "teamA/log");
    const bLog = await readPageBody(root, "teamB/log");
    assert.match(aLog, /\[\[Notes Renamed\]\]/);
    assert.match(bLog, /\[\[Notes\]\]/);
    assert.ok(!/Renamed/.test(bLog));
  } finally {
    await fs.rm(path.join(DATA_DIR, root), { recursive: true, force: true });
  }
});

test("undo restores directory, title and every rewritten file byte-for-byte", async () => {
  const root = uniqueRoot();
  try {
    await writePageDir(root, "alpha", "Alpha", "# Alpha");
    await writePageDir(root, "beta", "Beta", "Link [[Alpha]] here.");

    const betaBefore = await readPageBody(root, "beta");
    const alphaBefore = await readPageBody(root, "alpha");

    const { references } = await renamePage(`${root}/alpha`, "Alpha Prime");
    assert.ok(references.undoToken);

    // Sanity: things actually changed.
    assert.match(await readPageBody(root, "beta"), /\[\[Alpha Prime\]\]/);
    await assert.rejects(() => readPageBody(root, "alpha"));

    const outcome = await undoRename(references.undoToken!);
    assert.equal(outcome.ok, true);

    assert.equal(await readPageBody(root, "beta"), betaBefore);
    assert.equal(await readPageBody(root, "alpha"), alphaBefore);
    await assert.rejects(() => readPageBody(root, "alpha-prime"));

    // Token is single-use.
    const second = await undoRename(references.undoToken!);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "expired");
  } finally {
    await fs.rm(path.join(DATA_DIR, root), { recursive: true, force: true });
  }
});

test("no-op rename (same slug) reports nothing and no undo token", async () => {
  const root = uniqueRoot();
  try {
    await writePageDir(root, "alpha", "Alpha", "# Alpha");
    const { newPath, references } = await renamePage(`${root}/alpha`, "Alpha");
    assert.equal(newPath, `${root}/alpha`);
    assert.equal(references.linkCount, 0);
    assert.equal(references.undoToken, null);
  } finally {
    await fs.rm(path.join(DATA_DIR, root), { recursive: true, force: true });
  }
});
