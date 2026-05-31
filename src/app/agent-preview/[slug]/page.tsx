"use client";

import { use } from "react";
import { AgentDetailV2 } from "@/components/agents/agent-detail-v2";

export default function AgentPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <div className="h-screen bg-background text-foreground flex flex-col">
      <div className="shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] uppercase tracking-wider font-medium px-6 py-1.5 border-b border-amber-500/20">
        Demo · Agent page v2
      </div>
      <div className="flex-1 min-h-0">
        <AgentDetailV2 slug={slug} />
      </div>
    </div>
  );
}
