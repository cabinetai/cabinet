/**
 * AES-256-GCM encrypt/decrypt for Gmail App Passwords.
 * Server-side only — never import in client components.
 */

import crypto from "crypto";
import { DATA_DIR } from "@/lib/storage/path-utils";
import { upsertCabinetEnv } from "@/lib/runtime/cabinet-env";

const ALGORITHM = "aes-256-gcm";
const SALT = "cabinet-gmail-v1";
const ITERATIONS = 100_000;
const KEY_LEN = 32;
const DIGEST = "sha256";
const KEY_SECRET_ENV = "CABINET_GMAIL_KEY_SECRET";

/**
 * Per-install random secret, persisted in `.cabinet.env` (0600, gitignored,
 * separate from the SQLite DB). Without it the key was derivable from the
 * install path alone, so anyone with just the database could reconstruct it and
 * decrypt stored app passwords. Generated lazily on first use and held in
 * `process.env` so encrypt and decrypt always agree within a run even if the
 * file write fails.
 */
function getKeySecret(): string {
  const existing = process.env[KEY_SECRET_ENV]?.trim();
  if (existing) return existing;
  const secret = crypto.randomBytes(32).toString("hex");
  process.env[KEY_SECRET_ENV] = secret;
  try {
    upsertCabinetEnv(KEY_SECRET_ENV, secret);
  } catch {
    // Best-effort persistence; the in-process value keeps this run consistent.
  }
  return secret;
}

function deriveKey(secret: string): Buffer {
  const passphrase = `cabinet:${DATA_DIR}:gmail:${secret}`;
  return crypto.pbkdf2Sync(passphrase, SALT, ITERATIONS, KEY_LEN, DIGEST);
}

// Legacy key (pre-secret): deterministic from DATA_DIR alone. Retained only so
// passwords stored before the secret was introduced still decrypt; they upgrade
// to the strong key the next time the user reconnects.
function deriveLegacyKey(): Buffer {
  return crypto.pbkdf2Sync(`cabinet:${DATA_DIR}:gmail`, SALT, ITERATIONS, KEY_LEN, DIGEST);
}

export function encryptPassword(plaintext: string): string {
  const key = deriveKey(getKeySecret());
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Store as iv:authTag:ciphertext — all hex
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptPassword(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted password format");
  const [ivHex, authTagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  // Try the strong (secret-derived) key first, then the legacy key so passwords
  // stored before the secret existed still decrypt. GCM's auth tag makes a wrong
  // key fail in final(), so the fallback is unambiguous.
  for (const key of [deriveKey(getKeySecret()), deriveLegacyKey()]) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key — try the next one.
    }
  }
  throw new Error("Failed to decrypt Gmail password");
}
