"use client";

import { useCallback, useState } from "react";
import { useTreeStore } from "@/stores/tree-store";

async function uploadOne(targetVirtualPath: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const encoded = targetVirtualPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const res = await fetch(`/api/upload/${encoded}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Upload failed (${res.status})`);
  }
}

function emitToast(kind: "info" | "error" | "success", message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("cabinet:toast", { detail: { kind, message } })
  );
}

export function useFileImport() {
  const loadTree = useTreeStore((s) => s.loadTree);
  const expandPath = useTreeStore((s) => s.expandPath);
  const selectPage = useTreeStore((s) => s.selectPage);
  const [importing, setImporting] = useState(false);
  const [importingFolder, setImportingFolder] = useState(false);

  const importFilesList = useCallback(
    async (targetVirtualPath: string, files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setImporting(true);
      let error: unknown = null;
      try {
        for (const file of list) {
          await uploadOne(targetVirtualPath, file);
        }
      } catch (err) {
        error = err;
      }
      try {
        if (targetVirtualPath) expandPath(targetVirtualPath);
        await loadTree();
      } finally {
        setImporting(false);
      }
      if (error) {
        const msg = error instanceof Error ? error.message : String(error);
        alert(`Import failed: ${msg}`);
      }
    },
    [loadTree, expandPath]
  );

  const importFiles = useCallback(
    (targetVirtualPath: string) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.style.display = "none";
      input.addEventListener("change", () => {
        const files = input.files;
        if (files && files.length > 0) {
          void importFilesList(targetVirtualPath, files);
        }
        input.remove();
      });
      input.addEventListener("cancel", () => {
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    },
    [importFilesList]
  );

  // Import a whole folder. In Electron we use the native directory picker
  // (same one "Connect Knowledge" uses) and a server-side recursive copy that
  // skips VCS/dependency junk and executables. Unlike Connect Knowledge this
  // *copies* the folder in rather than symlinking it.
  const importFolder = useCallback(
    async (targetVirtualPath: string) => {
      setImportingFolder(true);
      try {
        const pick = await fetch("/api/system/pick-directory", {
          method: "POST",
        });
        const picked = await pick.json().catch(() => null);
        if (!pick.ok) {
          throw new Error(picked?.error || "Couldn't open the folder picker.");
        }
        if (picked?.cancelled || !picked?.path) return;

        const res = await fetch("/api/system/import-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: picked.path,
            parentPath: targetVirtualPath || undefined,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Folder import failed.");

        if (targetVirtualPath) expandPath(targetVirtualPath);
        await loadTree();
        if (data?.path) selectPage(data.path);
        emitToast("success", "Folder imported");
      } catch (err) {
        emitToast(
          "error",
          err instanceof Error ? err.message : "Folder import failed."
        );
      } finally {
        setImportingFolder(false);
      }
    },
    [loadTree, expandPath, selectPage]
  );

  return {
    importFiles,
    importFilesList,
    importing,
    importFolder,
    importingFolder,
  };
}
