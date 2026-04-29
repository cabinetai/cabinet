"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAIPanelStore } from "@/stores/ai-panel-store";
import { useTreeStore } from "@/stores/tree-store";
import { useSearchStore } from "@/stores/search-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest(".ProseMirror")) return true;
  if (target.closest(".xterm")) return true;
  if (target.closest("[data-hotkey-opaque='true']")) return true;
  return false;
}

export function useGlobalHotkeys(): void {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target;

      // Cmd+K — open search palette from anywhere (including editor).
      if (mod && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        e.stopPropagation();
        useSearchStore.getState().openPalette();
        return;
      }

      // `/` — open search palette when focus is idle.
      if (!mod && !e.altKey && e.key === "/") {
        if (isEditableTarget(target)) return;
        e.preventDefault();
        useSearchStore.getState().openPalette();
        return;
      }

      // Ctrl+` — toggle terminal (VS Code / iTerm2 convention; avoids Cmd+`
      // which is "Cycle windows of same app" at macOS system level)
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === "`") {
        e.preventDefault();
        useAppStore.getState().toggleTerminal();
        return;
      }

      // The remaining shortcuts are modifier-driven; they should still fire
      // inside editable surfaces because the modifier makes them unambiguous.
      if (!mod) return;

      // Cmd+Opt+T — quick-add a task to the Inbox (no agent, no run)
      // e.code used because Option modifies e.key on macOS (Option+T → "†")
      if (e.altKey && !e.shiftKey && e.code === "KeyT") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("cabinet:global-inbox-task"));
        return;
      }

      // Cmd+Opt+R — open the run-now composer (pick agent + start immediately)
      // e.code used because Option modifies e.key on macOS (Option+R → "®")
      if (e.altKey && !e.shiftKey && e.code === "KeyR") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("cabinet:global-run-task"));
        return;
      }

      // Cmd+S — save the current page
      if (!e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void useEditorStore.getState().save();
        return;
      }

      // Cmd+Opt+A — toggle AI panel
      // (Cmd+Shift+A = "Search tabs" in Chrome 94+)
      // e.code used because Option modifies e.key on macOS (Option+A → "å")
      if (e.altKey && !e.shiftKey && e.code === "KeyA") {
        e.preventDefault();
        useAIPanelStore.getState().toggle();
        return;
      }

      // Cmd+Opt+G — toggle Agents view
      // (Cmd+M = "Minimize window" on macOS; Cmd+Shift+G = "Find Previous" in Chrome/Safari)
      // e.code used because Option modifies e.key on macOS (Option+G → "©")
      if (e.altKey && !e.shiftKey && e.code === "KeyG") {
        e.preventDefault();
        const app = useAppStore.getState();
        const { section, setSection } = app;
        const scopedPath = section.cabinetPath;
        const inNonRoot = scopedPath && scopedPath !== ROOT_CABINET_PATH;
        if (section.type === "agents") {
          if (inNonRoot) {
            setSection({ type: "cabinet", cabinetPath: scopedPath });
          } else {
            setSection({ type: "home" });
          }
        } else {
          setSection({
            type: "agents",
            cabinetPath: scopedPath || ROOT_CABINET_PATH,
          });
        }
        return;
      }

      // Cmd+Shift+. — toggle hidden files
      if (e.shiftKey && e.key === ".") {
        e.preventDefault();
        useTreeStore.getState().toggleHiddenFiles();
        return;
      }

      // Cmd+1/2/3 — switch sidebar drawer (Data / Agents / Tasks)
      if (!e.shiftKey && !e.altKey) {
        if (e.key === "1") { e.preventDefault(); useAppStore.getState().setSidebarDrawer("data"); return; }
        if (e.key === "2") { e.preventDefault(); useAppStore.getState().setSidebarDrawer("agents"); return; }
        if (e.key === "3") { e.preventDefault(); useAppStore.getState().setSidebarDrawer("tasks"); return; }
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
}
