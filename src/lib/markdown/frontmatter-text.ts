import yaml from "js-yaml";
import type { FrontMatter } from "@/types";

// The markdown source view shows the file as it lives on disk: a YAML
// frontmatter block followed by the body. These helpers mirror gray-matter's
// on-disk shape but run client-side (js-yaml only, no node deps) so the editor
// can round-trip frontmatter through the textarea without losing it.

export function stringifyFrontmatter(
  frontmatter: FrontMatter | null,
  body: string
): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return body;
  const dumped = yaml
    .dump(frontmatter, { lineWidth: -1, skipInvalid: true })
    .trimEnd();
  return `---\n${dumped}\n---\n\n${body}`;
}

export function parseFrontmatter(source: string): {
  frontmatter: Record<string, unknown> | null;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { frontmatter: null, body: source };
  try {
    const data = yaml.load(match[1]);
    const body = source.slice(match[0].length).replace(/^\r?\n/, "");
    if (data && typeof data === "object") {
      return { frontmatter: data as Record<string, unknown>, body };
    }
    return { frontmatter: null, body };
  } catch {
    const body = source.slice(match[0].length).replace(/^\r?\n/, "");
    return { frontmatter: null, body };
  }
}
