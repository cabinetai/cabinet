import test from "node:test";
import assert from "node:assert/strict";
import { hermesDesktopCommand } from "./desktop-escape";

test("Hermes Desktop escape hatch uses a fixed macOS application target", () => {
  assert.deepEqual(hermesDesktopCommand("darwin"), {
    command: "open",
    args: ["-a", "Hermes"],
    application: "/Applications/Hermes.app",
  });
});

test("Hermes Desktop escape hatch fails closed on unverified platforms", () => {
  assert.equal(hermesDesktopCommand("linux"), null);
  assert.equal(hermesDesktopCommand("win32"), null);
});
