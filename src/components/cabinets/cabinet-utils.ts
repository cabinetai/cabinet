"use client";

import type { CabinetAgentSummary } from "@/types/cabinets";
import type { ConversationMeta } from "@/types/conversations";
import {
  Bot,
  CheckCircle2,
  Clock3,
  HeartPulse,
  Loader2,
  XCircle,
} from "lucide-react";
import { createElement } from "react";

/* ─── String helpers ─── */

export function startCase(value: string | undefined, fallback = "General"): string {
  if (!value) return fallback;
  const words = value.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/* ─── Agent sorting ─── */

export function rankAgentType(type?: string): number {
  if (type === "lead") return 0;
  if (type === "specialist") return 1;
  if (type === "support") return 2;
  return 3;
}

export function sortOrgAgents(a: CabinetAgentSummary, b: CabinetAgentSummary): number {
  if (a.cabinetDepth !== b.cabinetDepth) return a.cabinetDepth - b.cabinetDepth;
  const typeRank = rankAgentType(a.type) - rankAgentType(b.type);
  if (typeRank !== 0) return typeRank;
  if ((b.active ? 1 : 0) !== (a.active ? 1 : 0)) return (b.active ? 1 : 0) - (a.active ? 1 : 0);
  return a.name.localeCompare(b.name);
}

/* ─── Time formatting ─── */

export function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/* ─── Trigger styles / labels ─── */

export const TRIGGER_STYLES: Record<ConversationMeta["trigger"], string> = {
  manual: "bg-sky-500/12 text-sky-400 ring-1 ring-sky-500/20",
  job: "bg-emerald-500/12 text-emerald-400 ring-1 ring-emerald-500/20",
  heartbeat: "bg-pink-500/12 text-pink-400 ring-1 ring-pink-500/20",
  agent: "bg-violet-500/12 text-violet-400 ring-1 ring-violet-500/20",
};

export const TRIGGER_LABELS: Record<ConversationMeta["trigger"], string> = {
  manual: "Manual",
  job: "Job",
  heartbeat: "Heartbeat",
  agent: "Agent",
};

/* ─── Icon components ─── */

export function TriggerIcon({ trigger }: { trigger: ConversationMeta["trigger"] }) {
  if (trigger === "job") return createElement(Clock3, { className: "h-2.5 w-2.5" });
  if (trigger === "heartbeat") return createElement(HeartPulse, { className: "h-2.5 w-2.5" });
  return createElement(Bot, { className: "h-2.5 w-2.5" });
}

export function StatusIcon({ status }: { status: ConversationMeta["status"] }) {
  if (status === "running") return createElement(Loader2, { className: "h-3.5 w-3.5 animate-spin text-emerald-500" });
  if (status === "completed") return createElement(CheckCircle2, { className: "h-3.5 w-3.5 text-emerald-500" });
  if (status === "failed") return createElement(XCircle, { className: "h-3.5 w-3.5 text-destructive" });
  return createElement(XCircle, { className: "h-3.5 w-3.5 text-muted-foreground/40" });
}
