import esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
  minify: false,
  sourcemap: false,
  define: {
    CABINET_MCP_STACKADAPT_VERSION: JSON.stringify(pkg.version),
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching mcps/mcp-stackadapt...");
} else {
  await esbuild.build(options);
  console.log("Built dist/index.js");
}
