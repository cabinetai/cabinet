import type { KnowledgeProviderId, KnowledgePolicy } from "@/lib/knowledge-sources/store";

/**
 * Connect Knowledge providers (docs/CONNECT_KNOWLEDGE_PRD.md §10). Client-safe
 * metadata only — provider *detection* (scanning the local desktop-sync mount)
 * lives server-side (e.g. detect-desktop.ts for Drive). v1 enables `local` and
 * `google-drive`; iCloud / SharePoint are present-but-disabled ("Coming soon")
 * so the menu reads as a roadmap, not a dead end.
 */
export interface KnowledgeProviderMeta {
  id: KnowledgeProviderId;
  /** Display label (English; menu trigger strings are i18n'd at the call site). */
  label: string;
  /** false → rendered disabled with a "Soon" hint in the Connect Knowledge menu. */
  enabled: boolean;
  /** Default read/write policy for a new connection from this provider. */
  defaultPolicy: KnowledgePolicy;
  /** Brand logo under /public (used for the tree mount icon). Undefined → generic glyph. */
  logo?: string;
}

export const KNOWLEDGE_PROVIDERS: KnowledgeProviderMeta[] = [
  { id: "local", label: "Local folder", enabled: true, defaultPolicy: "read-write" },
  { id: "google-drive", label: "Google Drive", enabled: true, defaultPolicy: "read-only", logo: "/logos/google-drive.svg" },
  { id: "icloud", label: "iCloud Drive", enabled: true, defaultPolicy: "read-only", logo: "/logos/icloud.svg" },
  { id: "onedrive", label: "OneDrive", enabled: true, defaultPolicy: "read-only", logo: "/logos/onedrive.svg" },
  { id: "sharepoint", label: "SharePoint", enabled: true, defaultPolicy: "read-only", logo: "/logos/sharepoint.svg" },
  { id: "dropbox", label: "Dropbox", enabled: true, defaultPolicy: "read-only", logo: "/logos/dropbox.webp" },
];

/** Brand logo path for a provider, or undefined (caller falls back to a glyph). */
export function providerLogo(id: KnowledgeProviderId): string | undefined {
  return KNOWLEDGE_PROVIDERS.find((p) => p.id === id)?.logo;
}

/** Display label for a provider (falls back to the id). */
export function providerLabel(id: KnowledgeProviderId): string {
  return KNOWLEDGE_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/**
 * Tiles shown in the Connect Knowledge picker (a roadmap grid styled like the
 * Integrations Hub "Files & Storage" row). `kind` drives the click action:
 * "local" → folder-symlink flow, "google-drive" → Drive picker, "soon" →
 * disabled placeholder. This is presentation only — distinct from the store's
 * KnowledgeProviderId (the providers that actually persist a source today).
 */
export interface ConnectKnowledgeTile {
  key: string;
  label: string;
  /**
   * "local" → folder-symlink flow; "cloud" → desktop-sync folder picker for
   * `provider`; "hub" → open the Integrations Hub at this connector (key
   * doubles as the catalog slug); "soon" → disabled placeholder; "github" →
   * remote repository clone & link.
   */
  kind: "local" | "cloud" | "hub" | "soon" | "github";
  /** Set for kind "cloud" — which desktop-sync provider to connect. */
  provider?: KnowledgeProviderId;
  /** Brand logo under /public; undefined → caller renders a Lucide glyph. */
  logo?: string;
}

export const CONNECT_KNOWLEDGE_TILES: ConnectKnowledgeTile[] = [
  { key: "local", label: "Local folder", kind: "local" },
  { key: "github", label: "GitHub", kind: "github", logo: "/logos/github.svg" },
  { key: "google-drive", label: "Google Drive", kind: "cloud", provider: "google-drive", logo: "/logos/google-drive.svg" },
  { key: "icloud", label: "iCloud Drive", kind: "cloud", provider: "icloud", logo: "/logos/icloud.svg" },
  { key: "onedrive", label: "OneDrive", kind: "cloud", provider: "onedrive", logo: "/logos/onedrive.svg" },
  { key: "sharepoint", label: "SharePoint", kind: "cloud", provider: "sharepoint", logo: "/logos/sharepoint.svg" },
  { key: "dropbox", label: "Dropbox", kind: "cloud", provider: "dropbox", logo: "/logos/dropbox.webp" },
  { key: "box", label: "Box", kind: "soon", logo: "/logos/box.webp" },
  // macOS only — filtered out elsewhere. "hub" kind + a dedicated handler (like
  // notion) opens its own import dialog rather than the Integrations Hub.
  { key: "apple-notes", label: "Apple Notes", kind: "hub", logo: "/logos/apple-notes.svg" },
  { key: "notion", label: "Notion", kind: "hub", logo: "/logos/notion.svg" },
  { key: "confluence", label: "Confluence", kind: "hub", logo: "/logos/confluence.svg" },
];
