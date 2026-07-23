import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  cabinetEnvPath,
  loadCabinetEnv,
  removeCabinetEnv,
  upsertCabinetEnv,
} from "./cabinet-env";

test("explicit Cabinet environment file is absolute, regular, owner-only, and not a symlink", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-env-file-test-"));
  const envFile = path.join(root, "cabinet.env");
  const link = path.join(root, "cabinet.env.link");
  const previous = process.env.CABINET_ENV_FILE;
  try {
    fs.writeFileSync(envFile, "CABINET_AUTH_SALT=fixture\n", { mode: 0o600 });
    process.env.CABINET_ENV_FILE = envFile;
    assert.equal(cabinetEnvPath(), envFile);

    fs.chmodSync(envFile, 0o640);
    assert.throws(() => cabinetEnvPath(), /group or other access/);
    fs.chmodSync(envFile, 0o600);

    fs.symlinkSync(envFile, link);
    process.env.CABINET_ENV_FILE = link;
    assert.throws(() => cabinetEnvPath(), /regular file, not a symlink/);

    process.env.CABINET_ENV_FILE = "relative.env";
    assert.throws(() => cabinetEnvPath(), /absolute path/);
  } finally {
    if (previous === undefined) delete process.env.CABINET_ENV_FILE;
    else process.env.CABINET_ENV_FILE = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("process-owned no-tools state cannot be weakened by the env file or runtime writes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cabinet-env-owned-test-"));
  const envFile = path.join(root, "cabinet.env");
  const previousFile = process.env.CABINET_ENV_FILE;
  const previousNoTools = process.env.CABINET_HERMES_EXECUTION_NO_TOOLS;
  try {
    fs.writeFileSync(
      envFile,
      "CABINET_HERMES_EXECUTION_NO_TOOLS=false\n",
      { mode: 0o600 },
    );
    process.env.CABINET_ENV_FILE = envFile;
    process.env.CABINET_HERMES_EXECUTION_NO_TOOLS = "true";
    loadCabinetEnv();
    assert.equal(process.env.CABINET_HERMES_EXECUTION_NO_TOOLS, "true");
    assert.throws(
      () => upsertCabinetEnv("CABINET_HERMES_EXECUTION_NO_TOOLS", "false"),
      /process-owned/,
    );
    assert.throws(
      () => removeCabinetEnv("CABINET_HERMES_EXECUTION_NO_TOOLS"),
      /process-owned/,
    );
    assert.equal(
      fs.readFileSync(envFile, "utf8"),
      "CABINET_HERMES_EXECUTION_NO_TOOLS=false\n",
    );
    assert.equal(process.env.CABINET_HERMES_EXECUTION_NO_TOOLS, "true");
  } finally {
    if (previousFile === undefined) delete process.env.CABINET_ENV_FILE;
    else process.env.CABINET_ENV_FILE = previousFile;
    if (previousNoTools === undefined) {
      delete process.env.CABINET_HERMES_EXECUTION_NO_TOOLS;
    } else {
      process.env.CABINET_HERMES_EXECUTION_NO_TOOLS = previousNoTools;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
