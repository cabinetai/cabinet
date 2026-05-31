"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Code,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  Sheet,
  Table,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTreeStore } from "@/stores/tree-store";
import { useEditorStore } from "@/stores/editor-store";
import { useAppStore } from "@/stores/app-store";
import { useLocale } from "@/i18n/use-locale";

interface NewFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentPath: string;
  contextCabinetPath?: string | null;
}

type FileGroup = "native" | "office" | "google";

interface FileTypeDef {
  id: string;
  group: FileGroup;
  icon: LucideIcon;
  google?: boolean;
  color: string;
  /** Extension Cabinet appends automatically. Shown on the card so users know
   *  not to type it. `undefined` for code (user picks) and Google (no file). */
  ext?: string;
}

const FILE_TYPES: FileTypeDef[] = [
  { id: "markdown", group: "native", icon: FileText, color: "text-muted-foreground", ext: ".md" },
  { id: "code", group: "native", icon: Code, color: "text-violet-400" },
  { id: "mermaid", group: "native", icon: Workflow, color: "text-teal-400", ext: ".mermaid" },
  { id: "csv", group: "native", icon: Table, color: "text-green-400", ext: ".csv" },
  { id: "docx", group: "office", icon: FileText, color: "text-blue-400", ext: ".docx" },
  { id: "xlsx", group: "office", icon: FileSpreadsheet, color: "text-green-500", ext: ".xlsx" },
  { id: "pptx", group: "office", icon: Presentation, color: "text-orange-400", ext: ".pptx" },
  { id: "gdoc", group: "google", google: true, icon: FileText, color: "text-blue-500" },
  { id: "gsheet", group: "google", google: true, icon: Sheet, color: "text-green-600" },
  { id: "gslides", group: "google", google: true, icon: Presentation, color: "text-yellow-500" },
];

const GROUP_LABEL_KEY: Record<FileGroup, string> = {
  native: "newFile:groupNative",
  office: "newFile:groupOffice",
  google: "newFile:groupGoogle",
};

export function NewFileDialog({
  open,
  onOpenChange,
  parentPath,
  contextCabinetPath,
}: NewFileDialogProps) {
  const { t } = useLocale();
  const loadTree = useTreeStore((s) => s.loadTree);
  const selectPage = useTreeStore((s) => s.selectPage);
  const expandPath = useTreeStore((s) => s.expandPath);
  const loadPage = useEditorStore((s) => s.loadPage);
  const setSection = useAppStore((s) => s.setSection);

  const [selected, setSelected] = useState<string>("markdown");
  const [name, setName] = useState("");
  const [ext, setExt] = useState(".ts");
  const [googleUrl, setGoogleUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setSelected("markdown");
      setName("");
      setExt(".ts");
      setGoogleUrl("");
      setError("");
      setCreating(false);
    }
  }, [open]);

  const selectedDef = useMemo(
    () => FILE_TYPES.find((f) => f.id === selected) || FILE_TYPES[0],
    [selected]
  );

  const groups: FileGroup[] = ["native", "office", "google"];

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/system/create-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPath: parentPath || undefined,
          type: selected,
          name: trimmed,
          ext: selected === "code" ? ext : undefined,
          googleUrl: selectedDef.google ? googleUrl.trim() || undefined : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.path) {
        throw new Error(data?.error || t("newFile:createFailed"));
      }

      if (parentPath) expandPath(parentPath);
      await loadTree();
      selectPage(data.path);
      if (data.isPage) void loadPage(data.path);
      setSection(
        contextCabinetPath
          ? { type: "page", cabinetPath: contextCabinetPath }
          : { type: "page" }
      );

      // Chat-editor handoff: invite the user to tell the AI what to do next.
      if (typeof window !== "undefined") {
        const fileName = data.path.split("/").pop() || trimmed;
        window.dispatchEvent(
          new CustomEvent("cabinet:open-editor-chat", {
            detail: { pagePath: data.path, fileName },
          })
        );
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("newFile:createFailed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("newFile:title")}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">{t("newFile:subtitle")}</p>

        <div className="flex max-h-[46vh] flex-col gap-4 overflow-y-auto py-1">
          {groups.map((group) => (
            <div key={group} className="flex flex-col gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {t(GROUP_LABEL_KEY[group])}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FILE_TYPES.filter((f) => f.group === group).map((def) => {
                  const Icon = def.icon;
                  const isActive = selected === def.id;
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setSelected(def.id)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors",
                        isActive
                          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:bg-foreground/[0.03]"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4 shrink-0", def.color)} />
                        <span className="text-[13px] font-medium">
                          {t(`newFile:types.${def.id}`)}
                        </span>
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {t(`newFile:types.${def.id}Desc`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selectedDef.group === "office" && (
          <p className="text-[11px] text-muted-foreground/70">
            {t("newFile:officeNote")}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex gap-2">
            <Input
              placeholder={t("newFile:namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {selected === "code" ? (
              // Code is the one type whose extension you pick, so it stays editable.
              <Input
                className="w-24"
                aria-label={t("newFile:codeExtLabel")}
                value={ext}
                onChange={(e) => setExt(e.target.value)}
              />
            ) : selectedDef.ext ? (
              // Fixed-extension types: show the suffix as a read-only grey label.
              <div
                aria-hidden
                className="flex h-9 w-24 shrink-0 select-none items-center justify-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
              >
                {selectedDef.ext}
              </div>
            ) : null}
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("newFile:creating")}
                </>
              ) : (
                t("newFile:create")
              )}
            </Button>
          </div>

          {(selectedDef.ext || selected === "code") && (
            <p className="text-[11px] text-muted-foreground/70">
              {t("newFile:extHint", {
                ext: selected === "code" ? ext : selectedDef.ext,
              })}
            </p>
          )}

          {selectedDef.google && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t("newFile:googleUrlLabel")}
              </label>
              <Input
                placeholder={t("newFile:googleUrlPlaceholder")}
                value={googleUrl}
                onChange={(e) => setGoogleUrl(e.target.value)}
              />
            </div>
          )}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
