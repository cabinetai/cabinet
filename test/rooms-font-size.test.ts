import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// Per-room fontSize (room.fontSize in the .cabinet manifest) — validation,
// round-trip through updateRoomMeta, and clearing back to null.

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-fontsize-"));
process.env.CABINET_DATA_DIR = tempRoot;

function roomsModule() {
  return import("../src/lib/cabinets/rooms");
}

function scaffoldRoom(slug: string) {
  const dir = path.join(tempRoot, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".cabinet"),
    ["schemaVersion: 1", `name: ${slug}`, "kind: room", "entry: index.md"].join("\n"),
    "utf-8"
  );
}

test("isValidFontSize accepts CSS lengths and rejects free-form strings", async () => {
  const { isValidFontSize } = await roomsModule();
  for (const ok of ["12px", "0.9rem", "14pt", "1.1em", "95%"]) {
    assert.equal(isValidFontSize(ok), true, ok);
  }
  for (const bad of ["12", "calc(1rem + 2px)", "12px; color: red", "url(x)", ""]) {
    assert.equal(isValidFontSize(bad), false, bad);
  }
});

test("updateRoomMeta round-trips fontSize through the manifest", async () => {
  const { updateRoomMeta, listRooms } = await roomsModule();
  scaffoldRoom("roomA");
  const updated = await updateRoomMeta("roomA", { fontSize: "12px" });
  assert.equal(updated.fontSize, "12px");

  const listed = (await listRooms()).find((r) => r.path === "roomA");
  assert.equal(listed?.fontSize, "12px");
});

test("updateRoomMeta rejects a non-length fontSize", async () => {
  const { updateRoomMeta } = await roomsModule();
  scaffoldRoom("roomB");
  await assert.rejects(
    () => updateRoomMeta("roomB", { fontSize: "12px; position: fixed" }),
    /invalid: fontSize/
  );
});

test("fontSize: null clears the field", async () => {
  const { updateRoomMeta } = await roomsModule();
  scaffoldRoom("roomC");
  await updateRoomMeta("roomC", { fontSize: "0.9rem" });
  const cleared = await updateRoomMeta("roomC", { fontSize: null });
  assert.equal(cleared.fontSize, null);
});
