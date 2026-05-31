declare const CABINETAI_VERSION: string;

/** Package version, injected at build time by esbuild. */
export const VERSION: string = typeof CABINETAI_VERSION !== "undefined"
  ? CABINETAI_VERSION
  : "0.0.0-dev";
