"use client";

import { Plus, X, Bot, PanelBottom, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { WebTerminal } from "./web-terminal";
import { useCallback, useRef, useState } from "react";

export function TerminalTabs() {
  const {
    terminalTabs,
    activeTerminalTab,
    addTerminalTab,
    removeTerminalTab,
    setActiveTerminalTab,
    closeTerminal,
    terminalPosition,
    setTerminalPosition,
  } = useAppStore();

  const [height, setHeight] = useState(350);
  const [width, setWidth] = useState(420);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const handleVerticalMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startY = e.clientY;
      const startHeight = height;

      const onMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = startY - e.clientY;
        const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + delta));
        setHeight(newHeight);
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    },
    [height]
  );

  const handleHorizontalMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (e: MouseEvent) => {
        const newWidth = Math.max(250, Math.min(window.innerWidth * 0.5, startWidth + (startX - e.clientX)));
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width]
  );

  if (terminalTabs.length === 0) return null;

  const tabBar = (
    <div className="flex items-center border-b border-border bg-card px-1 shrink-0">
      {terminalTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer border-b-2 transition-colors",
            activeTerminalTab === tab.id
              ? "text-foreground border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground"
          )}
          onClick={() => setActiveTerminalTab(tab.id)}
        >
          {tab.prompt && <Bot className="h-2.5 w-2.5 text-primary" />}
          <span>{tab.label}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeTerminalTab(tab.id);
            }}
            className="hover:text-destructive"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
        onClick={() => addTerminalTab()}
      >
        <Plus className="h-3 w-3" />
      </Button>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        title={terminalPosition === "bottom" ? "Move to right panel" : "Move to bottom panel"}
        onClick={() => setTerminalPosition(terminalPosition === "bottom" ? "right" : "bottom")}
      >
        {terminalPosition === "bottom"
          ? <PanelRight className="h-3 w-3" />
          : <PanelBottom className="h-3 w-3" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        onClick={closeTerminal}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );

  const terminalContent = terminalTabs.map((tab) => (
    <div
      key={tab.id}
      className={cn(
        "absolute inset-0",
        activeTerminalTab === tab.id ? "block" : "hidden"
      )}
    >
      <WebTerminal
        sessionId={tab.id}
        prompt={tab.prompt}
        adapterType={tab.adapterType}
        cwd={tab.cwd}
        themeSurface="page"
        onClose={() => removeTerminalTab(tab.id)}
      />
    </div>
  ));

  if (terminalPosition === "right") {
    return (
      <div
        className="flex flex-row h-full border-l border-border/70 bg-background shrink-0"
        style={{ width: `${width}px` }}
      >
        {/* Left-edge resize handle */}
        <div
          className="flex items-center justify-center w-1.5 cursor-col-resize hover:bg-primary/20 transition-colors group shrink-0"
          onMouseDown={handleHorizontalMouseDown}
        >
          <div className="w-0.5 h-8 rounded-full bg-border/70 transition-colors group-hover:bg-primary/50" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          {tabBar}
          <div className="flex-1 relative min-h-0">
            {terminalContent}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col border-t border-border bg-background"
      style={{ height: `${height}px` }}
    >
      {/* Top-edge resize handle */}
      <div
        className="flex items-center justify-center h-1.5 cursor-row-resize hover:bg-primary/20 transition-colors group"
        onMouseDown={handleVerticalMouseDown}
      >
        <div className="h-0.5 w-8 rounded-full bg-border/70 transition-colors group-hover:bg-primary/50" />
      </div>
      {tabBar}
      <div className="flex-1 relative min-h-0">
        {terminalContent}
      </div>
    </div>
  );
}
