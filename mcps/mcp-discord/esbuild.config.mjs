import esbuild from "esbuild";
import fs from "fs";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

/**
 * Bundle our own `src/*` into a single ESM file, but leave node_modules deps
 * (discord.js, the MCP SDK, zod) external — they're declared dependencies and
 * installed by npm at the consumer. discord.js is large and has dynamic
 * requires that don't bundle cleanly, so `packages: "external"` is both safer
 * and smaller than inlining everything (the path cabinetai takes for its tiny
 * dependency set).
 */
const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  packages: "external",
  outfile: "dist/index.js",
  banner: { js: "#!/usr/bin/env node" },
  minify: false,
  sourcemap: false,
  define: {
    CABINET_MCP_DISCORD_VERSION: JSON.stringify(pkg.version),
  },
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  console.log("Built dist/index.js");
}
