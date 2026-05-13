import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enAgents from "./locales/en/agents.json";
import enCommon from "./locales/en/common.json";
import enDialogs from "./locales/en/dialogs.json";
import enEditor from "./locales/en/editor.json";
import enHome from "./locales/en/home.json";
import enOnboarding from "./locales/en/onboarding.json";
import enSearch from "./locales/en/search.json";
import enSettings from "./locales/en/settings.json";
import enSidebar from "./locales/en/sidebar.json";
import enStatus from "./locales/en/status.json";
import enTasks from "./locales/en/tasks.json";
import enTour from "./locales/en/tour.json";

import heAgents from "./locales/he/agents.json";
import heCommon from "./locales/he/common.json";
import heDialogs from "./locales/he/dialogs.json";
import heEditor from "./locales/he/editor.json";
import heHome from "./locales/he/home.json";
import heOnboarding from "./locales/he/onboarding.json";
import heSearch from "./locales/he/search.json";
import heSettings from "./locales/he/settings.json";
import heSidebar from "./locales/he/sidebar.json";
import heStatus from "./locales/he/status.json";
import heTasks from "./locales/he/tasks.json";
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
    agents: enAgents,
    common: enCommon,
    dialogs: enDialogs,
    editor: enEditor,
    home: enHome,
    onboarding: enOnboarding,
    search: enSearch,
    settings: enSettings,
    sidebar: enSidebar,
    status: enStatus,
    tasks: enTasks,
    tour: enTour,
  },
  he: {
    agents: heAgents,
    common: heCommon,
    dialogs: heDialogs,
    editor: heEditor,
    home: heHome,
    onboarding: heOnboarding,
    search: heSearch,
    settings: heSettings,
    sidebar: heSidebar,
    status: heStatus,
    tasks: heTasks,
    tour: heTour,
  },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: getInitialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: ["agents", "common", "dialogs", "editor", "home", "onboarding", "search", "settings", "sidebar", "status", "tasks", "tour"],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
