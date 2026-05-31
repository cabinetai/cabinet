import esbuild from "esbuild";
import fs from "fs";

const watch = process.argv.includes("--watch");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "dist/index.js",
  banner: { js: "#!/usr/bin/env node" },
  external: [],
  minify: false,
  sourcemap: false,
  define: {
    "CABINETAI_VERSION": JSON.stringify(pkg.version),
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
