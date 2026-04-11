import test from "node:test";
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { terminateChildProcess } from "./process-utils";

test("terminateChildProcess uses taskkill on Windows when pid exists", async () => {
  const proc = {
    pid: 4321,
    killCalled: false,
    kill() {
      this.killCalled = true;
      return true;
    },
  } as unknown as ChildProcess & { killCalled: boolean };

  const calls: Array<{ command: string; args: string[] }> = [];
  await terminateChildProcess(proc, {
    platform: "win32",
    taskkill(command, args) {
      calls.push({ command, args });
      return Promise.resolve();
    },
  });

  assert.deepEqual(calls, [
    { command: "taskkill.exe", args: ["/PID", "4321", "/T", "/F"] },
  ]);
  assert.equal(proc.killCalled, false);
});

test("terminateChildProcess falls back to proc.kill on Windows when taskkill fails", async () => {
  const proc = {
    pid: 4321,
    killCalled: false,
    kill() {
      this.killCalled = true;
      return true;
    },
  } as unknown as ChildProcess & { killCalled: boolean };

  await terminateChildProcess(proc, {
    platform: "win32",
    taskkill() {
      return Promise.reject(new Error("taskkill failed"));
    },
  });

  assert.equal(proc.killCalled, true);
});

test("terminateChildProcess uses proc.kill on non-Windows", async () => {
  const proc = {
    pid: 123,
    killCalled: false,
    kill() {
      this.killCalled = true;
      return true;
    },
  } as unknown as ChildProcess & { killCalled: boolean };

  await terminateChildProcess(proc, {
    platform: "linux",
  });

  assert.equal(proc.killCalled, true);
});

test("terminateChildProcess handles missing pid on Windows without throwing", async () => {
  const proc = {
    pid: undefined,
    killCalled: false,
    kill() {
      this.killCalled = true;
      return true;
    },
  } as unknown as ChildProcess & { killCalled: boolean };

  await terminateChildProcess(proc, {
    platform: "win32",
    taskkill() {
      throw new Error("should not be called");
    },
  });

  assert.equal(proc.killCalled, true);
});
