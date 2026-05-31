import Link from "next/link";
import { notFound } from "next/navigation";
import { readConversationDetail } from "@/lib/agents/conversation-store";
import { buildTaskHref } from "@/lib/navigation/task-route";
import { markdownToHtml } from "@/lib/markdown/to-html";
import { CopyButton } from "./copy-button";
import { parseTranscript } from "./transcript-parser";
import { ContentViewer, TranscriptViewer } from "./transcript-viewer";

export const dynamic = "force-dynamic";

function formatTimestamp(value?: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {value}
      </div>
    </div>
  );
}

export default async function ConversationTranscriptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cabinetPath?: string }>;
}) {
  const { id } = await params;
  const { cabinetPath } = await searchParams;
  const detail = await readConversationDetail(id, cabinetPath);

  if (!detail) {
    notFound();
  }

  const promptText = detail.request || detail.meta.title;
  const transcriptText = detail.transcript || "No transcript captured.";
  const rawTranscriptText = detail.rawTranscript || transcriptText;

  // Pre-render markdown for text blocks (client hydration doesn't work on this page)
  async function buildHtmlMap(text: string): Promise<Record<number, string>> {
    const blocks = parseTranscript(text);
    const map: Record<number, string> = {};
    let textIdx = 0;
    for (const block of blocks) {
      if (block.type === "text") {
        try {
          map[textIdx] = await markdownToHtml(block.content);
        } catch {
          // fallback handled by component
        }
        textIdx++;
      }
    }
    return map;
  }

  const [promptHtmlMap, transcriptHtmlMap] = await Promise.all([
    buildHtmlMap(promptText),
    buildHtmlMap(transcriptText),
  ]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Conversation Transcript
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">{detail.meta.title}</h1>
              <p className="text-sm text-muted-foreground">
                {detail.meta.agentSlug} · {detail.meta.trigger} · {detail.meta.status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={buildTaskHref(detail.meta.id, detail.meta.cabinetPath)}
                className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Open in task viewer
              </Link>
              <Link
                href="/"
                className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                Back to Cabinet
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Started" value={formatTimestamp(detail.meta.startedAt)} />
            <Field label="Completed" value={formatTimestamp(detail.meta.completedAt)} />
            <Field label="Transcript File" value={detail.meta.transcriptPath} />
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Requested Prompt</h2>
                <p className="text-sm text-muted-foreground">
                  The original task request that started this run.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="#transcript"
                  className="inline-flex h-8 items-center rounded-full border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  Open Transcript
                </a>
                <CopyButton text={promptText} />
              </div>
            </div>
            <ContentViewer
              text={promptText}
              htmlMap={promptHtmlMap}
              className="rounded-2xl bg-muted/30 p-4 max-h-[32rem] overflow-y-auto overflow-x-hidden"
            />
          </section>

          <section className="space-y-6">
            <div className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Result</h2>
                <p className="text-sm text-muted-foreground">
                  Structured metadata captured at completion.
                </p>
              </div>
              <div className="space-y-4">
                <Field label="Summary" value={detail.meta.summary || "No summary captured."} />
                <Field label="Context" value={detail.meta.contextSummary || "No context captured."} />
                <Field label="Prompt File" value={detail.meta.promptPath} />
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">Artifacts</h2>
                <p className="text-sm text-muted-foreground">
                  Files the agent created or updated for this run.
                </p>
              </div>
              {detail.artifacts.length > 0 ? (
                <div className="space-y-3">
                  {detail.artifacts.map((artifact) => (
                    <div
                      key={artifact.path}
                      className="rounded-2xl border border-border bg-muted/20 px-4 py-3"
                    >
                      <Field label={artifact.label || "Artifact"} value={artifact.path} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  No artifacts were recorded for this run.
                </div>
              )}
            </div>
          </section>
        </div>

        <TranscriptViewer text={transcriptText} htmlMap={transcriptHtmlMap} />

        <section className="rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Raw Terminal Transcript</h2>
              <p className="text-sm text-muted-foreground">
                Exact PTY output captured from the CLI run, including terminal redraws and status text.
              </p>
            </div>
            <CopyButton text={rawTranscriptText} />
          </div>
          <pre className="max-h-[40rem] overflow-auto rounded-2xl bg-muted/30 p-4 font-mono text-[11px] leading-[1.55] text-foreground/85 whitespace-pre-wrap break-words">
            {rawTranscriptText}
          </pre>
        </section>
      </div>
    </main>
  );
}
