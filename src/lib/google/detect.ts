export type GoogleKind = "sheets" | "slides" | "docs" | "forms" | "drive";

export interface GoogleLink {
  kind: GoogleKind;
  id: string;
  /** URL suitable for embedding in an iframe. May require "Publish to Web". */
  embedUrl: string;
  /** URL to open in a new tab to view/edit in Google's own UI. */
  openUrl: string;
  /** Raw input URL. */
  rawUrl: string;
}

const PATTERNS: Array<{ re: RegExp; kind: GoogleKind }> = [
  { re: /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/(?:e\/)?([A-Za-z0-9_-]+)/, kind: "sheets" },
  { re: /^https?:\/\/docs\.google\.com\/presentation\/d\/(?:e\/)?([A-Za-z0-9_-]+)/, kind: "slides" },
  { re: /^https?:\/\/docs\.google\.com\/document\/d\/(?:e\/)?([A-Za-z0-9_-]+)/, kind: "docs" },
  { re: /^https?:\/\/docs\.google\.com\/forms\/d\/(?:e\/)?([A-Za-z0-9_-]+)/, kind: "forms" },
  { re: /^https?:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/, kind: "drive" },
];

/**
 * Inspect a URL and resolve it to a Google document we know how to embed.
 * Returns null for any URL that isn't a Google Workspace link.
 */
export function detectGoogle(rawUrl: string): GoogleLink | null {
  const url = rawUrl.trim();
  if (!url) return null;
  for (const { re, kind } of PATTERNS) {
    const m = url.match(re);
    if (!m) continue;
    const id = m[1];
    return {
      kind,
      id,
      embedUrl: computeEmbedUrl(kind, id, url),
      openUrl: computeOpenUrl(kind, id),
      rawUrl,
    };
  }
  return null;
}

function computeEmbedUrl(kind: GoogleKind, id: string, rawUrl: string): string {
  // A "Publish to web" link has the /d/e/<publishId>/pub… shape — its id is a
  // distinct *publish* id, so for those we keep the `pub`/`pubhtml` endpoints.
  // A plain "Anyone with the link" share link has /d/<docId>/… — for those the
  // `pub*` endpoints 302 to a Google sign-in wall, so we use `/preview`, which
  // renders read-only for anyone with the link (and for published docs too).
  const isPublished = /\/d\/e\//.test(rawUrl);
  switch (kind) {
    case "sheets":
      return isPublished
        ? `https://docs.google.com/spreadsheets/d/e/${id}/pubhtml?widget=true&headers=false`
        : `https://docs.google.com/spreadsheets/d/${id}/preview`;
    case "slides":
      return isPublished
        ? `https://docs.google.com/presentation/d/e/${id}/embed?start=false&loop=false&delayms=3000`
        : `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000`;
    case "docs":
      return isPublished
        ? `https://docs.google.com/document/d/e/${id}/pub?embedded=true`
        : `https://docs.google.com/document/d/${id}/preview`;
    case "forms":
      return `https://docs.google.com/forms/d/${isPublished ? `e/${id}` : id}/viewform?embedded=true`;
    case "drive":
      return `https://drive.google.com/file/d/${id}/preview`;
  }
}

function computeOpenUrl(kind: GoogleKind, id: string): string {
  switch (kind) {
    case "sheets":
      return `https://docs.google.com/spreadsheets/d/${id}/edit`;
    case "slides":
      return `https://docs.google.com/presentation/d/${id}/edit`;
    case "docs":
      return `https://docs.google.com/document/d/${id}/edit`;
    case "forms":
      return `https://docs.google.com/forms/d/${id}/edit`;
    case "drive":
      return `https://drive.google.com/file/d/${id}/view`;
  }
}

export function googleKindLabel(kind: GoogleKind): string {
  switch (kind) {
    case "sheets": return "Google Sheets";
    case "slides": return "Google Slides";
    case "docs": return "Google Docs";
    case "forms": return "Google Forms";
    case "drive": return "Google Drive";
  }
}
