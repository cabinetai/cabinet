export type PaperSize = "a4" | "letter";
export type PageOrientation = "auto" | "portrait" | "landscape";

export interface ExportSettings {
  paperSize: PaperSize;
  orientation: PageOrientation;
}

export const EXPORT_SETTINGS_STORAGE_KEY = "cabinet-export-settings";
export const EXPORT_SETTINGS_CHANGE_EVENT = "cabinet-export-settings-change";

const LETTER_REGIONS = new Set(["CA", "MX", "PH", "US"]);
const PAPER_SIZES = new Set<PaperSize>(["a4", "letter"]);
const ORIENTATIONS = new Set<PageOrientation>(["auto", "portrait", "landscape"]);

export function defaultPaperSizeForLocales(locales: readonly string[]): PaperSize {
  for (const locale of locales) {
    try {
      const region = new Intl.Locale(locale).region?.toUpperCase();
      if (region) return LETTER_REGIONS.has(region) ? "letter" : "a4";
    } catch {}
  }
  return "a4";
}

export function systemLocaleCandidates(): string[] {
  if (typeof navigator === "undefined") return [];
  const candidates = Array.isArray(navigator.languages)
    ? [...navigator.languages]
    : [];
  if (navigator.language && !candidates.includes(navigator.language)) {
    candidates.push(navigator.language);
  }
  return candidates;
}

export function resolveExportSettings(
  raw: string | null,
  locales: readonly string[] = []
): ExportSettings {
  const defaults: ExportSettings = {
    paperSize: defaultPaperSizeForLocales(locales),
    orientation: "auto",
  };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<ExportSettings>;
    return {
      paperSize: PAPER_SIZES.has(parsed.paperSize as PaperSize)
        ? (parsed.paperSize as PaperSize)
        : defaults.paperSize,
      orientation: ORIENTATIONS.has(parsed.orientation as PageOrientation)
        ? (parsed.orientation as PageOrientation)
        : defaults.orientation,
    };
  } catch {
    return defaults;
  }
}

export function getExportSettings(): ExportSettings {
  if (typeof window === "undefined") {
    return { paperSize: "a4", orientation: "auto" };
  }
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY);
  } catch {}
  return resolveExportSettings(raw, systemLocaleCandidates());
}

export function storeExportSettings(settings: ExportSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      EXPORT_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {}
  window.dispatchEvent(
    new CustomEvent(EXPORT_SETTINGS_CHANGE_EVENT, { detail: settings })
  );
}
