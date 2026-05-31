// Shared keyboard helpers. Single source of truth for platform detection,
// "is the user typing somewhere editable" guarding, and rendering logical
// key names ("cmd", "shift", "f2"…) into the glyphs we show in the cheat
// sheet and the sidebar context menus.

export function isMacPlatform(): boolean {
  if (typeof window === "undefined") return true;
  return /mac|iphone|ipad/i.test(window.navigator.platform);
}

// True when a keydown originated inside something the user is editing, so
// global/tree shortcuts should stand down. Mirrors the surfaces the editor
// stack uses (ProseMirror, xterm, opt-out via data-hotkey-opaque).
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest(".ProseMirror")) return true;
  if (target.closest(".xterm")) return true;
  if (target.closest("[data-hotkey-opaque='true']")) return true;
  return false;
}

export function renderKeyToken(token: string, isMac: boolean): string {
  const lower = token.toLowerCase();
  if (lower === "cmd") return isMac ? "⌘" : "Ctrl";
  if (lower === "ctrl") return isMac ? "⌃" : "Ctrl";
  if (lower === "shift") return isMac ? "⇧" : "Shift";
  if (lower === "alt") return isMac ? "⌥" : "Alt";
  if (lower === "enter" || lower === "return") return "↵";
  if (lower === "esc" || lower === "escape") return "Esc";
  if (lower === "backspace" || lower === "del" || lower === "delete")
    return isMac ? "⌫" : "Del";
  if (lower === "f2") return "F2";
  return token;
}

// Compact single-string form for inline hints (context menus). On macOS the
// modifier glyphs read fine glued together (⌘⇧M); elsewhere we join with "+"
// so "Ctrl+Shift+M" stays legible.
export function formatShortcut(
  keys: string[],
  isMac: boolean = isMacPlatform()
): string {
  return keys.map((k) => renderKeyToken(k, isMac)).join(isMac ? "" : "+");
}
