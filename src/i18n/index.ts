import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import hi from "./locales/hi.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import bn from "./locales/bn.json";
import pt from "./locales/pt.json";
import ru from "./locales/ru.json";
import ur from "./locales/ur.json";
import id from "./locales/id.json";
import de from "./locales/de.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import vi from "./locales/vi.json";
import tr from "./locales/tr.json";
import it from "./locales/it.json";
import th from "./locales/th.json";
import pl from "./locales/pl.json";
import nl from "./locales/nl.json";
import uk from "./locales/uk.json";
import fa from "./locales/fa.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";
import mr from "./locales/mr.json";
import gu from "./locales/gu.json";
import pa from "./locales/pa.json";
import kn from "./locales/kn.json";
import ml from "./locales/ml.json";
import sw from "./locales/sw.json";
import fil from "./locales/fil.json";
import ro from "./locales/ro.json";
import el from "./locales/el.json";
import cs from "./locales/cs.json";
import hu from "./locales/hu.json";
import sv from "./locales/sv.json";
import ha from "./locales/ha.json";
import yo from "./locales/yo.json";

// Ordered roughly by global speaker count. Translations are generated from
// en.json via `npm run i18n:translate` (Gemini JSON-mode batch translator,
// scripts/i18n-translate.mjs) and fall back to English per-key at render
// time, so a missing key never blanks the UI.
export const SUPPORTED_LOCALES = [
  "en",
  "zh-CN",
  "zh-TW",
  "hi",
  "es",
  "fr",
  "ar",
  "bn",
  "pt",
  "ru",
  "ur",
  "id",
  "de",
  "ja",
  "ko",
  "vi",
  "tr",
  "it",
  "th",
  "pl",
  "nl",
  "uk",
  "fa",
  "ta",
  "te",
  "mr",
  "gu",
  "pa",
  "kn",
  "ml",
  "sw",
  "fil",
  "ro",
  "el",
  "cs",
  "hu",
  "sv",
  "ha",
  "yo",
  "he",
] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "cabinet-locale";

// Native names — users recognize their own language fastest in its own
// script (same convention as the requestable-locales board below).
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  bn: "বাংলা",
  pt: "Português",
  ru: "Русский",
  ur: "اردو",
  id: "Bahasa Indonesia",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
  vi: "Tiếng Việt",
  tr: "Türkçe",
  it: "Italiano",
  th: "ไทย",
  pl: "Polski",
  nl: "Nederlands",
  uk: "Українська",
  fa: "فارسی",
  ta: "தமிழ்",
  te: "తెలుగు",
  mr: "मराठी",
  gu: "ગુજરાતી",
  pa: "ਪੰਜਾਬੀ",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  sw: "Kiswahili",
  fil: "Filipino",
  ro: "Română",
  el: "Ελληνικά",
  cs: "Čeština",
  hu: "Magyar",
  sv: "Svenska",
  ha: "Hausa",
  yo: "Yorùbá",
  he: "עברית",
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
  { code: "hy",     label: "Հայերեն",          englishName: "Armenian",           dir: "ltr" },
  { code: "az",     label: "Azərbaycanca",     englishName: "Azerbaijani",        dir: "ltr" },
  { code: "ms",     label: "Bahasa Melayu",    englishName: "Bahasa Malay",       dir: "ltr" },
  { code: "eu",     label: "Euskara",          englishName: "Basque",             dir: "ltr" },
  { code: "be",     label: "Беларуская",       englishName: "Belarusian",         dir: "ltr" },
  { code: "bs",     label: "Bosanski",         englishName: "Bosnian",            dir: "ltr" },
  { code: "bg",     label: "Български",        englishName: "Bulgarian",          dir: "ltr" },
  { code: "my",     label: "မြန်မာ",          englishName: "Burmese",            dir: "ltr" },
  { code: "ca",     label: "Català",           englishName: "Catalan",            dir: "ltr" },
  { code: "hr",     label: "Hrvatski",         englishName: "Croatian",           dir: "ltr" },
  { code: "da",     label: "Dansk",            englishName: "Danish",             dir: "ltr" },
  { code: "et",     label: "Eesti",            englishName: "Estonian",           dir: "ltr" },
  { code: "fi",     label: "Suomi",            englishName: "Finnish",            dir: "ltr" },
  { code: "gl",     label: "Galego",           englishName: "Galician",           dir: "ltr" },
  { code: "ka",     label: "ქართული",         englishName: "Georgian",           dir: "ltr" },
  { code: "is",     label: "Íslenska",         englishName: "Icelandic",          dir: "ltr" },
  { code: "ig",     label: "Igbo",             englishName: "Igbo",               dir: "ltr" },
  { code: "jv",     label: "Basa Jawa",        englishName: "Javanese",           dir: "ltr" },
  { code: "kk",     label: "Қазақша",          englishName: "Kazakh",             dir: "ltr" },
  { code: "km",     label: "ខ្មែរ",            englishName: "Khmer",              dir: "ltr" },
  { code: "ku",     label: "Kurdî",            englishName: "Kurdish",            dir: "ltr" },
  { code: "lo",     label: "ລາວ",              englishName: "Lao",                dir: "ltr" },
  { code: "lv",     label: "Latviešu",         englishName: "Latvian",            dir: "ltr" },
  { code: "lt",     label: "Lietuvių",         englishName: "Lithuanian",         dir: "ltr" },
  { code: "mk",     label: "Македонски",       englishName: "Macedonian",         dir: "ltr" },
  { code: "mg",     label: "Malagasy",         englishName: "Malagasy",           dir: "ltr" },
  { code: "mt",     label: "Malti",            englishName: "Maltese",            dir: "ltr" },
  { code: "mn",     label: "Монгол",           englishName: "Mongolian",          dir: "ltr" },
  { code: "ne",     label: "नेपाली",            englishName: "Nepali",             dir: "ltr" },
  { code: "no",     label: "Norsk",            englishName: "Norwegian",          dir: "ltr" },
  { code: "ps",     label: "پښتو",             englishName: "Pashto",             dir: "rtl" },
  { code: "sr",     label: "Српски",           englishName: "Serbian",            dir: "ltr" },
  { code: "si",     label: "සිංහල",            englishName: "Sinhala",            dir: "ltr" },
  { code: "sk",     label: "Slovenčina",       englishName: "Slovak",             dir: "ltr" },
  { code: "sl",     label: "Slovenščina",      englishName: "Slovenian",          dir: "ltr" },
  { code: "so",     label: "Soomaali",         englishName: "Somali",             dir: "ltr" },
  { code: "uz",     label: "Oʻzbekcha",        englishName: "Uzbek",              dir: "ltr" },
  { code: "cy",     label: "Cymraeg",          englishName: "Welsh",              dir: "ltr" },
  { code: "xh",     label: "isiXhosa",         englishName: "Xhosa",              dir: "ltr" },
  { code: "zu",     label: "isiZulu",          englishName: "Zulu",               dir: "ltr" },
] as RequestableLocale[]).sort((a, b) => a.englishName.localeCompare(b.englishName));

// BCP-47 codes whose script is right-to-left. `he` ships today; the others
// are still in REQUESTABLE_LOCALES (marked dir:"rtl") and would silently
// render LTR the moment they're promoted into SUPPORTED_LOCALES if this
// only special-cased `he`. Keep this list and the inline bootstrap in
// src/app/layout.tsx in sync.
export const RTL_LOCALE_PREFIXES = ["he", "ar", "fa", "ps", "ur"] as const;

export function localeToDir(locale: Locale): "ltr" | "rtl" {
  const base = locale.toLowerCase().split("-")[0];
  return (RTL_LOCALE_PREFIXES as readonly string[]).includes(base)
    ? "rtl"
    : "ltr";
}

/**
 * Best-effort BCP-47 → shipped-locale resolver. Walks `candidates`
 * most-preferred first and returns the first that maps, by: exact tag
 * (case-insensitive, so `zh-cn` → `zh-CN`), then Chinese script/region
 * disambiguation (we ship Simplified `zh-CN` + Traditional `zh-TW`), then
 * base language (`de-DE` → `de`, `pt-BR` → `pt`, `en-GB` → `en`). Returns
 * null when nothing maps — callers fall back to DEFAULT_LOCALE.
 */
export function matchSupportedLocale(
  candidates: readonly string[],
): Locale | null {
  const supported = SUPPORTED_LOCALES as readonly string[];
  for (const raw of candidates) {
    const lower = (raw ?? "").trim().toLowerCase();
    if (!lower) continue;
    const [base, ...subtags] = lower.split("-");

    const exact = supported.find((s) => s.toLowerCase() === lower);
    if (exact) return exact as Locale;

    if (base === "zh") {
      if (subtags.includes("hant")) return "zh-TW";
      if (subtags.includes("hans")) return "zh-CN";
      const region = subtags.find((s) => s.length === 2);
      if (region === "tw" || region === "hk" || region === "mo") return "zh-TW";
      return "zh-CN"; // cn / sg / my / unspecified → Simplified
    }

    const byBase = supported.find((s) => s.toLowerCase() === base);
    if (byBase) return byBase as Locale;
  }
  return null;
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
const resources = {
  en,
  he,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  hi,
  es,
  fr,
  ar,
  bn,
  pt,
  ru,
  ur,
  id,
  de,
  ja,
  ko,
  vi,
  tr,
  it,
  th,
  pl,
  nl,
  uk,
  fa,
  ta,
  te,
  mr,
  gu,
  pa,
  kn,
  ml,
  sw,
  fil,
  ro,
  el,
  cs,
  hu,
  sv,
  ha,
  yo,
} as const;

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
