"use client";

import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { useEditorStore } from "@/stores/editor-store";
import { useTreeStore } from "@/stores/tree-store";
import { useSearchStore } from "@/stores/search-store";
import { useFindStore } from "@/stores/find-store";
import { ROOT_CABINET_PATH } from "@/lib/cabinets/paths";
import { isEditableTarget } from "@/lib/keys";

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

      // Cmd+F — open the in-page find bar (highlights matches on the page
      // that's already open). Distinct from Cmd+K, which jumps between pages.
      // Fires inside the editor too: the modifier makes it unambiguous and
      // there is no native Electron find-in-page to collide with.
      if (mod && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        e.stopPropagation();
        useFindStore.getState().openFind();
        return;
      }

      // `/` — open search palette when focus is idle.
      if (!mod && !e.altKey && e.key === "/") {
        if (isEditableTarget(target)) return;
        e.preventDefault();
        useSearchStore.getState().openPalette();
        return;
      }

      // Audit #053: `?` (Shift+/) opens the keyboard shortcuts cheat sheet.
      // Linear/GitHub/Stripe convention. Only fires outside editable
      // targets so typing "?" in prose still works.
      if (!mod && e.key === "?") {
        if (isEditableTarget(target)) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("cabinet:open-shortcuts"));
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

      // Cmd+Opt+A — toggle the task drawer in compose mode
      // (Cmd+Shift+A = "Search tabs" in Chrome 94+)
      // e.code used because Option modifies e.key on macOS (Option+A → "å")
      if (e.altKey && !e.shiftKey && e.code === "KeyA") {
        e.preventDefault();
        const sectionType = useAppStore.getState().section.type;
        const pagePath = useEditorStore.getState().currentPath;
        useAppStore.getState().toggleTaskPanelCompose(
          sectionType === "page" && pagePath
            ? { source: "editor", pinnedPagePath: pagePath, defaultAgentSlug: "editor" }
            : undefined
        );
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

      // Cmd+Opt+L — toggle the recent/running tasks rail
      // e.code used because Option modifies e.key on macOS (Option+L → "¬")
      if (e.altKey && !e.shiftKey && e.code === "KeyL") {
        e.preventDefault();
        useAppStore.getState().toggleTaskRail();
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

      // Cmd+[ / Cmd+] — back/forward navigation
      if (!e.shiftKey && !e.altKey) {
        if (e.key === "[") { e.preventDefault(); useAppStore.getState().goBack(); return; }
        if (e.key === "]") { e.preventDefault(); useAppStore.getState().goForward(); return; }
      }
    };

    const handleAltArrow = (e: KeyboardEvent) => {
      // Alt+Left / Alt+Right — back/forward (Win/Linux convention).
      // Separate handler because the main handle() returns early when no Cmd/Ctrl
      // modifier is present unless the event matches one of its `mod`-less cases.
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        useAppStore.getState().goBack();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        useAppStore.getState().goForward();
      }
    };

    window.addEventListener("keydown", handle);
    window.addEventListener("keydown", handleAltArrow);
    return () => {
      window.removeEventListener("keydown", handle);
      window.removeEventListener("keydown", handleAltArrow);
    };
  }, []);
}
