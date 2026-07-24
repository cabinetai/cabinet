/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function shouldSeedDefaultContent(managedDataDir) {
  return !fs.existsSync(path.join(managedDataDir, ".cabinet"));
}

module.exports = {
  shouldSeedDefaultContent,
};
