"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Sigma } from "lucide-react";

interface Props {
  anchor: { top: number; left?: number; right?: number };
  onCancel: () => void;
  onInsert: (latex: string) => void;
  initialValue?: string;
}

declare global {
  interface Window {
    EqEditor?: any;
  }
}

export function MathPopover({ anchor, onCancel, onInsert, initialValue = "" }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const outputRef = useRef<any>(null);
  const textareaRef = useRef<any>(null);

  const handleInsert = () => {
    if (!outputRef.current) return;
    try {
      let latex = outputRef.current.exportAs("latex") || "";
      // Strip any surrounding delimiters CodeCogs might add (\[...\], \(...\), $$...$$, $...$)
      latex = latex.trim()
        .replace(/^\\\[/, "")
        .replace(/\\\]$/, "")
        .replace(/^\\\(/, "")
        .replace(/\\\)$/, "")
        .replace(/^\$\$/, "")
        .replace(/\$\$$/, "")
        .replace(/^\$/, "")
        .replace(/\$$/, "")
        .trim();

      if (latex) {
        onInsert(latex);
      } else {
        onCancel();
      }
    } catch (err) {
      console.error("Failed to export LaTeX:", err);
    }
  };

  useEffect(() => {
    const scriptId = "codecogs-api-script";
    const cssId = "codecogs-api-css";

    const loadScript = () => {
      if (window.EqEditor) {
        setLoaded(true);
        setLoading(false);
        return;
      }

      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href = "/codecogs/eqneditor.css";
        document.head.appendChild(link);
      }

      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "/codecogs/eqneditor.api.min.js";
        script.async = true;
        script.onload = () => {
          // Check if EqEditor is actually defined on window
          if (window.EqEditor) {
            setLoaded(true);
            setLoading(false);
          } else {
            // Script loaded but namespace not registered yet
            const checkReady = setInterval(() => {
              if (window.EqEditor) {
                clearInterval(checkReady);
                setLoaded(true);
                setLoading(false);
              }
            }, 50);
            setTimeout(() => {
              clearInterval(checkReady);
              if (!window.EqEditor) {
                setError("Namespace EqEditor not found in local script.");
                setLoading(false);
              }
            }, 5000);
          }
        };
        script.onerror = () => {
          setError("Failed to load local CodeCogs script.");
          setLoading(false);
        };
        document.head.appendChild(script);
      } else {
        // Script is already added, wait for namespace to be ready
        const checkReady = setInterval(() => {
          if (window.EqEditor) {
            clearInterval(checkReady);
            setLoaded(true);
            setLoading(false);
          }
        }, 50);
        setTimeout(() => {
          clearInterval(checkReady);
          if (!window.EqEditor) {
            setError("Timeout loading CodeCogs editor namespace.");
            setLoading(false);
          }
        }, 5000);
      }
    };

    loadScript();
  }, []);

  const handleInsertRef = useRef<() => void>(() => {});
  handleInsertRef.current = handleInsert;

  useEffect(() => {
    if (!loaded) return;

    const handleInputKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        handleInsertRef.current();
      }
    };

    const timer = setTimeout(() => {
      try {
        const EqEditor = window.EqEditor;
        if (!EqEditor) return;

        // Initialize output and textarea editor components
        outputRef.current = new EqEditor.Output("codecogs-output-img");
        textareaRef.current = EqEditor.TextArea.link("codecogs-latexInput")
          .addOutput(outputRef.current)
          .addHistoryMenu(new EqEditor.History("codecogs-history"));

        // Initialize and link toolbar
        EqEditor.Toolbar.link("codecogs-toolbar").addTextArea(textareaRef.current);

        // Listen to Enter key in the input element
        const inputEl = document.getElementById("codecogs-latexInput");
        if (inputEl) {
          inputEl.addEventListener("keydown", handleInputKeyDown);
        }

        // Standard CodeCogs styles overrides for history list spacing
        const historyEl = document.getElementById("codecogs-history");
        if (historyEl) {
          const nodes = historyEl.childNodes;
          for (let i = 0; i < nodes.length; i++) {
            (nodes[i] as HTMLElement).style.padding = "2px";
          }
        }

        // Pre-populate with initial value if any
        if (initialValue) {
          textareaRef.current.clear();
          textareaRef.current.insert(initialValue);
        }
      } catch (err) {
        console.error("Error linking local CodeCogs components:", err);
        setError("Failed to initialize equation editor UI.");
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      const inputEl = document.getElementById("codecogs-latexInput");
      if (inputEl) {
        inputEl.removeEventListener("keydown", handleInputKeyDown);
      }
    };
  }, [loaded, initialValue]);



  return (
    <div
      className="absolute z-50 w-[780px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden text-foreground flex flex-col"
      style={{ top: anchor.top, left: "50%", transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20 select-none">
        <div className="flex items-center gap-1.5 text-[12px] font-medium">
          <Sigma className="w-3.5 h-3.5 text-primary" /> CodeCogs Equation Editor
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Main content area */}
      <div className="p-3 min-h-[220px] flex flex-col justify-center">
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-[12px] text-muted-foreground">Loading local assets...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-6 space-y-2">
            <p className="text-[12px] text-destructive font-medium">{error}</p>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-[11px] rounded bg-muted hover:bg-muted/80 cursor-pointer"
            >
              Close
            </button>
          </div>
        )}

        <div className={loaded && !error ? "block space-y-3" : "hidden"}>
          {/* History */}
          <div
            id="codecogs-history"
            className="text-[11px] text-muted-foreground max-h-12 overflow-y-auto border-b border-border pb-1"
          ></div>

          {/* Equation Toolbar */}
          <div
            id="codecogs-toolbar"
            className="flex flex-wrap gap-1 p-1 bg-muted/40 rounded border border-border"
          ></div>

          {/* Equation Input */}
          <div
            id="codecogs-latexInput"
            className="w-full bg-background border border-border rounded-md p-2.5 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[80px]"
            contentEditable
            suppressContentEditableWarning
          ></div>

          {/* Live output preview and action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border gap-3">
            <div className="flex-1 bg-white p-2 rounded border border-border min-h-[48px] flex items-center justify-center overflow-x-auto">
              <img id="codecogs-output-img" alt="Equation preview" className="max-h-12" />
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md border border-border hover:bg-muted/50 cursor-pointer bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsert}
                className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
