import readline from "node:readline";

export function confirm(question: string, defaultYes = false): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(`  (non-interactive shell — refusing destructive action)`);
    return Promise.resolve(false);
  }
  return ask(question, defaultYes);
}

/**
 * Prompt-or-default: in non-interactive shells, returns `nonInteractiveDefault`
 * silently rather than refusing. Use for soft warnings where we want to keep
 * existing behavior unchanged for CI/scripts.
 */
export function confirmOrContinue(
  question: string,
  nonInteractiveDefault: boolean,
  defaultYes = true
): Promise<boolean> {
  if (!process.stdin.isTTY) return Promise.resolve(nonInteractiveDefault);
  return ask(question, defaultYes);
}

function ask(question: string, defaultYes: boolean): Promise<boolean> {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`  ${question} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) return resolve(defaultYes);
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}
