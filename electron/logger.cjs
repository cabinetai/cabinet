// Electron-main twin of src/lib/log/logger.ts (PRD §3.1). The main process
// is plain CJS without the tsx/Next toolchain, so it gets a minimal
// duplicate: same JSONL line shape, same 5 MB x 2 rotation, same console
// capture — writing to <dataDir>/.cabinet-state/logs/electron.log.
/* eslint-disable @typescript-eslint/no-require-imports -- CJS by design, loaded by electron/main.cjs */
"use strict";

const fs = require("fs");
const path = require("path");
const util = require("util");

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };

let logsDir = null;
let minLevel = "info";
let wrapped = false;

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

function logFile() {
  return path.join(logsDir, "electron.log");
}

function rotateIfNeeded(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size < MAX_FILE_BYTES) return;
    const prev = file.replace(/\.log$/, ".1.log");
    fs.rmSync(prev, { force: true });
    fs.renameSync(file, prev);
  } catch {
    // append will create the file
  }
}

function writeLine(level, scope, msg, err) {
  if (!logsDir) return;
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const file = logFile();
    rotateIfNeeded(file);
    const line = {
      ts: new Date().toISOString(),
      lvl: level,
      proc: "electron",
      scope,
      msg: String(msg).slice(0, 4000),
    };
    if (err) {
      line.err = {
        name: err.name || "Error",
        message: String(err.message || err).slice(0, 2000),
        stack: err.stack ? String(err.stack).slice(0, 4000) : undefined,
      };
    }
    fs.appendFileSync(file, JSON.stringify(line) + "\n", "utf-8");
  } catch {
    // never throw from the logger
  }
}

function formatArgs(args) {
  let err;
  const msg = args
    .map((a) => {
      if (a instanceof Error) {
        if (!err) err = a;
        return a.message;
      }
      return typeof a === "string" ? a : util.inspect(a, { depth: 3 });
    })
    .join(" ");
  return { msg, err };
}

function wrapConsole() {
  if (wrapped) return;
  wrapped = true;
  const capture = (level, orig) => {
    return (...args) => {
      orig(...args);
      try {
        const { msg, err } = formatArgs(args);
        writeLine(level, "console", msg, err);
      } catch {
        // capture must never break console
      }
    };
  };
  console.log = capture("info", original.log);
  console.info = capture("info", original.info);
  console.debug = capture("debug", original.debug);
  console.warn = capture("warn", original.warn);
  console.error = capture("error", original.error);
}

function writeCrashMarker(message) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      path.join(logsDir, "last-crash.json"),
      JSON.stringify(
        { ts: new Date().toISOString(), proc: "electron", message: String(message).slice(0, 500) },
        null,
        2
      )
    );
  } catch {
    // best-effort
  }
}

/**
 * @param {string} dataDir managed data directory (logs land under
 *   <dataDir>/.cabinet-state/logs/)
 */
function initElectronLogging(dataDir) {
  logsDir = path.join(dataDir, ".cabinet-state", "logs");
  const env = process.env.CABINET_LOG_LEVEL;
  if (env && LEVEL_RANK[env]) minLevel = env;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(logsDir, "config.json"), "utf-8"));
    if (cfg && LEVEL_RANK[cfg.level]) minLevel = cfg.level;
  } catch {
    // no config — default info
  }
  wrapConsole();
  process.on("uncaughtExceptionMonitor", (err) => {
    writeLine("error", "crash", "uncaught exception", err);
    writeCrashMarker(err && err.message ? err.message : err);
  });
  process.on("unhandledRejection", (reason) => {
    writeLine(
      "error",
      "crash",
      "unhandled rejection",
      reason instanceof Error ? reason : new Error(util.inspect(reason, { depth: 2 }))
    );
  });
  writeLine("info", "boot", `electron logging initialized (level ${minLevel})`);
}

module.exports = { initElectronLogging };
