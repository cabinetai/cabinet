export const log = (msg: string) =>
  console.log(`\x1b[36m>\x1b[0m ${msg}`);

export const success = (msg: string) =>
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);

export const warning = (msg: string) =>
  console.log(`\x1b[33m!\x1b[0m ${msg}`);

export const error = (msg: string): never => {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
  process.exit(1);
};

export const dim = (msg: string) =>
  console.log(`\x1b[2m  ${msg}\x1b[0m`);
