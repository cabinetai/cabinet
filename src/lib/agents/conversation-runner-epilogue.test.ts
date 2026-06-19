import test from "node:test";
import assert from "node:assert/strict";
import { buildCabinetEpilogueInstructions } from "./conversation-runner";
import { parseAgentActions } from "./action-parser";

// Regression: a CEO heartbeat once dispatched a phantom task by copying a
// realistic dispatch example verbatim out of its own system prompt
// ("editor | Draft launch copy | outline the hero | effort=high"). The fix
// makes every example in the epilogue a pure <angle-bracket> template, so any
// verbatim echo (a) doesn't read like a real task and (b) resolves to the
// agent slug "<agent-slug>", which validation hard-blocks as unknown_agent.

test("dispatch epilogue contains no concretely-dispatchable example", async () => {
  const epilogue = await buildCabinetEpilogueInstructions({ canDispatch: true });

  // No leftover concrete example values from the old prompt/docs.
  assert.ok(!epilogue.includes("outline the hero"));
  assert.ok(!epilogue.includes("Draft launch copy"));

  // Every parsed example action targets a placeholder slug — so if an agent
  // echoes it verbatim, computeWarnings flags unknown_agent and blocks it.
  const { actions } = parseAgentActions(epilogue);
  for (const action of actions) {
    if (action.type === "SEND_EMAIL") continue;
    assert.ok(
      action.agent.startsWith("<"),
      `epilogue example resolved to a real-looking agent slug: ${action.agent}`
    );
  }
});
