"use client";

import { useCallback, useState } from "react";
import { useTreeStore } from "@/stores/tree-store";
import {
  filesFromDataTransfer,
  type DroppedFile,
} from "@/lib/storage/datatransfer-files";

async function uploadOne(targetVirtualPath: string, file: File): Promise<void> {
  const encoded = targetVirtualPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  // PUT streams the raw file body to disk server-side (no multipart
  // buffering), so imports aren't limited to small files.
  const res = await fetch(
    `/api/upload/${encoded}?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type)}`,
    { method: "PUT", body: file }
  );
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

  const importDroppedList = useCallback(
    async (targetVirtualPath: string, dropped: DroppedFile[]) => {
      if (dropped.length === 0) return;
      setImporting(true);
      const total = dropped.length;
      let done = 0;
      const skipped: string[] = [];
      const progress = () =>
        window.dispatchEvent(
          new CustomEvent("cabinet:import-progress", {
            detail: { done, total },
          })
        );
      progress();
      // Skip-and-continue per file (a single oversized file must not abort
      // the rest of a folder import).
      // ponytail: fixed 4-way concurrency; make adaptive if cloud latency demands.
      const queue = [...dropped];
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          const dir = item.relativeDir
            ? [targetVirtualPath, item.relativeDir].filter(Boolean).join("/")
            : targetVirtualPath;
          try {
            await uploadOne(dir, item.file);
          } catch (err) {
            skipped.push(
              `${item.file.name}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          done++;
          progress();
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
      window.dispatchEvent(
        new CustomEvent("cabinet:import-progress", {
          detail: { done: 0, total: 0 },
        })
      );
      try {
        if (targetVirtualPath) expandPath(targetVirtualPath);
        await loadTree();
      } finally {
        setImporting(false);
      }
      if (skipped.length === 0) {
        emitToast(
          "success",
          total === 1 ? "Imported 1 file" : `Imported ${total} files`
        );
      } else {
        const shown = skipped.slice(0, 3).join("; ");
        const more =
          skipped.length > 3 ? ` (+${skipped.length - 3} more)` : "";
        emitToast(
          "error",
          `Imported ${total - skipped.length} of ${total} files. Skipped: ${shown}${more}`
        );
      }
    },
    [loadTree, expandPath]
  );

  const importFilesList = useCallback(
    (targetVirtualPath: string, files: FileList | File[]) =>
      importDroppedList(
        targetVirtualPath,
        Array.from(files).map((file) => ({ file, relativeDir: "" }))
      ),
    [importDroppedList]
  );

  // Handles an OS drop, expanding dropped folders into their files (with
  // structure preserved). Must be called synchronously from the drop handler.
  const importDataTransfer = useCallback(
    (targetVirtualPath: string, dt: DataTransfer) => {
      const pending = filesFromDataTransfer(dt);
      return pending.then((dropped) =>
        importDroppedList(targetVirtualPath, dropped)
      );
    },
    [importDroppedList]
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
    importDataTransfer,
    importing,
    importFolder,
    importingFolder,
  };
}
