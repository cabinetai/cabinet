import { Command } from "commander";
import { registerCreate } from "./commands/create.js";
import { registerRun } from "./commands/run.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerUpdate } from "./commands/update.js";
import { registerImport } from "./commands/import.js";
import { registerList } from "./commands/list.js";
import { registerUninstall } from "./commands/uninstall.js";
import { registerResetConfig } from "./commands/reset-config.js";

import { VERSION } from "./version.js";

const program = new Command();

program
  .name("cabinetai")
  .description("Cabinet CLI — AI-first self-hosted knowledge base")
  .version(VERSION);

registerCreate(program);
registerRun(program);
registerDoctor(program);
registerUpdate(program);
registerImport(program);
registerList(program);
registerUninstall(program);
registerResetConfig(program);

program.parse();
