"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import i18n, {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  localeToDir,
  type Locale,
} from "./index";
import { loadCjkFonts } from "@/lib/themes";

const LOCALE_CHANGE_EVENT = "cabinet-locale-change";

function readLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  return DEFAULT_LOCALE;
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(LOCALE_CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeToDir(locale);
  loadCjkFonts(locale);
}

export function setLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  applyDocumentLocale(locale);
  void i18n.changeLanguage(locale);
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT));
}

export function useLocale() {
  const { t } = useTranslation();
  const locale = useSyncExternalStore(subscribe, readLocale, () => DEFAULT_LOCALE);
  const dir = localeToDir(locale);
  const updateLocale = useCallback((next: Locale) => setLocale(next), []);
  return { t, locale, setLocale: updateLocale, dir };
}
