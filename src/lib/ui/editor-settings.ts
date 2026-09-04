"use client";

export interface MonacoEditorSettings {
  theme: string; // "app" | "vs-dark" | "light"
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
  fontLigatures: boolean;
}

const STORAGE_KEY = "cabinet.editor-settings";

export const DEFAULT_EDITOR_SETTINGS: MonacoEditorSettings = {
  theme: "app",
  fontFamily: "'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
  fontSize: 13,
  lineHeight: 19,
  fontWeight: "normal",
  fontLigatures: true,
};

export function getEditorSettings(): MonacoEditorSettings {
  if (typeof window === "undefined") return DEFAULT_EDITOR_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EDITOR_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

export function saveEditorSettings(settings: Partial<MonacoEditorSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const current = getEditorSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(
      new CustomEvent("cabinet:editor-settings-changed", { detail: updated })
    );
  } catch {
    // ignore
  }
}
