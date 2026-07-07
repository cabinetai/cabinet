import katex from "katex";

export interface LatexRenderResult {
  /** Rendered HTML for the document body. */
  html: string;
  /** Names of LaTeX commands/environments encountered that we don't support. */
  unsupported: string[];
  /** Whether rendering produced meaningful content. */
  ok: boolean;
}

const PLACEHOLDER_OPEN = "\uE000";
const PLACEHOLDER_CLOSE = "\uE001";

/** Math environments that KaTeX can render in display mode. */
const MATH_ENVIRONMENTS = [
  "equation",
  "equation*",
  "align",
  "align*",
  "alignat",
  "alignat*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
];

/** Strip TeX comments (`%` to end of line) while respecting escaped `\%`. */
function stripComments(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      let result = "";
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "%" && (i === 0 || line[i - 1] !== "\\")) break;
        result += line[i];
      }
      return result;
    })
    .join("\n");
}

/**
 * Given a string and the index of an opening `{`, return the content between
 * the matching braces and the index just past the closing `}`.
 */
function readBracedArg(str: string, openIndex: number): { content: string; end: number } | null {
  if (str[openIndex] !== "{") return null;
  let depth = 0;
  for (let i = openIndex; i < str.length; i++) {
    const ch = str[i];
    if (ch === "{" && str[i - 1] !== "\\") depth++;
    else if (ch === "}" && str[i - 1] !== "\\") {
      depth--;
      if (depth === 0) return { content: str.slice(openIndex + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Parse simple `\newcommand`/`\renewcommand` definitions into a KaTeX macro map. */
function extractMacros(preamble: string): Record<string, string> {
  const macros: Record<string, string> = {};
  const re = /\\(?:re)?newcommand\*?\s*\{?\\([a-zA-Z]+)\}?(?:\[(\d+)\])?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(preamble)) !== null) {
    const name = m[1];
    const braceStart = re.lastIndex - 1;
    const arg = readBracedArg(preamble, braceStart);
    if (arg) {
      macros[`\\${name}`] = arg.content;
      re.lastIndex = arg.end;
    }
  }
  return macros;
}

/** Read the braced argument of a preamble command like \title{...}. */
function preambleArg(preamble: string, cmd: string): string | null {
  const re = new RegExp(`\\\\${cmd}\\s*\\{`);
  const m = re.exec(preamble);
  if (!m) return null;
  const arg = readBracedArg(preamble, m.index + m[0].length - 1);
  return arg ? arg.content : null;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface MathToken {
  html: string;
}

/**
 * Replace all math segments in `body` with placeholder tokens, rendering each
 * with KaTeX. Returns the modified body and the list of rendered tokens.
 */
function extractMath(
  body: string,
  macros: Record<string, string>,
  unsupported: Set<string>,
): { text: string; tokens: MathToken[] } {
  const tokens: MathToken[] = [];

  const renderMath = (tex: string, displayMode: boolean): string => {
    try {
      const html = katex.renderToString(tex.trim(), {
        displayMode,
        throwOnError: false,
        macros: { ...macros },
        strict: false,
        trust: true,
      });
      // Only plain (un-numbered) display math may scroll horizontally. KaTeX
      // centers numbered equations with 50%-wide glue columns; making such a
      // box a scroll container leaves a permanent sub-pixel scrollbar. Tag the
      // safe ones explicitly so the CSS doesn't rely on `:has()` support.
      if (displayMode && !html.includes("eqn-num")) {
        return html.replace('class="katex-display"', 'class="katex-display katex-scrollable"');
      }
      return html;
    } catch (e) {
      unsupported.add(`math: ${(e as Error).message}`);
      return `<code class="latex-math-error">${escapeHtml(tex)}</code>`;
    }
  };

  const pushToken = (html: string): string => {
    tokens.push({ html });
    return `${PLACEHOLDER_OPEN}${tokens.length - 1}${PLACEHOLDER_CLOSE}`;
  };

  let text = body;

  // Display math environments: \begin{equation}...\end{equation}, etc.
  for (const env of MATH_ENVIRONMENTS) {
    const escaped = env.replace(/[*]/g, "\\*");
    const re = new RegExp(`\\\\begin\\{${escaped}\\}([\\s\\S]*?)\\\\end\\{${escaped}\\}`, "g");
    text = text.replace(re, (_full, inner: string) => {
      // KaTeX understands the aligned/gathered forms when wrapped in the env.
      const wrapped = `\\begin{${env}}${inner}\\end{${env}}`;
      return pushToken(renderMath(wrapped, true));
    });
  }

  // Display math: \[ ... \] and $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_full, inner: string) =>
    pushToken(renderMath(inner, true)),
  );
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_full, inner: string) =>
    pushToken(renderMath(inner, true)),
  );

  // Inline math: \( ... \)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_full, inner: string) =>
    pushToken(renderMath(inner, false)),
  );

  // Inline math: $ ... $ (not $$, already handled). Avoid escaped \$.
  text = text.replace(/(?<!\\)\$([^$]+?)(?<!\\)\$/g, (_full, inner: string) =>
    pushToken(renderMath(inner, false)),
  );

  return { text, tokens };
}

/** Convert a known list environment body into <li> items. */
function convertListItems(inner: string, processInline: (s: string) => string): string {
  const parts = inner.split(/\\item\b/).map((p) => p.trim());
  // First part before the first \item is usually empty.
  const items = parts.slice(1);
  if (items.length === 0) return "";
  return items.map((it) => `<li>${processInline(it)}</li>`).join("");
}

/** Inline command handlers: command name -> wrapping HTML tag. */
const INLINE_WRAPPERS: Record<string, [string, string]> = {
  textbf: ["<strong>", "</strong>"],
  textit: ["<em>", "</em>"],
  emph: ["<em>", "</em>"],
  textsl: ["<em>", "</em>"],
  texttt: ["<code>", "</code>"],
  textsc: ['<span class="latex-sc">', "</span>"],
  underline: ["<u>", "</u>"],
  textsuperscript: ["<sup>", "</sup>"],
  textsubscript: ["<sub>", "</sub>"],
  text: ["", ""],
  mbox: ["", ""],
  mathrm: ["", ""],
};

/** Commands whose single braced argument should simply be unwrapped. */
const UNWRAP_COMMANDS = new Set(["small", "large", "Large", "huge", "normalsize", "footnotesize", "tiny", "scriptsize", "bf", "it", "em", "rm", "sf", "tt", "sc", "centering", "raggedright", "raggedleft", "noindent"]);

/** The stylized TeX/LaTeX logos, reproduced with CSS-positioned letters. */
const TEX_LOGO = '<span class="tex-logo">T<span class="tex-e">e</span>X</span>';
const LATEX_LOGO = `<span class="latex-logo">L<span class="latex-a">a</span>${TEX_LOGO}</span>`;

/** Format the current date the way LaTeX's \today does: "Month D, YYYY". */
function todayString(): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Zero-argument text macros that expand to a fixed symbol/markup. These are
 * built-in LaTeX commands (logos, typographic symbols), not user macros.
 */
function textMacro(name: string): string | null {
  switch (name) {
    case "LaTeX":
      return LATEX_LOGO;
    case "LaTeXe":
      return `${LATEX_LOGO}<span class="latex-2e">2&#x03b5;</span>`;
    case "TeX":
      return TEX_LOGO;
    case "today":
      return escapeHtml(todayString());
    case "copyright":
      return "&copy;";
    case "textcopyright":
      return "&copy;";
    case "textregistered":
      return "&reg;";
    case "texttrademark":
      return "&trade;";
    case "pounds":
    case "textsterling":
      return "&pound;";
    case "texteuro":
    case "euro":
      return "&euro;";
    case "dag":
      return "&dagger;";
    case "ddag":
      return "&Dagger;";
    case "S":
      return "&sect;";
    case "P":
      return "&para;";
    case "textbackslash":
      return "\\";
    case "textbar":
      return "|";
    case "textless":
      return "&lt;";
    case "textgreater":
      return "&gt;";
    case "textasciitilde":
      return "~";
    case "textasciicircum":
      return "^";
    case "textbullet":
      return "&bull;";
    case "textendash":
      return "&ndash;";
    case "textemdash":
      return "&mdash;";
    default:
      return null;
  }
}

/** Process inline LaTeX commands within already-HTML-escaped text. */
function processInline(input: string, unsupported: Set<string>): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === "\\") {
      // Line break: \\ or \\[len]
      if (input[i + 1] === "\\") {
        let j = i + 2;
        if (input[j] === "[") {
          const close = input.indexOf("]", j);
          if (close !== -1) j = close + 1;
        }
        out += "<br/>";
        i = j;
        continue;
      }

      const m = /^\\([a-zA-Z]+)\*?/.exec(input.slice(i));
      if (m) {
        const name = m[1];
        let j = i + m[0].length;

        // Links: \href{url}{text} and \url{url}
        if (name === "href") {
          const a1 = input[j] === "{" ? readBracedArg(input, j) : null;
          if (a1) {
            const a2 = input[a1.end] === "{" ? readBracedArg(input, a1.end) : null;
            if (a2) {
              const url = a1.content.replace(/&amp;/g, "&");
              out += `<a href="${url}" target="_blank" rel="noopener noreferrer">${processInline(a2.content, unsupported)}</a>`;
              i = a2.end;
              continue;
            }
          }
        }
        if (name === "url") {
          const a1 = input[j] === "{" ? readBracedArg(input, j) : null;
          if (a1) {
            const url = a1.content.replace(/&amp;/g, "&");
            out += `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
            i = a1.end;
            continue;
          }
        }

        // Wrapping commands: \textbf{...}, \emph{...}, etc.
        if (name in INLINE_WRAPPERS) {
          const arg = input[j] === "{" ? readBracedArg(input, j) : null;
          if (arg) {
            const [open, close] = INLINE_WRAPPERS[name];
            out += open + processInline(arg.content, unsupported) + close;
            i = arg.end;
            continue;
          }
        }

        // Built-in zero-arg text macros: \LaTeX, \TeX, \today, \copyright, …
        const symbol = textMacro(name);
        if (symbol !== null) {
          out += symbol;
          // Match LaTeX spacing: a brace-less control word (\LaTeX is) gobbles
          // following spaces, but \LaTeX{} ends the macro and keeps the space.
          if (input[j] === "{" && input[j + 1] === "}") {
            j += 2;
          } else {
            while (input[j] === " ") j++;
          }
          i = j;
          continue;
        }

        // Font/size switches inside a group: \small, \bf, etc. -> drop the command.
        if (UNWRAP_COMMANDS.has(name)) {
          i = j;
          continue;
        }

        // Spacing commands.
        if (name === "ldots" || name === "dots") {
          out += "&hellip;";
          i = j;
          continue;
        }
        if (name === "quad") {
          out += "&emsp;";
          i = j;
          continue;
        }
        if (name === "qquad") {
          out += "&emsp;&emsp;";
          i = j;
          continue;
        }

        // Unknown command: record it, then drop the command but keep any
        // braced argument content so we don't lose text.
        unsupported.add(`\\${name}`);
        if (input[j] === "{") {
          const arg = readBracedArg(input, j);
          if (arg) {
            out += processInline(arg.content, unsupported);
            i = arg.end;
            continue;
          }
        }
        i = j;
        continue;
      }

      // Escaped special characters: \%, \&, \_, \#, \$, \{, \}
      const esc = input[i + 1];
      if (esc && "%&_#${}".includes(esc)) {
        out += esc === "&" ? "&amp;" : esc;
        i += 2;
        continue;
      }
      // Non-breaking space style commands: \, \; \: \!
      if (esc === " " || esc === "," || esc === ";" || esc === ":" || esc === "!") {
        out += " ";
        i += 2;
        continue;
      }
      out += "\\";
      i += 1;
      continue;
    }

    // Group braces: keep content, drop braces.
    if (ch === "{" || ch === "}") {
      i += 1;
      continue;
    }

    if (ch === "~") {
      out += "&nbsp;";
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  // Typographic replacements.
  out = out
    .replace(/---/g, "&mdash;")
    .replace(/--/g, "&ndash;")
    .replace(/``/g, "&ldquo;")
    .replace(/''/g, "&rdquo;")
    .replace(/`/g, "&lsquo;")
    .replace(/'/g, "&rsquo;");

  return out;
}

/** Convert block-level structure (environments, sections) into HTML. */
function processBlocks(input: string, unsupported: Set<string>): string {
  let text = input;

  // Known list / text environments. Process innermost-first by repeating.
  const envHandlers: Record<string, (inner: string) => string> = {
    itemize: (inner) => `<ul>${convertListItems(inner, (s) => processInline(processBlocks(s, unsupported), unsupported))}</ul>`,
    enumerate: (inner) => `<ol>${convertListItems(inner, (s) => processInline(processBlocks(s, unsupported), unsupported))}</ol>`,
    description: (inner) => `<ul>${convertListItems(inner, (s) => processInline(processBlocks(s, unsupported), unsupported))}</ul>`,
    quote: (inner) => `<blockquote>${processBlocks(inner, unsupported)}</blockquote>`,
    quotation: (inner) => `<blockquote>${processBlocks(inner, unsupported)}</blockquote>`,
    center: (inner) => `<div class="latex-center">${processBlocks(inner, unsupported)}</div>`,
    flushleft: (inner) => `<div style="text-align:left">${processBlocks(inner, unsupported)}</div>`,
    flushright: (inner) => `<div style="text-align:right">${processBlocks(inner, unsupported)}</div>`,
    abstract: (inner) => `<div class="latex-abstract"><h4>Abstract</h4>${processBlocks(inner, unsupported)}</div>`,
    verbatim: (inner) => `<pre class="latex-verbatim">${escapeHtml(inner)}</pre>`,
  };

  const envRe = /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/;
  let guard = 0;
  while (guard++ < 500) {
    const match = envRe.exec(text);
    if (!match) break;
    const [full, name, inner] = match;
    const handler = envHandlers[name];
    let replacement: string;
    if (handler) {
      replacement = handler(inner);
    } else {
      unsupported.add(`environment: ${name}`);
      replacement = processBlocks(inner, unsupported);
    }
    text = text.slice(0, match.index) + replacement + text.slice(match.index + full.length);
  }

  return text;
}

/** Convert sectioning commands into headings. */
function processSections(input: string, unsupported: Set<string>): string {
  const levels: Array<[string, string]> = [
    ["section", "h2"],
    ["subsection", "h3"],
    ["subsubsection", "h4"],
    ["paragraph", "h5"],
    ["chapter", "h1"],
  ];
  let text = input;
  for (const [cmd, tag] of levels) {
    const re = new RegExp(`\\\\${cmd}\\*?\\s*\\{`, "g");
    let result = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const braceStart = re.lastIndex - 1;
      const arg = readBracedArg(text, braceStart);
      if (!arg) continue;
      result += text.slice(last, m.index);
      result += `<${tag}>${processInline(arg.content, unsupported)}</${tag}>`;
      last = arg.end;
      re.lastIndex = arg.end;
    }
    result += text.slice(last);
    text = result;
  }
  return text;
}

export function renderLatexToHtml(source: string): LatexRenderResult {
  const unsupported = new Set<string>();

  try {
    const noComments = stripComments(source);

    // Split preamble / body around \begin{document} ... \end{document}.
    const beginDoc = noComments.search(/\\begin\{document\}/);
    const endDoc = noComments.search(/\\end\{document\}/);
    const preamble = beginDoc >= 0 ? noComments.slice(0, beginDoc) : noComments;
    let body =
      beginDoc >= 0
        ? noComments.slice(beginDoc + "\\begin{document}".length, endDoc >= 0 ? endDoc : undefined)
        : noComments;

    const macros = extractMacros(preamble);

    // Remove standalone preamble-only commands that may leak if no \begin{document}.
    body = body.replace(/\\(documentclass|usepackage|newcommand|renewcommand|def|input|include|bibliographystyle|bibliography)\b[^\n]*/g, "");

    // Drop common metadata/no-content commands that take no argument.
    // (\maketitle is handled separately below so it can render a title block.)
    body = body.replace(/\\(tableofcontents|newpage|clearpage|pagebreak|bigskip|medskip|smallskip|hfill|vfill|centering|noindent)\b/g, "");

    // 1) Extract & render math first (needs raw TeX).
    const { text: withPlaceholders, tokens } = extractMath(body, macros, unsupported);

    // 1b) \maketitle: build a title block from preamble \title/\author/\date.
    let withTitle = withPlaceholders;
    if (/\\maketitle\b/.test(withTitle)) {
      const title = preambleArg(preamble, "title");
      const author = preambleArg(preamble, "author");
      // \date defaults to \today when omitted; an explicit empty \date{} hides it.
      const date = preambleArg(preamble, "date") ?? "\\today";
      const parts: string[] = [];
      if (title) parts.push(`<h1 class="latex-doc-title">${processInline(escapeHtml(title), unsupported)}</h1>`);
      if (author) parts.push(`<div class="latex-doc-author">${processInline(escapeHtml(author), unsupported)}</div>`);
      if (date.trim()) parts.push(`<div class="latex-doc-date">${processInline(escapeHtml(date), unsupported)}</div>`);
      tokens.push({ html: `<div class="latex-titleblock">${parts.join("")}</div>` });
      const ph = `${PLACEHOLDER_OPEN}${tokens.length - 1}${PLACEHOLDER_CLOSE}`;
      withTitle = withTitle.replace(/\\maketitle\b[ \t]*/g, ph);
    }

    // 2) Escape HTML on the non-math text.
    let html = escapeHtml(withTitle);

    // 3) Block-level structure (environments).
    html = processBlocks(html, unsupported);

    // 4) Sectioning.
    html = processSections(html, unsupported);

    // 5) Paragraphs: split on blank lines, wrap loose text in <p>.
    const phRe = new RegExp(`^${PLACEHOLDER_OPEN}(\\d+)${PLACEHOLDER_CLOSE}`);
    const blocks = html.split(/\n\s*\n/);
    html = blocks
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return "";
        // Don't wrap blocks that are already a single block-level element.
        if (/^<(h[1-6]|ul|ol|blockquote|div|pre|table)[\s>]/.test(trimmed)) {
          return processInline(trimmed, unsupported);
        }
        // Don't wrap blocks that begin with a block-level token (e.g. the
        // \maketitle title block) — a <div> inside a <p> is invalid HTML.
        const ph = phRe.exec(trimmed);
        if (ph && /^<(div|table|h[1-6])/.test(tokens[Number(ph[1])]?.html ?? "")) {
          return processInline(trimmed, unsupported);
        }
        return `<p>${processInline(trimmed, unsupported)}</p>`;
      })
      .join("\n");

    // 6) Swap math placeholders back in.
    html = html.replace(
      new RegExp(`${PLACEHOLDER_OPEN}(\\d+)${PLACEHOLDER_CLOSE}`, "g"),
      (_full, idx: string) => tokens[Number(idx)]?.html ?? "",
    );

    const ok = html.replace(/<[^>]+>/g, "").trim().length > 0 || tokens.length > 0;

    return { html, unsupported: Array.from(unsupported), ok };
  } catch (e) {
    return {
      html: "",
      unsupported: [`fatal: ${(e as Error).message}`],
      ok: false,
    };
  }
}
