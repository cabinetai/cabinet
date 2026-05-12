import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enEditor from "./locales/en/editor.json";
import enOnboarding from "./locales/en/onboarding.json";
import enSettings from "./locales/en/settings.json";
import enSidebar from "./locales/en/sidebar.json";
import enTour from "./locales/en/tour.json";

import heCommon from "./locales/he/common.json";
import heEditor from "./locales/he/editor.json";
import heOnboarding from "./locales/he/onboarding.json";
import heSettings from "./locales/he/settings.json";
import heSidebar from "./locales/he/sidebar.json";
import heTour from "./locales/he/tour.json";

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

const resources = {
  en: {
    common: enCommon,
    editor: enEditor,
    onboarding: enOnboarding,
    settings: enSettings,
    sidebar: enSidebar,
    tour: enTour,
  },
  he: {
    common: heCommon,
    editor: heEditor,
    onboarding: heOnboarding,
    settings: heSettings,
    sidebar: heSidebar,
    tour: heTour,
  },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: ["common", "editor", "onboarding", "settings", "sidebar", "tour"],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
