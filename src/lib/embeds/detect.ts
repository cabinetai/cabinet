export type EmbedProvider =
  | "youtube"
  | "vimeo"
  | "loom"
  | "twitter"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "spotify"
  | "video"
  | "iframe";

export interface DetectedEmbed {
  provider: EmbedProvider;
  embedUrl: string;
  originalUrl: string;
  /** Aspect ratio as width/height, e.g. 16/9 = 1.777… */
  aspectRatio?: number;
}

const YT_ID = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;
const LOOM_ID = /loom\.com\/share\/([A-Za-z0-9]+)/;
const TWITTER = /^https?:\/\/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/;
const FACEBOOK = /^https?:\/\/(?:www\.)?facebook\.com\/.+/;
const INSTAGRAM = /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/;
const TIKTOK = /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/(\d+)/;
const SPOTIFY = /^https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([A-Za-z0-9]+)/;
const VIDEO_FILE = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;

export function detectEmbed(raw: string): DetectedEmbed | null {
  const url = raw.trim();
  if (!url) return null;

  const yt = url.match(YT_ID);
  if (yt) {
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube.com/embed/${yt[1]}`,
      originalUrl: url,
      aspectRatio: 16 / 9,
    };
  }

  const vi = url.match(VIMEO_ID);
  if (vi) {
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vi[1]}`,
      originalUrl: url,
      aspectRatio: 16 / 9,
    };
  }

  const lo = url.match(LOOM_ID);
  if (lo) {
    return {
      provider: "loom",
      embedUrl: `https://www.loom.com/embed/${lo[1]}`,
      originalUrl: url,
      aspectRatio: 16 / 9,
    };
  }

  if (TWITTER.test(url)) {
    return { provider: "twitter", embedUrl: url, originalUrl: url };
  }

  if (INSTAGRAM.test(url)) {
    return {
      provider: "instagram",
      embedUrl: url.replace(/\/?(\?.*)?$/, "/embed"),
      originalUrl: url,
    };
  }

  const tt = url.match(TIKTOK);
  if (tt) {
    return {
      provider: "tiktok",
      embedUrl: `https://www.tiktok.com/embed/v2/${tt[1]}`,
      originalUrl: url,
      aspectRatio: 9 / 16,
    };
  }

  const sp = url.match(SPOTIFY);
  if (sp) {
    return {
      provider: "spotify",
      embedUrl: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`,
      originalUrl: url,
    };
  }

  if (FACEBOOK.test(url)) {
    return {
      provider: "facebook",
      embedUrl: `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(url)}&show_text=true`,
      originalUrl: url,
    };
  }

  if (VIDEO_FILE.test(url) || url.startsWith("/api/assets/")) {
    return { provider: "video", embedUrl: url, originalUrl: url };
  }

  // Fallback: any http(s) URL can be embedded as a generic iframe.
  if (/^https?:\/\//.test(url)) {
    return { provider: "iframe", embedUrl: url, originalUrl: url };
  }

  return null;
}

export function providerLabel(p: EmbedProvider): string {
  switch (p) {
    case "youtube": return "YouTube";
    case "vimeo": return "Vimeo";
    case "loom": return "Loom";
    case "twitter": return "X / Twitter";
    case "facebook": return "Facebook";
    case "instagram": return "Instagram";
    case "tiktok": return "TikTok";
    case "spotify": return "Spotify";
    case "video": return "Video file";
    case "iframe": return "Web page";
  }
}
