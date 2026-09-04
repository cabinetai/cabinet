// `isomorphic-dompurify` re-exports DOMPurify's own `Config` type, so the
// config objects below stay type-checked without taking a direct dependency on
// `dompurify` (which is only a transitive dep here — importing it directly
// would rely on hoisting).
import DOMPurify, { type Config } from "isomorphic-dompurify";

/**
 * HTML sanitization at the render boundary (#66).
 *
 * Every `dangerouslySetInnerHTML` in the app renders a string that ultimately
 * comes from somewhere untrusted — an agent's output, a note on disk, a
 * registry README fetched over the network, a .ipynb or .xlsx a user opened.
 * All of it lands inside Cabinet's own origin, where the daemon auth token and
 * `/api/daemon/pty` live, so a single `<img src=x onerror=…>` is remote code
 * execution against the user's machine, not a defaced paragraph.
 *
 * Sanitizing HERE rather than inside the markdown pipeline is deliberate:
 * markdown is only one of the producers. Mermaid SVG, LaTeX, syntax
 * highlighting, and SheetJS tables never touch remark, and a pipeline-level
 * fix leaves all of them open.
 *
 * The profiles differ because the payloads differ. Prose needs links and
 * embeds; an SVG needs `<style>` and `<foreignObject>`; highlighted code needs
 * nothing but `<span class>`. Each profile is the smallest allowlist that
 * still renders its producer's real output — see sanitize.test.ts, which pins
 * both halves: attacks die, legitimate markup survives.
 */

// Relative URLs, anchors, and the schemes the app actually links to. `file:`
// is here because `encodeFileUrls` in the markdown pipeline exists to make
// `file:///…` links work — dropping it would silently break a real feature.
// Everything else (notably `javascript:` and bare `data:`) is refused.
//
// The dash in `[^a-z+.\-:]` MUST stay escaped. Unescaped, `.-:` is a character
// RANGE (0x2E–0x3A) that swallows the digits and `/`, and since DOMPurify tests
// EVERY attribute value against this regex — not just URI-ish ones — the result
// is that `d="M10 10 L90 90"` fails validation and every SVG path silently
// loses its geometry. This regex keeps DOMPurify's own tail intact and only
// swaps the scheme list.
const SAFE_URI =
  /^(?:(?:https?|mailto|tel|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

// Applies to every profile. DOMPurify already drops `on*` handlers and unknown
// schemes; these are the extras that matter for the markup we do allow.
//   - `srcdoc` would let an allowed <iframe> run script in OUR origin.
//   - `style` is refused on prose because nothing the pipeline emits needs it,
//     and it is the standard vector for overlay/clickjacking tricks. The SVG
//     profile re-enables it, because mermaid genuinely cannot render without it.
const BASE_FORBID_ATTR = ["srcdoc", "formaction", "ping", "style"];
const BASE_FORBID_TAGS = ["script", "style", "form", "object", "embed", "base", "link", "meta"];

/**
 * Prose: markdown pipeline output, agent messages, registry READMEs.
 *
 * `<iframe>` is allowed because the embed healer (`upgradeProviderVideos`)
 * turns video URLs into real iframe embeds, and `detectEmbed` deliberately
 * falls back to "any http(s) URL is embeddable". A cross-origin iframe cannot
 * script its parent, so this is not an XSS hole — but it does mean a note can
 * frame an arbitrary site, which is a product decision that predates this
 * change. `srcdoc` is forbidden above, which is the part that WOULD be XSS.
 *
 * `data:` URIs are permitted on <img> only (ADD_DATA_URI_TAGS): an SVG loaded
 * through <img> cannot execute script, and base64 images are a legitimate
 * thing to paste into a note.
 */
const RICH: Config = {
  ADD_TAGS: ["iframe", "video"],
  ADD_ATTR: [
    "allowfullscreen",
    "frameborder",
    "loading",
    "target",
    "controls",
    "poster",
  ],
  ADD_DATA_URI_TAGS: ["img"],
  FORBID_TAGS: BASE_FORBID_TAGS,
  FORBID_ATTR: BASE_FORBID_ATTR,
  ALLOWED_URI_REGEXP: SAFE_URI,
};

/**
 * SVG: mermaid diagrams and a notebook's `image/svg+xml` outputs.
 *
 * Both mermaid call sites run with `securityLevel: "loose"`, which means
 * mermaid does NOT sanitize its own output and permits HTML labels — so a
 * diagram authored by an agent is itself an injection vector, and this profile
 * is the only thing standing between that and the DOM. A notebook's SVG output
 * is straight from a file the user opened, i.e. fully untrusted.
 *
 * `html: true` is required alongside the SVG profiles because mermaid emits
 * HTML labels inside `<foreignObject>`. DOMPurify sanitizes across both
 * namespaces and specifically defends the namespace-confusion tricks that make
 * foreignObject interesting to an attacker.
 *
 * `foreignObject` needs BOTH an ADD_TAGS entry and an HTML_INTEGRATION_POINTS
 * entry. DOMPurify refuses HTML children inside an SVG parent unless that
 * parent is a declared integration point, and its default list is just
 * `annotation-xml` — so without the second half, mermaid's labels come back as
 * empty boxes. Opting in does NOT weaken the scrub: HTML inside foreignObject
 * still goes through the full allowlist (verified in sanitize.test.ts — an
 * <img onerror> and a javascript: href planted in a foreignObject both die).
 *
 * KNOWN RESIDUAL RISK: `<style>` is allowed, because stripping it renders every
 * diagram as unstyled spaghetti — and DOMPurify does not sanitize CSS. A
 * hostile diagram can therefore inject global CSS rules. That is a UI-spoofing
 * / clickjacking surface, NOT script execution (browsers do not run
 * `javascript:` inside CSS). Closing it properly means flipping mermaid off
 * `securityLevel: "loose"`, which changes how labels render and is a separate
 * change from this one.
 */
const SVG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  ADD_TAGS: ["style", "foreignObject"],
  HTML_INTEGRATION_POINTS: { foreignobject: true },
  FORBID_TAGS: ["script"],
  FORBID_ATTR: ["srcdoc", "formaction", "ping"],
  ALLOWED_URI_REGEXP: SAFE_URI,
};

/**
 * Syntax-highlighted code from lowlight (source viewer, notebook code cells).
 *
 * lowlight emits nothing but nested `<span class="hljs-…">` around
 * already-escaped text, so the allowlist is exactly that. Anything else in the
 * string means something upstream went wrong, and dropping it costs nothing.
 */
const CODE: Config = {
  ALLOWED_TAGS: ["span"],
  ALLOWED_ATTR: ["class"],
};

/**
 * SheetJS `sheet_to_html` output (.xlsx viewer).
 *
 * SheetJS escapes cell text, but the workbook is a file the user opened from
 * who-knows-where and the escaping is not a security boundary we control.
 * Table structure and hyperlinks are all this needs to render.
 */
const TABLE: Config = {
  ALLOWED_TAGS: [
    "table", "thead", "tbody", "tfoot", "tr", "td", "th",
    "caption", "col", "colgroup", "span", "div", "br", "a", "b", "i", "u",
  ],
  ALLOWED_ATTR: ["id", "class", "colspan", "rowspan", "href", "title"],
  ALLOWED_URI_REGEXP: SAFE_URI,
};

const LATEX: Config = {
  ...RICH,
  FORBID_ATTR: BASE_FORBID_ATTR.filter((attr) => attr !== "style"),
};

export type SanitizeProfile = "rich" | "svg" | "code" | "table" | "latex";

const PROFILES: Record<SanitizeProfile, Config> = {
  rich: RICH,
  svg: SVG,
  code: CODE,
  table: TABLE,
  latex: LATEX,
};

/**
 * Sanitize `dirty` HTML under the named profile. Always returns a string that
 * is safe to hand to `dangerouslySetInnerHTML`.
 *
 * Prefer the `<SafeHtml>` component over calling this directly — it is the
 * thing that makes "no raw dangerouslySetInnerHTML in components" a rule you
 * can grep for.
 */
export function sanitizeHtml(dirty: string, profile: SanitizeProfile): string {
  // DOMPurify returns a TrustedHTML-ish object under some configs; the string
  // cast is safe because RETURN_TRUSTED_TYPE is never set.
  return DOMPurify.sanitize(dirty, PROFILES[profile]) as string;
}
