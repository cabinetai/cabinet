import {
  setWorkspaceSyncActivePath,
  syncWorkspace,
} from "../../src/lib/git/git-service";

async function main() {
  if (process.env.CABINET_TEST_REGISTERED_ACTIVE_PATH) {
    setWorkspaceSyncActivePath(
      "test-window",
      process.env.CABINET_TEST_REGISTERED_ACTIVE_PATH,
    );
  }
  const status = await syncWorkspace({
    activePath: process.env.CABINET_TEST_ACTIVE_PATH || null,
    automatic: process.env.CABINET_TEST_AUTOMATIC === "true",
  });
  process.stdout.write(JSON.stringify(status));
}

void main();
