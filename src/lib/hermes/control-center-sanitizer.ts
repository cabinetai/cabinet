const MAX_BROWSER_STRING = 600;
const SECRET_KEY = /(?:authorization|proxy-authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|oauth[_-]?(?:code|token)|client[_-]?secret|bot[_-]?token|password|credential|secret)/i;
const SECRET_QUERY = /([?&](?:key|api_key|token|access_token|refresh_token|session_token|code|secret|client_secret|authorization)=)[^&#\s]*/gi;
const SECRET_URL = /https?:\/\/[^\s"'<>]*[?&](?:key|api_key|token|access_token|refresh_token|session_token|code|secret|client_secret|authorization)=[^\s"'<>]*/gi;
const CREDENTIAL_ASSIGNMENT = /\b(?:authorization|proxy-authorization|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|session[_ -]?token|oauth[_ -]?(?:code|token)|client[_ -]?secret|bot[_ -]?token|password|credential|secret)\b\s*[:=]\s*[^\s,;]+/gi;
const AUTHORIZATION = /\b(?:bearer|basic)\s+[a-z0-9._~+/=\-]+/gi;
const TELEGRAM_BOT_URL = /https?:\/\/api\.telegram\.org\/bot[^/\s?#]+[^\s]*/gi;
const CREDENTIAL_FILE = /(?:file:\/\/)?\/[^\s"']*\/(?:credentials?|secrets?|tokens?)(?:\/[^\s"']*)?/gi;
const HOME_PATH = /\/(?:Users|home)\/[^/\s]+/g;

export function sanitizeHermesText(input: string, maxLength = MAX_BROWSER_STRING): string {
  const value = input
    .replace(TELEGRAM_BOT_URL, "[redacted secret URL]")
    .replace(SECRET_URL, "[redacted secret URL]")
    .replace(SECRET_QUERY, "$1[redacted]")
    .replace(AUTHORIZATION, "[redacted authorization]")
    .replace(CREDENTIAL_ASSIGNMENT, "[redacted credential]")
    .replace(CREDENTIAL_FILE, "[redacted credential path]")
    .replace(HOME_PATH, "/Users/[redacted]");
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : value;
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (SECRET_KEY.test(key)) return value ? "[redacted]" : value;
    const bounded = /(?:summary|message|error|result|warning|detail)$/i.test(key) ? 240 : MAX_BROWSER_STRING;
    return sanitizeHermesText(value, bounded);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeValue(child, childKey)]));
  }
  return value;
}

/** The single boundary used immediately before a Hermes Control Center model can reach the browser. */
export function sanitizeHermesBrowserModel<T>(value: T): T {
  return sanitizeValue(value) as T;
}
