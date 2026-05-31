"use client";

import { useEffect } from "react";
import "@/i18n";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/i18n";
import { applyDocumentLocale } from "@/i18n/use-locale";

export function LocaleInitializer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const locale: Locale =
      stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)
        ? (stored as Locale)
        : DEFAULT_LOCALE;
    applyDocumentLocale(locale);
  }, []);

  return null;
}
