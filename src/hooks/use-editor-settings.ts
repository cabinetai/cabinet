"use client";

import { useState, useEffect } from "react";
import { getEditorSettings, type MonacoEditorSettings } from "@/lib/ui/editor-settings";

export function useEditorSettings() {
  const [settings, setSettings] = useState<MonacoEditorSettings>(getEditorSettings);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MonacoEditorSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      }
    };
    window.addEventListener("cabinet:editor-settings-changed", handleUpdate);
    return () => window.removeEventListener("cabinet:editor-settings-changed", handleUpdate);
  }, []);

  return settings;
}
