import type { Command } from "commander";
import fs from "fs";
import path from "path";
import { log, success, error } from "../lib/log.js";
import { slugify, findCabinetRoot } from "../lib/paths.js";
import { scaffoldCabinetDir } from "../lib/scaffold.js";

export function registerCreate(program: Command): void {
  program
    .command("create [name]")
    .description("Create a new cabinet directory")
    .action((name?: string) => {
      const cabinetName = name?.trim();
      if (!cabinetName) {
        error("Please provide a cabinet name. Usage: npx cabinetai create <name>");
        return;
      }
      createCabinet(cabinetName);
    });
}

function createCabinet(name: string): void {
  const slug = slugify(name);
  if (!slug) {
    error(`Invalid cabinet name: "${name}"`);
  }

  const targetDir = path.resolve(process.cwd(), slug);

  if (fs.existsSync(targetDir)) {
    error(`Directory "${slug}" already exists.`);
  }

  // Detect if we're inside an existing cabinet (creating a child)
  const parentCabinetRoot = findCabinetRoot(process.cwd());
  const isChild = parentCabinetRoot !== null;
  const kind = isChild ? "child" : "root";

  log(`Creating ${kind} cabinet "${name}" in ./${slug}/...`);

  scaffoldCabinetDir({
    targetDir,
    name,
    kind,
  });

  success(`Cabinet "${name}" created at ./${slug}/`);

  if (isChild) {
    console.log(`\n  This is a child cabinet of ${parentCabinetRoot}.`);
  }

  console.log(`
  Next steps:

    cd ${slug}
    npx cabinetai run
`);
}
