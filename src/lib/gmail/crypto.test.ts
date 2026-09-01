import test from "node:test";
import assert from "node:assert/strict";

// Guard BEFORE loading the module (require, not import — imports hoist): when
// no .cabinet.env exists (CI), the module must use this env secret instead of
// generating one and writing a file.
process.env.CABINET_GMAIL_KEY_SECRET ??= "test-secret-do-not-persist";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encryptPassword, decryptPassword } = require("./crypto") as typeof import("./crypto");

test("encrypt → decrypt round-trips", () => {
  const plain = "abcdefghijklmnop";
  const stored = encryptPassword(plain);
  assert.match(stored, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  assert.equal(decryptPassword(stored), plain);
});

test("each encryption uses a fresh IV", () => {
  const a = encryptPassword("same");
  const b = encryptPassword("same");
  assert.notEqual(a, b);
  assert.equal(decryptPassword(a), decryptPassword(b));
});

test("tampered ciphertext throws, never returns garbage", () => {
  const stored = encryptPassword("secret");
  const [iv, tag, enc] = stored.split(":");
  const flipped = enc.startsWith("0") ? "1" + enc.slice(1) : "0" + enc.slice(1);
  assert.throws(() => decryptPassword([iv, tag, flipped].join(":")), /Failed to decrypt/);
  assert.throws(() => decryptPassword("not-hex"), /Invalid encrypted password format/);
});
