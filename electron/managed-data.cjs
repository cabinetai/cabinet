/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

function classifyManagedDataDirectory(managedDataDir) {
  try {
    const manifest = fs.lstatSync(path.join(managedDataDir, ".cabinet"));
    if (manifest.isFile() && !manifest.isSymbolicLink()) return "cabinet";
  } catch {
    // A missing manifest may still be a new empty directory.
  }

  try {
    const meaningfulEntries = fs
      .readdirSync(managedDataDir)
      .filter((entry) => ![".DS_Store", ".cabinet-state"].includes(entry));
    return meaningfulEntries.length === 0 ? "empty" : "unrecognized";
  } catch (error) {
    if (error?.code === "ENOENT") return "empty";
    return "unrecognized";
  }
}

function shouldSeedDefaultContent(managedDataDir) {
  return classifyManagedDataDirectory(managedDataDir) === "empty";
}

module.exports = {
  classifyManagedDataDirectory,
  shouldSeedDefaultContent,
};
