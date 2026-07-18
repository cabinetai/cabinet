import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], {
  env: { ...process.env, STACKADAPT_API_TOKEN: "smoke-token" },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

setTimeout(() => {
  child.kill("SIGTERM");
}, 500);

child.on("exit", (code, signal) => {
  if (code !== 0 && signal !== "SIGTERM") {
    console.error(stderr);
    process.exit(1);
  }
  process.exit(0);
});
