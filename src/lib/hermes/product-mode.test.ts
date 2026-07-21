import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceHermesPersonaWrite,
  projectHermesPersona,
} from "./product-mode";

test("Hermes persona writes override hostile provider and adapter values", () => {
  assert.deepEqual(
    enforceHermesPersonaWrite({
      name: "Research",
      provider: "codex-cli",
      adapterType: "codex_cli_legacy",
    }),
    {
      name: "Research",
      provider: "hermes",
      adapterType: "hermes_runtime",
    }
  );
});

test("the canonical editor is presented as the Operator without mutating storage", () => {
  const stored = {
    slug: "editor",
    name: "Editor",
    role: "KB editor",
    provider: "claude-code",
  };
  const projected = projectHermesPersona(stored);

  assert.equal(projected.name, "Operator");
  assert.equal(projected.role, "Hermes operator for this Cabinet");
  assert.equal(projected.provider, "hermes");
  assert.equal(projected.adapterType, "hermes_runtime");
  assert.equal(stored.name, "Editor");
  assert.equal(stored.provider, "claude-code");
});

test("additional roles are projected onto the same Hermes runtime", () => {
  const projected = projectHermesPersona({
    slug: "researcher",
    name: "Researcher",
    provider: "gemini-cli",
  });
  assert.equal(projected.name, "Researcher");
  assert.equal(projected.provider, "hermes");
  assert.equal(projected.adapterType, "hermes_runtime");
});
