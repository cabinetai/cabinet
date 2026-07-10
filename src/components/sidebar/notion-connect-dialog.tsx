"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileArchive,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useIsCloud } from "@/lib/cloud/client-tier";
import { SetupGuide } from "@/components/integrations/hub/setup-guide";
import {
  MockWindow,
  Hint,
  ToggleRow,
  BtnMock,
  KvRow,
} from "@/components/integrations/hub/setup-art-primitives";

// Matches the Notion brand used on its Integrations Hub page.
const BRAND = "#000000";

type Phase = "intro" | "working" | "done" | "error";

/**
 * Two-popup Notion flow opened from Connect Knowledge → Notion:
 *  1. Chooser — "Import from an export" (one-time, local Markdown) vs
 *     "Connect & sync" (live MCP, routes to the Integrations Hub).
 *  2. Export — a Telegram-style illustrated guide for downloading a Notion
 *     export, then a guided import with inline progress / result / errors. The
 *     file is chosen via the native picker so nothing is uploaded over HTTP.
 */
export function NotionConnectDialog({
  open,
  onOpenChange,
  targetPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tree path the import lands under (the right-clicked folder). */
  targetPath: string;
}) {
  const cloud = useIsCloud();
  const [step, setStep] = useState<"choose" | "export">("choose");
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ path: string; count: number } | null>(null);

  const setSection = useAppStore((s) => s.setSection);
  const loadTree = useTreeStore((s) => s.loadTree);
  const expandPath = useTreeStore((s) => s.expandPath);
  const selectPage = useTreeStore((s) => s.selectPage);

  const close = () => {
    onOpenChange(false);
    // Reset after the close animation so the next open starts fresh.
    setTimeout(() => {
      setStep("choose");
      setPhase("intro");
      setError("");
      setResult(null);
    }, 200);
  };

  // Dismissing mid-import is allowed — the server call finishes on its own.
  const handleOpenChange = (o: boolean) => {
    if (!o) close();
  };

  const goSync = () => {
    setSection({ type: "integrations", slug: "notion" });
    close();
  };

  const pickAndImport = async () => {
    try {
      const pick = await fetch("/api/system/pick-file?ext=zip", { method: "POST" });
      const picked = await pick.json().catch(() => null);
      if (!pick.ok) throw new Error(picked?.error || "Couldn't open the file picker.");
      if (picked?.cancelled || !picked?.path) return; // user backed out — stay put

      setPhase("working");
      setError("");
      const res = await fetch("/api/system/import-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: picked.path, parentPath: targetPath || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Import failed.");

      if (targetPath) expandPath(targetPath);
      await loadTree();
      setResult({ path: data.path, count: data.count ?? 0 });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setPhase("error");
    }
  };

  const openImported = () => {
    if (result?.path) selectPage(result.path);
    close();
  };

  // ── Export popup ───────────────────────────────────────────────────────
  if (open && step === "export") {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            {phase === "intro" && (
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="mb-1 inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            )}
            <DialogTitle>Import from a Notion export</DialogTitle>
            <DialogDescription>
              Notion can&apos;t hand files over directly, so you download a one-time
              export and drop it in here. It takes about a minute.
            </DialogDescription>
          </DialogHeader>

          {phase === "intro" && (
            <>
              <div className="max-h-[52vh] overflow-y-auto pr-1">
                <SetupGuide steps={EXPORT_STEPS} brand={BRAND} art={(i) => EXPORT_ART[i]} />
              </div>
              <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={() => setStep("choose")}>
                  Back
                </Button>
                <Button onClick={pickAndImport} style={{ background: BRAND }} className="text-white">
                  <FileArchive className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Choose export file…
                </Button>
              </div>
            </>
          )}

          {phase === "working" && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center gap-3 py-10 text-center"
            >
              <Loader2 className="h-8 w-8 animate-spin text-foreground/70" aria-hidden="true" />
              <div className="text-[14px] font-medium text-foreground">
                Importing your Notion export…
              </div>
              <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                Unzipping, tidying page names, and rewriting links. Large workspaces
                can take a moment — you can keep working while it finishes.
              </p>
            </div>
          )}

          {phase === "done" && result && (
            <div className="flex flex-col items-center gap-3 py-9 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" aria-hidden="true" />
              <div className="text-[15px] font-semibold text-foreground">
                Imported {result.count} {result.count === 1 ? "page" : "pages"}
              </div>
              <p className="text-[13px] text-muted-foreground">
                Added to{" "}
                <span className="font-medium text-foreground">{result.path}</span>.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="ghost" onClick={close}>
                  Done
                </Button>
                <Button onClick={openImported} style={{ background: BRAND }} className="text-white">
                  Open it
                </Button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col gap-4 py-4">
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <p className="text-[13px] leading-relaxed text-foreground">{error}</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setStep("choose")}>
                  Back
                </Button>
                <Button onClick={pickAndImport} style={{ background: BRAND }} className="text-white">
                  <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Try again
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // ── Chooser popup ──────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Notion</DialogTitle>
          <DialogDescription>
            Bring your Notion content in as files, or connect your account so
            agents can work with it live.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {/* The export import reads a .zip through the native file picker, which
              Cabinet Cloud has no access to — offer only the live MCP sync there. */}
          {!cloud && (
            <ChooserCard
              icon={<FileArchive className="h-5 w-5" aria-hidden="true" />}
              title="Import from an export"
              body="One-time import. Your pages become editable Markdown files in this room — offline, searchable, no account needed."
              onClick={() => setStep("export")}
            />
          )}
          <ChooserCard
            icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
            title="Connect & sync"
            body="Link your Notion account so agents can search and update it live. Opens the Integrations Hub."
            onClick={goSync}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChooserCard({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card/40 p-4 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground"
        style={{ background: `${BRAND}14` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      </span>
      <ChevronRight
        className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}

const EXPORT_STEPS = [
  {
    title: "Open the ••• menu in Notion",
    body: "In Notion (web or desktop), open the page or workspace you want, click the ••• menu at the top-right, and choose Export.",
  },
  {
    title: "Export as Markdown & CSV",
    body: "Set Export format to Markdown & CSV, turn on Include subpages (and Create folders for subpages), then click Export.",
    href: "https://www.notion.so/help/export-your-content",
  },
  {
    title: "Grab the .zip",
    body: "Notion prepares a .zip and downloads it — big workspaces arrive as an emailed link. Then choose it below.",
  },
];

/** Theme-aware mini-mockups of the Notion export screens, one per step. */
const EXPORT_ART = [
  <MockWindow key="0" title="Notion" brand={BRAND}>
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[11px] font-medium text-foreground">My Workspace</span>
      <span className="text-[12px] tracking-widest text-muted-foreground">•••</span>
    </div>
    <div className="rounded-md border border-border bg-background/70 p-1 text-[10.5px]">
      <div className="px-2 py-1 text-muted-foreground">Copy link</div>
      <div className="px-2 py-1 text-muted-foreground">Move to</div>
      <div
        className="rounded px-2 py-1 font-medium text-foreground"
        style={{ background: `${BRAND}14` }}
      >
        Export
      </div>
    </div>
    <Hint brand={BRAND}>
      Pick <b>Export</b> near the bottom of the ••• menu.
    </Hint>
  </MockWindow>,

  <MockWindow key="1" title="Export My Workspace" brand={BRAND}>
    <KvRow k="Export format" v="Markdown & CSV" />
    <div className="mt-1.5 space-y-1.5">
      <ToggleRow label="Include subpages" on brand={BRAND} />
      <ToggleRow label="Create folders for subpages" on brand={BRAND} />
    </div>
    <BtnMock brand={BRAND} full>
      Export
    </BtnMock>
    <Hint brand={BRAND}>
      Use <b>Markdown &amp; CSV</b> — PDF/HTML won&apos;t import.
    </Hint>
  </MockWindow>,

  <MockWindow key="2" title="Downloads" brand={BRAND}>
    <div className="flex items-center gap-2 rounded-md bg-foreground/[0.05] px-2 py-1.5">
      <FileArchive className="h-4 w-4" style={{ color: BRAND }} aria-hidden="true" />
      <span className="flex-1 truncate text-[10.5px] text-foreground">
        Export-7a3f…-Part-1.zip
      </span>
      <span className="text-[10px] text-muted-foreground">34.8 MB</span>
    </div>
    <Hint brand={BRAND}>
      Keep the <b>.zip</b> as-is — no need to unzip it first.
    </Hint>
  </MockWindow>,
];
