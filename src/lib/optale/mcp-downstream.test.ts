import test from "node:test";
import assert from "node:assert/strict";
import { parseEventStream } from "./mcp-downstream";

test("parseEventStream returns the final parseable SSE payload", () => {
  const parsed = parseEventStream(
    [
      'event: message\ndata: {"jsonrpc":"2.0","method":"progress","params":{"step":1}}',
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"final"}]}}',
      "data: [DONE]",
    ].join("\n\n")
  );

  assert.deepEqual(parsed, {
    jsonrpc: "2.0",
    id: 2,
    result: {
      content: [{ type: "text", text: "final" }],
    },
  });
});
