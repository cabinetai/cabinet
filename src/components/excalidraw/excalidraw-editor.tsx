"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Excalidraw, exportToSvg, loadFromBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useTheme } from "@/components/theme-provider";
import { Save, LogOut, Loader2 } from "lucide-react";

export function ExcalidrawEditor() {
  const searchParams = useSearchParams();
  const path = searchParams.get("path");
  const { resolvedTheme } = useTheme();
  
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [initialData, setInitialData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Load drawing on mount
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const assetUrl = `/api/assets/${path}`;
        const res = await fetch(assetUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const svgText = await res.text();
        
        // Convert to Blob and load using loadFromBlob
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        try {
          const scene = await loadFromBlob(blob, null, null);
          setInitialData({
            elements: scene.elements || [],
            appState: scene.appState || {},
            files: scene.files || {},
          });
        } catch (parseErr) {
          console.warn("Excalidraw parse error (file may be empty or placeholder):", parseErr);
          // If it fails (e.g. because it's a placeholder empty SVG), start with empty elements
          setInitialData({
            elements: [],
            appState: {},
            files: {},
          });
        }
      } catch (err) {
        console.error("Failed to fetch/load Excalidraw file:", err);
        // Fallback to empty scene
        setInitialData({
          elements: [],
          appState: {},
          files: {},
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [path]);

  const handleSave = async () => {
    if (!excalidrawAPI || !path) return;
    
    setSaving(true);
    setSaveStatus("Saving...");
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      // Export elements to SVG with embedded scene data
      const svgElement = await exportToSvg({
        elements,
        appState: {
          ...appState,
          exportEmbedScene: true,
        },
        files,
      });

      const svgString = svgElement.outerHTML;
      const assetUrl = `/api/assets/${path}`;
      
      const res = await fetch(assetUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/svg+xml" },
        body: svgString,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setSaveStatus("Saved successfully!");
      
      // Post message back to parent shell
      try {
        window.parent.postMessage({ type: "excalidraw-saved", path }, "*");
      } catch (e) {}

      try {
        localStorage.setItem("cabinet.excalidraw.last_saved_path", path);
        localStorage.setItem("cabinet.excalidraw.last_saved_time", Date.now().toString());
      } catch (e) {}

      setTimeout(() => {
        setSaveStatus(null);
      }, 1500);
    } catch (err) {
      console.error("Failed to save Excalidraw diagram:", err);
      setSaveStatus("Save failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleExit = () => {
    // Post empty message or closed to parent
    try {
      window.parent.postMessage({ type: "excalidraw-saved", path }, "*");
    } catch (e) {}
    try {
      localStorage.setItem("cabinet.excalidraw.last_saved_path", path || "");
      localStorage.setItem("cabinet.excalidraw.last_saved_time", Date.now().toString());
    } catch (e) {}
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-transparent text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        Loading diagram data...
      </div>
    );
  }

  // Get filename for display
  const filename = path ? path.split("/").pop() || path : "Untitled Diagram";
  const displayTitle = filename.endsWith(".excalidraw.svg") 
    ? filename.slice(0, -15) 
    : filename;

  return (
    <div className="flex h-screen w-screen flex-col bg-transparent text-foreground overflow-hidden">
      {/* Top Header */}
      <header className="h-12 border-b border-border bg-transparent px-4 py-2 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-xs tracking-wider uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Excalidraw
          </span>
          <h1 className="text-sm font-medium text-foreground max-w-xs truncate">
            {displayTitle}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {saveStatus && (
            <span className={`text-xs mr-2 font-medium ${saveStatus.includes("failed") ? "text-red-400" : "text-emerald-400"}`}>
              {saveStatus}
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3.5 py-1.5 text-xs font-semibold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </button>

          <button
            onClick={handleExit}
            className="flex items-center gap-1.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground px-3.5 py-1.5 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit
          </button>
        </div>
      </header>

      {/* Editor Main */}
      <div className="flex-1 w-full h-full relative">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={initialData}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
        />
      </div>
    </div>
  );
}
