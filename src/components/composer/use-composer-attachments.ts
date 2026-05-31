"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type AttachmentStatus = "uploading" | "ready" | "error";

export interface ComposerAttachment {
  id: string;
  filename: string;
  displayName: string;
  mime: string;
  size: number;
  previewUrl?: string;
  virtualPath?: string;
  status: AttachmentStatus;
  error?: string;
}

export interface UseComposerAttachmentsOptions {
  cabinetPath?: string;
  conversationId?: string;
  clientAttachmentId: string;
  enabled?: boolean;
}

export interface UseComposerAttachmentsReturn {
  attachments: ComposerAttachment[];
  ready: ComposerAttachment[];
  isUploading: boolean;
  enabled: boolean;
  targetDir: string;
  addFiles: (files: FileList | File[] | null | undefined) => void;
  remove: (id: string) => void;
  clear: () => void;
}

interface InternalController {
  controller: AbortController;
  objectUrl?: string;
}

function computeTargetDir(opts: UseComposerAttachmentsOptions): string {
  const base = opts.cabinetPath ? `${opts.cabinetPath.replace(/^\/+|\/+$/g, "")}/` : "";
  if (opts.conversationId) {
    return `${base}.agents/.conversations/${opts.conversationId}/attachments`;
  }
  return `${base}.agents/.conversations/_pending/${opts.clientAttachmentId}/attachments`;
}

interface UploadResponse {
  ok: boolean;
  filename: string;
  url: string;
}

export function useComposerAttachments(
  options: UseComposerAttachmentsOptions
): UseComposerAttachmentsReturn {
  const enabled = options.enabled !== false;
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const controllersRef = useRef<Map<string, InternalController>>(new Map());

  const targetDir = useMemo(() => computeTargetDir(options), [
    options.cabinetPath,
    options.conversationId,
    options.clientAttachmentId,
  ]);

  const updateAttachment = useCallback(
    (id: string, patch: Partial<ComposerAttachment>) => {
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    []
  );

  const uploadOne = useCallback(
    async (attachment: ComposerAttachment, file: File, dir: string) => {
      const controller = new AbortController();
      controllersRef.current.set(attachment.id, {
        controller,
        objectUrl: attachment.previewUrl,
      });

      try {
        const formData = new FormData();
        formData.append("file", file);
        const encodedDir = dir
          .split("/")
          .filter(Boolean)
          .map(encodeURIComponent)
          .join("/");
        const response = await fetch(`/api/upload/${encodedDir}?commit=0`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = `Upload failed (${response.status})`;
          try {
            const payload = (await response.json()) as { error?: string };
            if (payload?.error) message = payload.error;
          } catch {
            // ignore
          }
          updateAttachment(attachment.id, { status: "error", error: message });
          return;
        }
        const payload = (await response.json()) as UploadResponse;
        updateAttachment(attachment.id, {
          status: "ready",
          filename: payload.filename,
          virtualPath: `${dir}/${payload.filename}`,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        const message =
          error instanceof Error ? error.message : "Upload failed";
        updateAttachment(attachment.id, { status: "error", error: message });
      } finally {
        controllersRef.current.delete(attachment.id);
      }
    },
    [updateAttachment]
  );

  const addFiles = useCallback(
    (files: FileList | File[] | null | undefined) => {
      if (!enabled || !files) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      const dir = targetDir;

      const newOnes: ComposerAttachment[] = list.map((file) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        return {
          id,
          filename: file.name,
          displayName: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          previewUrl,
          status: "uploading",
        };
      });

      setAttachments((prev) => [...prev, ...newOnes]);
      newOnes.forEach((attachment, idx) => {
        void uploadOne(attachment, list[idx], dir);
      });
    },
    [enabled, targetDir, uploadOne]
  );

  const remove = useCallback(
    (id: string) => {
      const ctrl = controllersRef.current.get(id);
      const current = attachments.find((a) => a.id === id);

      if (ctrl) {
        try {
          ctrl.controller.abort();
        } catch {
          // ignore
        }
        controllersRef.current.delete(id);
      }
      if (current?.previewUrl) {
        try {
          URL.revokeObjectURL(current.previewUrl);
        } catch {
          // ignore
        }
      }
      if (current?.status === "ready" && current.virtualPath) {
        const encoded = current.virtualPath
          .split("/")
          .filter(Boolean)
          .map(encodeURIComponent)
          .join("/");
        void fetch(`/api/upload/${encoded}`, { method: "DELETE" }).catch(() => {
          // best-effort — cleanup cron will catch it
        });
      }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    },
    [attachments]
  );

  const clear = useCallback(() => {
    controllersRef.current.forEach(({ controller }) => {
      try {
        controller.abort();
      } catch {
        // ignore
      }
    });
    controllersRef.current.clear();
    setAttachments((prev) => {
      prev.forEach((a) => {
        if (a.previewUrl) {
          try {
            URL.revokeObjectURL(a.previewUrl);
          } catch {
            // ignore
          }
        }
      });
      return [];
    });
  }, []);

  const isUploading = useMemo(
    () => attachments.some((a) => a.status === "uploading"),
    [attachments]
  );
  const ready = useMemo(
    () => attachments.filter((a) => a.status === "ready"),
    [attachments]
  );

  return {
    attachments,
    ready,
    isUploading,
    enabled,
    targetDir,
    addFiles,
    remove,
    clear,
  };
}
