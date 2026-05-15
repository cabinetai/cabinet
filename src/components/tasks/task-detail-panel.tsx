"use client";

import { ArrowUpRight, BrainCircuit, Maximize2, Minimize2, X } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { TaskConversationPage } from "@/components/tasks/conversation/task-conversation-page";
import { TaskComposeBody } from "@/components/tasks/task-compose-body";
import { SideDrawer } from "@/components/ui/side-drawer";
import { useSideDrawer } from "@/hooks/use-side-drawer";
import { Button } from "@/components/ui/button";
import { ProviderGlyph } from "@/components/agents/provider-glyph";
import { useProviderIcon } from "@/hooks/use-provider-icons";
import { formatEffortName } from "@/lib/agents/runtime-options";
import { useLocale } from "@/i18n/use-locale";
import type {
  ConversationMeta,
  ConversationStatus,
} from "@/types/conversations";

function StatusDot({ status }: { status: ConversationStatus }) {
  if (status === "running") {
    return <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>;
  }
  if (status === "completed") {
    return <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />;
  }
  if (status === "failed") {
    return <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-destructive" />;
  }
  return <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />;
}

function formatRelative(iso?: string): string {
  if (!iso) return "just now";
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function startCase(value: string | undefined, fallback = "General"): string {
  if (!value) return fallback;
  const words = value.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function readConversationModel(meta: Pick<ConversationMeta, "adapterConfig">): string | null {
  const config = meta.adapterConfig;
  if (!config || typeof config !== "object") return null;
  const model = config.model;
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

function readConversationEffort(meta: Pick<ConversationMeta, "adapterConfig">): string | null {
  const config = meta.adapterConfig;
  if (!config || typeof config !== "object") return null;
  const effort =
    typeof config.effort === "string" && config.effort.trim()
      ? config.effort
      : typeof config.reasoningEffort === "string" && config.reasoningEffort.trim()
        ? config.reasoningEffort
        : null;

  return effort ? formatEffortName(effort) : null;
}

function formatProviderLabel(providerId?: string): string | null {
  if (!providerId) return null;

  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => {
      const upper = segment.toUpperCase();
      if (upper === "API" || upper === "CLI") return upper;
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

function buildRuntimeLabel(
  meta: Pick<ConversationMeta, "adapterConfig" | "providerId">
): string | null {
  const model = readConversationModel(meta);
  const effort = readConversationEffort(meta);
  const provider = formatProviderLabel(meta.providerId);

  if (model && provider && effort) return `${model} · ${provider} · ${effort}`;
  if (model && provider) return `${model} · ${provider}`;
  if (model && effort) return `${model} · ${effort}`;
  if (model) return model;
  if (provider && effort) return `${provider} · ${effort}`;
  if (provider) return `${provider} · default model`;
  return null;
}

export function TaskDetailPanel() {
  const { t } = useLocale();
  const conversation = useAppStore((s) => s.taskPanelConversation);
  const setSection = useAppStore((s) => s.setSection);
  const fullscreen = useAppStore((s) => s.taskPanelFullscreen);
  const toggleFullscreen = useAppStore((s) => s.toggleTaskPanelFullscreen);
  const taskPanelOpen = useAppStore((s) => s.taskPanelOpen);
  const taskPanelMode = useAppStore((s) => s.taskPanelMode);
  const composeContext = useAppStore((s) => s.taskPanelComposeContext);
  const closeTaskPanel = useAppStore((s) => s.closeTaskPanel);
  const providerIcon = useProviderIcon(conversation?.providerId);
  const drawer = useSideDrawer({
    isOpen: taskPanelOpen,
    storageKey: "cabinet-task-panel-width",
  });

  if (!drawer.shouldRender) return null;

  const isCompose = taskPanelMode === "compose" || !conversation;

  const openFullPage = () => {
    if (!conversation) return;
    closeTaskPanel();
    setSection({
      type: "task",
      taskId: conversation.id,
      cabinetPath: conversation.cabinetPath,
    });
  };

  const runtimeLabel = conversation ? buildRuntimeLabel(conversation) : null;
  const errorKind = conversation?.errorKind;

  const header = (
    <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3 shrink-0">
      <div className="min-w-0 flex-1">
        {isCompose || !conversation ? (
          <p className="truncate text-[13px] font-medium text-foreground">
            New task
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <StatusDot status={conversation.status} />
              {providerIcon ? (
                <div
                  className="flex size-4 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/30"
                  title={providerIcon.name}
                >
                  <ProviderGlyph
                    icon={providerIcon.icon}
                    asset={providerIcon.iconAsset}
                    className="h-2.5 w-2.5"
                  />
                </div>
              ) : null}
              <p className="truncate text-[13px] font-medium text-foreground">
                {conversation.title}
              </p>
            </div>
            <p className="mt-0.5 truncate pl-4 text-[11px] text-muted-foreground">
              {startCase(conversation.agentSlug)}
              {" · "}
              {formatRelative(conversation.startedAt)}
              {errorKind ? (
                <span className="ml-1.5 rounded-sm bg-destructive/10 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-destructive">
                  {errorKind.replace(/_/g, " ")}
                </span>
              ) : null}
            </p>
            {runtimeLabel ? (
              <div className="mt-1 flex items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
                <BrainCircuit className="size-3.5 shrink-0" />
                <p className="truncate">{runtimeLabel}</p>
              </div>
            ) : null}
          </>
        )}
      </div>
      {!drawer.isMobile ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
          onClick={toggleFullscreen}
          title={fullscreen ? "Shrink" : "Enlarge"}
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </Button>
      ) : null}
      {!isCompose && conversation ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 shrink-0 px-2 text-[11px] text-muted-foreground"
          onClick={openFullPage}
          title={t("tinyExtras:openFullTaskViewer")}
        >
          <ArrowUpRight className="size-3.5" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        onClick={closeTaskPanel}
      >
        <X className="size-4" />
      </Button>
    </div>
  );

  const body =
    isCompose || !conversation ? (
      <TaskComposeBody context={composeContext} />
    ) : (
      <div className="flex-1 overflow-hidden">
        <TaskConversationPage
          taskId={conversation.id}
          variant="compact"
          returnContext={{
            type: "task",
            taskId: conversation.id,
            cabinetPath: conversation.cabinetPath,
          }}
        />
      </div>
    );

  const content = (
    <>
      {header}
      {body}
    </>
  );

  // Fullscreen is a separate overlay layout — bypass the drawer width-tween.
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {content}
      </div>
    );
  }

  return (
    <SideDrawer drawer={drawer} onScrimClick={closeTaskPanel}>
      {content}
    </SideDrawer>
  );
}
