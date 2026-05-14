import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";

export const SUPPORTED_LOCALES = ["en", "he"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "cabinet-locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  he: "עברית",
};

export function localeToDir(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Each locale is one JSON file at `src/i18n/locales/<locale>.json` with all
 * namespaces nested as top-level keys. To add a locale (e.g. Spanish):
 *   1. Copy `en.json` to `es.json` and translate the values.
 *   2. Import it here and add it to `resources` + `SUPPORTED_LOCALES`.
 *   3. Append `LOCALE_LABELS.es = "Español"` and a row in
 *      `LOCALE_TO_BCP47` (formatters.ts).
 *   4. Add the option to the Language section in settings-page.tsx.
 * That's the whole flow — no per-namespace files to keep in sync.
 */
const resources = { en, he } as const;

const NAMESPACES = Object.keys(en) as Array<keyof typeof en>;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: NAMESPACES,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
