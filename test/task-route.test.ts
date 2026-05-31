import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskHash, buildTaskHref, buildTasksHash } from "@/lib/navigation/task-route";

test("task routes use the short root alias for the root cabinet", () => {
  assert.equal(buildTasksHash("."), "#/tasks");
  assert.equal(buildTaskHash("task-123", "."), "#/tasks/task-123");
  assert.equal(buildTaskHref("task-123", "."), "/#/tasks/task-123");
});

test("task routes preserve cabinet scope for nested cabinets", () => {
  assert.equal(
    buildTasksHash("example-text-your-mom/marketing"),
    "#/cabinet/example-text-your-mom%2Fmarketing/tasks"
  );
  assert.equal(
    buildTaskHash("launch review", "example-text-your-mom/marketing"),
    "#/cabinet/example-text-your-mom%2Fmarketing/tasks/launch%20review"
  );
});
