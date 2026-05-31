import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // User data / archives / generated outputs are not app source code.
    ".audit-shots/**",
    "data/**",
    "data-old*/**",
    "old-data/**",
    "cabinetai/dist/**",
  ]),
]);

export default eslintConfig;
