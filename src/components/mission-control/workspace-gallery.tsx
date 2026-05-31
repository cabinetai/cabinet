"use client";

import { useState, useEffect } from "react";
import {
  AppWindow,
  FileText,
  Table2,
  Code2,
  File,
  FolderOpen,
  ExternalLink,
  Clock,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTreeStore } from "@/stores/tree-store";
import { useLocale } from "@/i18n/use-locale";

interface GalleryItem {
  name: string;
  type: "app" | "report" | "data" | "code" | "file";
  agent: string;
  agentEmoji: string;
  agentSlug: string;
  department: string;
  path: string;
  modified: string;
  size?: number;
  preview?: string;
}

const TYPE_CONFIG = {
  app: { icon: AppWindow, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "App" },
  report: { icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10", label: "Report" },
  data: { icon: Table2, color: "text-amber-400", bg: "bg-amber-500/10", label: "Data" },
  code: { icon: Code2, color: "text-purple-400", bg: "bg-purple-500/10", label: "Code" },
  file: { icon: File, color: "text-muted-foreground", bg: "bg-muted/30", label: "File" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceGallery({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const setSection = useAppStore((s) => s.setSection);
  const selectPage = useTreeStore((s) => s.selectPage);

  useEffect(() => {
    fetch("/api/agents/gallery")
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((item) => {
    if (filterType && item.type !== filterType) return false;
    if (filterAgent && item.agentSlug !== filterAgent) return false;
    return true;
  });

  const agents = [...new Map(items.map((i) => [i.agentSlug, { slug: i.agentSlug, name: i.agent, emoji: i.agentEmoji }])).values()];
  const types = [...new Set(items.map((i) => i.type))];

  const handleOpen = (item: GalleryItem) => {
    setSection({ type: "page" });
    selectPage(item.path);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <h2 className="text-[14px] font-semibold">{t("tinyExtras:workspaceGallery")}</h2>
          <span className="text-[11px] text-muted-foreground/60">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""} across {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          Back to Mission Control
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 shrink-0 overflow-x-auto">
        <Filter className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        <button
          onClick={() => { setFilterType(null); setFilterAgent(null); }}
          className={cn(
            "px-2 py-0.5 rounded text-[11px] transition-colors shrink-0",
            !filterType && !filterAgent
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground/60 hover:text-foreground"
          )}
        >
          All
        </button>
        {types.map((type) => {
          const config = TYPE_CONFIG[type];
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] transition-colors shrink-0 flex items-center gap-1",
                filterType === type
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground/60 hover:text-foreground"
              )}
            >
              <config.icon className="h-3 w-3" />
              {config.label === "Data" ? "Data" : `${config.label}s`}
            </button>
          );
        })}
        <div className="w-px h-3 bg-border/50 mx-1 shrink-0" />
        {agents.map((agent) => (
          <button
            key={agent.slug}
            onClick={() => setFilterAgent(filterAgent === agent.slug ? null : agent.slug)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] transition-colors shrink-0",
              filterAgent === agent.slug
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground/60 hover:text-foreground"
            )}
          >
            {agent.emoji} {agent.name}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {loading ? (
          <div className="text-center py-12 text-[12px] text-muted-foreground/50">
            Scanning workspaces...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/20" />
            <p className="text-[13px] text-muted-foreground/60">
              {items.length === 0
                ? "No workspace output yet. Run agents to see their work here."
                : "No items match the current filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {filtered.map((item, i) => {
              const config = TYPE_CONFIG[item.type];
              const Icon = config.icon;

              return (
                <button
                  key={`${item.path}-${i}`}
                  onClick={() => handleOpen(item)}
                  className="text-left border border-border/50 rounded-lg p-3 hover:border-primary/30 hover:bg-primary/[0.02] transition-colors group"
                >
                  {/* Type badge + name */}
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className={cn("p-1.5 rounded-md shrink-0 mt-0.5", config.bg)}>
                      <Icon className={cn("h-4 w-4", config.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium truncate group-hover:text-primary transition-colors">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px]">{item.agentEmoji}</span>
                        <span className="text-[11px] text-muted-foreground/60 truncate">
                          {item.agent}
                        </span>
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 shrink-0 mt-1 transition-colors" />
                  </div>

                  {/* Preview text */}
                  {item.preview && (
                    <p className="text-[11px] text-muted-foreground/50 line-clamp-2 mb-2">
                      {item.preview}
                    </p>
                  )}

                  {/* Footer: time + size */}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{timeAgo(item.modified)}</span>
                    {item.size ? (
                      <>
                        <span>·</span>
                        <span>{formatSize(item.size)}</span>
                      </>
                    ) : null}
                    <span className={cn("ms-auto px-1.5 py-0.5 rounded text-[9px] uppercase font-medium tracking-wider", config.bg, config.color)}>
                      {config.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
