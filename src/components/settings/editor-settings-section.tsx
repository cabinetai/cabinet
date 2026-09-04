"use client";

import { useLocale } from "@/i18n/use-locale";
import { useEditorSettings } from "@/hooks/use-editor-settings";
import { saveEditorSettings, DEFAULT_EDITOR_SETTINGS } from "@/lib/ui/editor-settings";
import { Button } from "@/components/ui/button";

const FONT_PRESETS = [
  { label: "Fira Code", value: "'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace" },
  { label: "SF Mono / Menlo", value: "Menlo, Monaco, Consolas, 'Courier New', monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', Consolas, 'Courier New', monospace" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
];

const WEIGHT_PRESETS = [
  { label: "Normal", value: "normal" },
  { label: "Medium", value: "500" },
  { label: "Semi Bold", value: "600" },
  { label: "Bold", value: "bold" },
];

export function EditorSettingsSection() {
  const { t } = useLocale();
  const settings = useEditorSettings();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold mb-1">Editor Settings</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Customize the font family, size, ligatures, and theme of the built-in Monaco code editor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Editor Theme */}
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="font-medium text-muted-foreground">Editor Theme</span>
          <select
            value={settings.theme}
            onChange={(e) => saveEditorSettings({ theme: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
          >
            <option value="app">Match Application Theme</option>
            <option value="vs-dark">Dark Theme (vs-dark)</option>
            <option value="light">Light Theme</option>
          </select>
        </label>

        {/* Font Family */}
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="font-medium text-muted-foreground">Font Family</span>
          <select
            value={settings.fontFamily}
            onChange={(e) => saveEditorSettings({ fontFamily: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
          >
            {FONT_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label}
              </option>
            ))}
            {!FONT_PRESETS.some((p) => p.value === settings.fontFamily) && (
              <option value={settings.fontFamily}>Custom Font Family</option>
            )}
          </select>
        </label>

        {/* Font Size */}
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="font-medium text-muted-foreground">Font Size (px)</span>
          <input
            type="number"
            min={8}
            max={36}
            value={settings.fontSize}
            onChange={(e) => saveEditorSettings({ fontSize: parseInt(e.target.value, 10) || 14 })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
          />
        </label>

        {/* Line Height */}
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="font-medium text-muted-foreground">Line Height (px)</span>
          <input
            type="number"
            min={10}
            max={60}
            value={settings.lineHeight}
            onChange={(e) => saveEditorSettings({ lineHeight: parseInt(e.target.value, 10) || 20 })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
          />
        </label>

        {/* Font Weight */}
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="font-medium text-muted-foreground">Font Weight</span>
          <select
            value={settings.fontWeight}
            onChange={(e) => saveEditorSettings({ fontWeight: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
          >
            {WEIGHT_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        {/* Font Ligatures Checkbox */}
        <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:border-primary/30 transition-colors sm:col-span-2">
          <input
            type="checkbox"
            checked={settings.fontLigatures}
            onChange={(e) => saveEditorSettings({ fontLigatures: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <div>
            <span className="text-[13px] font-medium">Enable Font Ligatures</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Enables ligatures if supported by the active font (e.g. Fira Code, JetBrains Mono).
            </p>
          </div>
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveEditorSettings(DEFAULT_EDITOR_SETTINGS)}
        >
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
