import { DEFAULT_LOCALE, type Locale } from "./index";

const LOCALE_TO_BCP47: Record<Locale, string> = {
  en: "en-US",
  he: "he-IL",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
  bn: "bn-BD",
  pt: "pt-BR",
  ru: "ru-RU",
  ur: "ur-PK",
  id: "id-ID",
  de: "de-DE",
  ja: "ja-JP",
  ko: "ko-KR",
  vi: "vi-VN",
  tr: "tr-TR",
  it: "it-IT",
  th: "th-TH",
  pl: "pl-PL",
  nl: "nl-NL",
  uk: "uk-UA",
  fa: "fa-IR",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  sw: "sw-KE",
  fil: "fil-PH",
  ro: "ro-RO",
  el: "el-GR",
  cs: "cs-CZ",
  hu: "hu-HU",
  sv: "sv-SE",
  ha: "ha-NG",
  yo: "yo-NG",
};

export function bcp47(locale: Locale | undefined | null): string {
  return LOCALE_TO_BCP47[locale ?? DEFAULT_LOCALE];
}

export function formatDate(
  date: Date | number | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(bcp47(locale), options).format(d);
}

export function formatTime(
  date: Date | number | string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { timeStyle: "short" },
): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(bcp47(locale), options).format(d);
}

export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(bcp47(locale), options).format(value);
}

export function formatRelative(
  fromMs: number,
  locale: Locale,
  nowMs: number = Date.now(),
): string {
  const diffSeconds = Math.round((fromMs - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(bcp47(locale), { numeric: "auto" });
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return rtf.format(diffSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  return rtf.format(Math.round(diffSeconds / 86400), "day");
}
