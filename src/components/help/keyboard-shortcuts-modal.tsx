"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { Search as SearchIcon, X } from "lucide-react";
import { useLocale } from "@/i18n/use-locale";

// Audit #053: single cheat sheet listing every Cabinet keyboard shortcut.
// Opened via the global "?" key (see src/hooks/use-global-hotkeys.ts) or
// from any other surface that dispatches "cabinet:open-shortcuts".

interface ShortcutEntry {
  keys: string[]; // logical key names like "cmd", "shift", ".", "k"
  description: string;
}

interface ShortcutGroup {
  label: string;
  items: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Navigation",
    items: [
      { keys: ["cmd", "1"], description: "Open Data drawer" },
      { keys: ["cmd", "2"], description: "Open Agents drawer" },
      { keys: ["cmd", "3"], description: "Open Tasks drawer" },
      { keys: ["cmd", "alt", "G"], description: "Toggle Agents view" },
      { keys: ["?"], description: "Show this cheat sheet" },
    ],
  },
  {
    label: "Search & Commands",
    items: [
      { keys: ["cmd", "K"], description: "Open search palette" },
      { keys: ["/"], description: "Open search palette (when not editing)" },
      {
        keys: ["/", "theme"],
        description: "Slash command — switch theme",
      },
      {
        keys: ["/", "open"],
        description: "Slash command — open a section",
      },
    ],
  },
  {
    label: "Editing",
    items: [
      { keys: ["cmd", "S"], description: "Save the current page" },
      { keys: ["cmd", "Z"], description: "Undo" },
      { keys: ["cmd", "shift", "Z"], description: "Redo" },
      {
        keys: ["cmd", "shift", "."],
        description: "Toggle hidden files in tree",
      },
    ],
  },
  {
    label: "Tasks",
    items: [
      {
        keys: ["cmd", "alt", "T"],
        description: "Quick-add task to Inbox",
      },
      {
        keys: ["cmd", "alt", "R"],
        description: "Open run-now composer",
      },
    ],
  },
  {
    label: "Panels",
    items: [
      {
        keys: ["cmd", "alt", "A"],
        description: "Toggle AI panel",
      },
      { keys: ["ctrl", "`"], description: "Toggle terminal" },
    ],
  },
];

function isMacPlatform(): boolean {
  if (typeof window === "undefined") return true;
  return /mac|iphone|ipad/i.test(window.navigator.platform);
}

function renderKeyToken(token: string, isMac: boolean): string {
  const lower = token.toLowerCase();
  if (lower === "cmd") return isMac ? "⌘" : "Ctrl";
  if (lower === "ctrl") return isMac ? "⌃" : "Ctrl";
  if (lower === "shift") return isMac ? "⇧" : "Shift";
  if (lower === "alt") return isMac ? "⌥" : "Alt";
  if (lower === "enter" || lower === "return") return "↵";
  if (lower === "esc" || lower === "escape") return "Esc";
  return token;
}

export function KeyboardShortcutsModal() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isMac = useMemo(() => isMacPlatform(), []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("cabinet:open-shortcuts", handler);
    return () => window.removeEventListener("cabinet:open-shortcuts", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_GROUPS;
    return SHORTCUT_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter((item) => {
        if (item.description.toLowerCase().includes(q)) return true;
        const tokens = item.keys.map((k) => renderKeyToken(k, isMac).toLowerCase());
        if (tokens.some((t) => t.includes(q))) return true;
        if (item.keys.some((k) => k.toLowerCase().includes(q))) return true;
        return false;
      }),
    })).filter((g) => g.items.length > 0);
  }, [query, isMac]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup
          className={cn(
            "fixed left-1/2 top-[12%] z-50 -translate-x-1/2",
            "w-[min(620px,calc(100vw-2rem))] max-h-[78vh]",
            "flex flex-col overflow-hidden rounded-xl bg-background text-sm shadow-2xl ring-1 ring-foreground/10 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          )}
        >
          <Dialog.Title className="sr-only">{t("keyboardShortcuts:title")}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-[13px] font-semibold">{t("keyboardShortcuts:title")}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("keyboardShortcuts:filterPlaceholder")}
                  className="h-7 w-44 rounded-md border border-border bg-background pl-6 pr-2 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                  spellCheck={false}
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("keyboardShortcuts:close")}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {filtered.length === 0 && (
              <p className="text-[12px] text-muted-foreground">
                No shortcuts match &ldquo;{query}&rdquo;.
              </p>
            )}
            {filtered.map((group) => (
              <div key={group.label}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
                <ul className="divide-y divide-border/40 rounded-md border border-border/40 bg-card/40">
                  {group.items.map((item) => (
                    <li
                      key={item.keys.join("+") + ":" + item.description}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]"
                    >
                      <span className="text-foreground/85">
                        {item.description}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {item.keys.map((k, idx) => (
                          <kbd
                            key={`${k}-${idx}`}
                            className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10.5px] font-mono text-foreground/90 shadow-sm"
                          >
                            {renderKeyToken(k, isMac)}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="pt-1 text-[10.5px] text-muted-foreground/70">
              Press{" "}
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">
                ?
              </kbd>{" "}
              from anywhere to reopen this list. Esc to close.
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
