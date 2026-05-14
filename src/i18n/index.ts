import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

export const SUPPORTED_LOCALES = ["en", "he", "zh-CN", "zh-TW"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "cabinet-locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  he: "עברית",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

/**
 * Locales the UI surfaces in the picker but doesn't ship translations for
 * yet. Clicking one fires a `/language-requests` signal to the
 * cabinet-backend so we can prioritize translation work by demand. The
 * native label is intentional — users recognize their own language fastest
 * in its own script.
 *
 * `dir` is recorded here too so we can flag RTL locales in the future when
 * we wire one up — it's not used by the picker today.
 */
export interface RequestableLocale {
  code: string;          // BCP-47
  label: string;         // native name (what the user sees)
  englishName: string;   // sort key; also useful for the backend log
  dir: "ltr" | "rtl";
}

// Comprehensive catalog of locales the picker can request. Ordered A–Z by
// `englishName` at the bottom — the sort key is intentional: users
// recognize their own language by its native script in the label, but the
// scan order needs to be predictable across all locales (sorting native
// labels with localeCompare interleaves Latin and non-Latin alphabets in
// a way that's hard to scan).
//
// Active locales (en, he) are excluded — they appear in the primary
// button row above the "More languages" board.
export const REQUESTABLE_LOCALES: RequestableLocale[] = ([
  { code: "af",     label: "Afrikaans",        englishName: "Afrikaans",          dir: "ltr" },
  { code: "sq",     label: "Shqip",            englishName: "Albanian",           dir: "ltr" },
  { code: "am",     label: "አማርኛ",            englishName: "Amharic",            dir: "ltr" },
  { code: "ar",     label: "العربية",          englishName: "Arabic",             dir: "rtl" },
  { code: "hy",     label: "Հայերեն",          englishName: "Armenian",           dir: "ltr" },
  { code: "az",     label: "Azərbaycanca",     englishName: "Azerbaijani",        dir: "ltr" },
  { code: "id",     label: "Bahasa Indonesia", englishName: "Bahasa Indonesia",   dir: "ltr" },
  { code: "ms",     label: "Bahasa Melayu",    englishName: "Bahasa Malay",       dir: "ltr" },
  { code: "eu",     label: "Euskara",          englishName: "Basque",             dir: "ltr" },
  { code: "be",     label: "Беларуская",       englishName: "Belarusian",         dir: "ltr" },
  { code: "bn",     label: "বাংলা",            englishName: "Bengali",            dir: "ltr" },
  { code: "bs",     label: "Bosanski",         englishName: "Bosnian",            dir: "ltr" },
  { code: "bg",     label: "Български",        englishName: "Bulgarian",          dir: "ltr" },
  { code: "my",     label: "မြန်မာ",          englishName: "Burmese",            dir: "ltr" },
  { code: "ca",     label: "Català",           englishName: "Catalan",            dir: "ltr" },
  { code: "hr",     label: "Hrvatski",         englishName: "Croatian",           dir: "ltr" },
  { code: "cs",     label: "Čeština",          englishName: "Czech",              dir: "ltr" },
  { code: "da",     label: "Dansk",            englishName: "Danish",             dir: "ltr" },
  { code: "nl",     label: "Nederlands",       englishName: "Dutch",              dir: "ltr" },
  { code: "et",     label: "Eesti",            englishName: "Estonian",           dir: "ltr" },
  { code: "fil",    label: "Filipino",         englishName: "Filipino",           dir: "ltr" },
  { code: "fi",     label: "Suomi",            englishName: "Finnish",            dir: "ltr" },
  { code: "fr",     label: "Français",         englishName: "French",             dir: "ltr" },
  { code: "gl",     label: "Galego",           englishName: "Galician",           dir: "ltr" },
  { code: "ka",     label: "ქართული",         englishName: "Georgian",           dir: "ltr" },
  { code: "de",     label: "Deutsch",          englishName: "German",             dir: "ltr" },
  { code: "el",     label: "Ελληνικά",         englishName: "Greek",              dir: "ltr" },
  { code: "gu",     label: "ગુજરાતી",          englishName: "Gujarati",           dir: "ltr" },
  { code: "ha",     label: "Hausa",            englishName: "Hausa",              dir: "ltr" },
  { code: "hi",     label: "हिन्दी",            englishName: "Hindi",              dir: "ltr" },
  { code: "hu",     label: "Magyar",           englishName: "Hungarian",          dir: "ltr" },
  { code: "is",     label: "Íslenska",         englishName: "Icelandic",          dir: "ltr" },
  { code: "ig",     label: "Igbo",             englishName: "Igbo",               dir: "ltr" },
  { code: "it",     label: "Italiano",         englishName: "Italian",            dir: "ltr" },
  { code: "ja",     label: "日本語",            englishName: "Japanese",           dir: "ltr" },
  { code: "jv",     label: "Basa Jawa",        englishName: "Javanese",           dir: "ltr" },
  { code: "kn",     label: "ಕನ್ನಡ",            englishName: "Kannada",            dir: "ltr" },
  { code: "kk",     label: "Қазақша",          englishName: "Kazakh",             dir: "ltr" },
  { code: "km",     label: "ខ្មែរ",            englishName: "Khmer",              dir: "ltr" },
  { code: "ko",     label: "한국어",            englishName: "Korean",             dir: "ltr" },
  { code: "ku",     label: "Kurdî",            englishName: "Kurdish",            dir: "ltr" },
  { code: "lo",     label: "ລາວ",              englishName: "Lao",                dir: "ltr" },
  { code: "lv",     label: "Latviešu",         englishName: "Latvian",            dir: "ltr" },
  { code: "lt",     label: "Lietuvių",         englishName: "Lithuanian",         dir: "ltr" },
  { code: "mk",     label: "Македонски",       englishName: "Macedonian",         dir: "ltr" },
  { code: "mg",     label: "Malagasy",         englishName: "Malagasy",           dir: "ltr" },
  { code: "ml",     label: "മലയാളം",          englishName: "Malayalam",          dir: "ltr" },
  { code: "mt",     label: "Malti",            englishName: "Maltese",            dir: "ltr" },
  { code: "mr",     label: "मराठी",            englishName: "Marathi",            dir: "ltr" },
  { code: "mn",     label: "Монгол",           englishName: "Mongolian",          dir: "ltr" },
  { code: "ne",     label: "नेपाली",            englishName: "Nepali",             dir: "ltr" },
  { code: "no",     label: "Norsk",            englishName: "Norwegian",          dir: "ltr" },
  { code: "ps",     label: "پښتو",             englishName: "Pashto",             dir: "rtl" },
  { code: "fa",     label: "فارسی",            englishName: "Persian",            dir: "rtl" },
  { code: "pl",     label: "Polski",           englishName: "Polish",             dir: "ltr" },
  { code: "pt",     label: "Português",        englishName: "Portuguese",         dir: "ltr" },
  { code: "pa",     label: "ਪੰਜਾਬੀ",          englishName: "Punjabi",            dir: "ltr" },
  { code: "ro",     label: "Română",           englishName: "Romanian",           dir: "ltr" },
  { code: "ru",     label: "Русский",          englishName: "Russian",            dir: "ltr" },
  { code: "sr",     label: "Српски",           englishName: "Serbian",            dir: "ltr" },
  { code: "si",     label: "සිංහල",            englishName: "Sinhala",            dir: "ltr" },
  { code: "sk",     label: "Slovenčina",       englishName: "Slovak",             dir: "ltr" },
  { code: "sl",     label: "Slovenščina",      englishName: "Slovenian",          dir: "ltr" },
  { code: "so",     label: "Soomaali",         englishName: "Somali",             dir: "ltr" },
  { code: "es",     label: "Español",          englishName: "Spanish",            dir: "ltr" },
  { code: "sw",     label: "Kiswahili",        englishName: "Swahili",            dir: "ltr" },
  { code: "sv",     label: "Svenska",          englishName: "Swedish",            dir: "ltr" },
  { code: "ta",     label: "தமிழ்",            englishName: "Tamil",              dir: "ltr" },
  { code: "te",     label: "తెలుగు",            englishName: "Telugu",             dir: "ltr" },
  { code: "th",     label: "ไทย",              englishName: "Thai",               dir: "ltr" },
  { code: "tr",     label: "Türkçe",           englishName: "Turkish",            dir: "ltr" },
  { code: "uk",     label: "Українська",       englishName: "Ukrainian",          dir: "ltr" },
  { code: "ur",     label: "اردو",             englishName: "Urdu",               dir: "rtl" },
  { code: "uz",     label: "Oʻzbekcha",        englishName: "Uzbek",              dir: "ltr" },
  { code: "vi",     label: "Tiếng Việt",       englishName: "Vietnamese",         dir: "ltr" },
  { code: "cy",     label: "Cymraeg",          englishName: "Welsh",              dir: "ltr" },
  { code: "xh",     label: "isiXhosa",         englishName: "Xhosa",              dir: "ltr" },
  { code: "yo",     label: "Yorùbá",           englishName: "Yoruba",             dir: "ltr" },
  { code: "zu",     label: "isiZulu",          englishName: "Zulu",               dir: "ltr" },
] as RequestableLocale[]).sort((a, b) => a.englishName.localeCompare(b.englishName));

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
const resources = { en, he, "zh-CN": zhCN, "zh-TW": zhTW } as const;

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
