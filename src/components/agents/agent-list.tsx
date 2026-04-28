"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  Library,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { AgentListItem } from "@/types/agents";

interface LibraryTemplate {
  slug: string;
  name: string;
  emoji: string;
  type: string;
  department: string;
  role: string;
  description: string;
}

function AgentCardItem({
  agent,
  onClick,
}: {
  agent: AgentListItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-card border border-border rounded-lg p-4 text-left hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-pointer w-full"
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl">{agent.emoji}</span>
        <div
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            agent.status === "running"
              ? "bg-green-500/10 text-green-500"
              : agent.status === "active"
                ? "bg-blue-500/10 text-blue-500"
                : "bg-muted text-muted-foreground"
          )}
        >
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              agent.status === "running"
                ? "bg-green-500 animate-pulse"
                : agent.status === "active"
                  ? "bg-blue-500"
                  : "bg-muted-foreground/40"
            )}
          />
          {agent.status === "running"
            ? "Running"
            : agent.active
              ? "Active"
              : "Idle"}
        </div>
      </div>
      <h3 className="text-[13px] font-semibold mt-2">{agent.name}</h3>
      <p className="text-[11px] text-muted-foreground capitalize">
        {agent.type}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{agent.role}</p>
      <p className="text-[10px] text-muted-foreground mt-2">
        {agent.jobCount} {agent.jobCount === 1 ? "job" : "jobs"}
      </p>
    </button>
  );
}

function LibraryDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (slug: string) => void;
}) {
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents/library")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => {});
  }, []);

  const handleAdd = async (slug: string) => {
    setAdding(slug);
    try {
      const res = await fetch(`/api/agents/library/${slug}/add`, {
        method: "POST",
      });
      if (res.ok) {
        onAdd(slug);
      }
    } finally {
      setAdding(null);
    }
  };

  // Group by department
  const grouped = templates.reduce<Record<string, LibraryTemplate[]>>(
    (acc, t) => {
      const dept = t.department || "general";
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(t);
      return acc;
    },
    {}
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Library className="h-4 w-4" />
            <h2 className="text-[15px] font-semibold">Agent Library</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {Object.entries(grouped).map(([dept, items]) => (
              <div key={dept}>
                <h3 className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider mb-3">
                  {dept}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {items.map((t) => (
                    <div
                      key={t.slug}
                      className="bg-card border border-border rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-lg">{t.emoji}</span>
                          <h4 className="text-[13px] font-medium mt-1">
                            {t.name}
                          </h4>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {t.role}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleAdd(t.slug)}
                          disabled={adding === t.slug}
                        >
                          <Plus className="h-3 w-3" />
                          {adding === t.slug ? "Adding..." : "Add"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentList() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLibrary, setShowLibrary] = useState(false);
  const setSection = useAppStore((s) => s.setSection);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/personas");
      if (res.ok) {
        const data = await res.json();
        const personas = data.personas || [];
        setAgents(
          personas.map(
            (p: {
              name: string;
              slug: string;
              emoji: string;
              type: string;
              department: string;
              role: string;
              active: boolean;
            }) => ({
              name: p.name,
              slug: p.slug,
              emoji: p.emoji || "",
              type: p.type || "specialist",
              department: p.department || "general",
              role: p.role || "",
              active: p.active,
              jobCount: 0,
              status: p.active ? "active" : "idle",
            })
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAgentClick = (slug: string) => {
    setSection({ type: "agent", slug });
  };

  const handleLibraryAdd = () => {
    setShowLibrary(false);
    refresh();
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
          <div className="h-7 w-28 rounded bg-muted animate-pulse" />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                <div className="flex justify-between">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="h-5 w-14 rounded-full bg-muted" />
                </div>
                <div className="h-3 w-1/2 bg-muted rounded mt-3" />
                <div className="h-2 w-1/3 bg-muted rounded mt-2" />
                <div className="h-2 w-2/3 bg-muted rounded mt-2" />
                <div className="h-2 w-1/4 bg-muted rounded mt-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">
            Agents
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowLibrary(true)}
          >
            <Library className="h-3.5 w-3.5" />
            Add from Library
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <AgentCardItem
                key={agent.slug}
                agent={agent}
                onClick={() => handleAgentClick(agent.slug)}
              />
            ))}
            {/* New Agent card */}
            <button
              onClick={() => setShowLibrary(true)}
              className="border border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-accent/20 transition-colors cursor-pointer min-h-[140px]"
            >
              <Plus className="h-6 w-6" />
              <span className="text-[13px] font-medium">New Agent</span>
            </button>
          </div>
        </div>
      </ScrollArea>

      {showLibrary && (
        <LibraryDialog
          onClose={() => setShowLibrary(false)}
          onAdd={handleLibraryAdd}
        />
      )}
    </div>
  );
}
