"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, GripHorizontal, Hash, Plus, MessageCircle, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SlackMessage } from "@/types/agents";
import { useLocale } from "@/i18n/use-locale";

interface AgentMention {
  slug: string;
  name: string;
  emoji: string;
}

/**
 * Simple inline markdown renderer for Slack messages.
 * Handles: **bold**, `code`, [links](url), → [text](path) workspace refs
 */
function renderMessageContent(content: string, onOpenFile?: (path: string) => void, agentSlug?: string): React.ReactNode {
  // Split into segments: bold, code, links, plain text
  const parts: React.ReactNode[] = [];
  let remaining = content;
  let key = 0;

  while (remaining.length > 0) {
    // Check for markdown link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const [full, text, href] = linkMatch;
      const isInternal = href.startsWith("/") || href.startsWith("workspace/") || href.startsWith("./") || href.startsWith("data/");
      parts.push(
        <a
          key={key++}
          href={isInternal ? "#" : href}
          onClick={isInternal ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onOpenFile) {
              // Normalize path: strip leading slashes, ensure /data/ prefix
              let filePath = href;
              if (filePath.startsWith("./")) filePath = filePath.slice(2);
              if (filePath.startsWith("workspace/")) {
                const slug = agentSlug || "unknown";
                filePath = `/data/.agents/${slug}/${filePath}`;
              }
              if (!filePath.startsWith("/data/")) filePath = `/data/${filePath}`;
              onOpenFile(filePath);
            }
          } : undefined}
          className={cn(
            "underline underline-offset-2 decoration-1",
            isInternal ? "text-primary hover:text-primary/80 cursor-pointer" : "text-blue-400 hover:text-blue-300"
          )}
          target={isInternal ? undefined : "_blank"}
          rel={isInternal ? undefined : "noopener noreferrer"}
        >
          {text}
        </a>
      );
      remaining = remaining.slice(full.length);
      continue;
    }

    // Check for inline code `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Check for bold **text**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Check for @mention
    const mentionMatch = remaining.match(/^@(\w[\w-]*)/);
    if (mentionMatch) {
      parts.push(
        <span key={key++} className="text-primary font-medium">
          @{mentionMatch[1]}
        </span>
      );
      remaining = remaining.slice(mentionMatch[0].length);
      continue;
    }

    // Plain text up to next special char
    const nextSpecial = remaining.search(/[\[`*@]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // The regex didn't match but we're at a special char — just emit it
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

interface RespondingAgent {
  slug: string;
  channel: string;
  emoji: string;
  name: string;
}

interface SlackPanelProps {
  height?: number;
  onOpenFile?: (path: string) => void;
}

export function SlackPanel({ height: initialHeight = 200, onOpenFile }: SlackPanelProps) {
  const { t } = useLocale();
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [respondingAgents, setRespondingAgents] = useState<RespondingAgent[]>([]);
  const [activeChannel, setActiveChannel] = useState("general");
  const [input, setInput] = useState("");
  const [panelHeight, setPanelHeight] = useState(initialHeight);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentMention[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for Cmd+Shift+A to toggle Slack panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "a") {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listen for channel switch events (from pulse strip clicks)
  useEffect(() => {
    const handler = (e: Event) => {
      const channel = (e as CustomEvent).detail;
      if (channel) {
        setActiveChannel(channel);
        setCollapsed(false); // Expand if collapsed
      }
    };
    window.addEventListener("cabinet:switch-slack-channel", handler);
    return () => window.removeEventListener("cabinet:switch-slack-channel", handler);
  }, []);

  // Listen for agent responding events (typing indicators)
  useEffect(() => {
    const handler = (e: Event) => {
      const agents = (e as CustomEvent).detail as RespondingAgent[];
      setRespondingAgents(agents || []);
    };
    window.addEventListener("cabinet:agent-responding", handler);
    return () => window.removeEventListener("cabinet:agent-responding", handler);
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/slack?channel=${activeChannel}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch { /* ignore */ }
  }, [activeChannel]);

  const [channelCounts, setChannelCounts] = useState<Record<string, number>>({});

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/slack?channels=true");
      if (res.ok) {
        const data = await res.json();
        // Merge discovered channels with default set
        const defaults = ["general", "marketing", "engineering", "operations", "alerts"];
        const discovered = data.channels || [];
        const merged = [...new Set([...defaults, ...discovered])];
        setChannels(merged);
      }
    } catch {
      setChannels(["general", "marketing", "engineering", "operations", "alerts"]);
    }
  }, []);

  // Load unread counts for non-active channels
  const loadCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    for (const ch of channels) {
      if (ch === activeChannel) continue;
      try {
        const res = await fetch(`/api/agents/slack?channel=${ch}&limit=100`);
        if (res.ok) {
          const data = await res.json();
          counts[ch] = (data.messages || []).length;
        }
      } catch { /* ignore */ }
    }
    setChannelCounts(counts);
  }, [channels, activeChannel]);

  useEffect(() => {
    if (channels.length > 0) loadCounts();
  }, [channels, loadCounts]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // Load agents for @mention autocomplete
  useEffect(() => {
    fetch("/api/agents/personas")
      .then((r) => r.json())
      .then((d) => {
        setAgents(
          (d.personas || []).map((p: { slug: string; name: string; emoji?: string }) => ({
            slug: p.slug,
            name: p.name,
            emoji: p.emoji || "🤖",
          }))
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMessages();
    // Listen for SSE slack refresh events
    const handleRefresh = () => loadMessages();
    window.addEventListener("cabinet:slack-refresh", handleRefresh);
    // Fallback poll every 10s (was 5s, now SSE handles real-time)
    const interval = setInterval(loadMessages, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("cabinet:slack-refresh", handleRefresh);
    };
  }, [loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      await fetch("/api/agents/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: activeChannel,
          agent: "human",
          type: "message",
          content: input.trim(),
          ...(threadId ? { thread: threadId } : {}),
        }),
      });
      setInput("");
      loadMessages();
    } catch { /* ignore */ }
  };

  const handleCreateChannel = () => {
    const name = newChannelName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!name || channels.includes(name)) {
      setShowNewChannel(false);
      setNewChannelName("");
      return;
    }
    // Post a system message to create the channel
    fetch("/api/agents/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: name,
        agent: "system",
        type: "message",
        content: `Channel #${name} created`,
      }),
    }).then(() => {
      setChannels((prev) => [...prev, name]);
      setActiveChannel(name);
      setShowNewChannel(false);
      setNewChannelName("");
      loadMessages();
    });
  };

  // Expose inputRef for Cmd+/ shortcut
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.setAttribute("data-slack-input", "true");
    }
  }, []);

  // Drag resize handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newHeight = Math.max(80, Math.min(600, dragRef.current.startHeight + delta));
      setPanelHeight(newHeight);
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [panelHeight]);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  return (
    <div
      className="border-t border-border flex flex-col bg-background relative transition-all"
      style={{ height: collapsed ? 36 : panelHeight }}
    >
      {/* Drag handle */}
      <div
        className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-10 flex items-center justify-center group hover:bg-primary/5"
        onMouseDown={handleDragStart}
        onDoubleClick={() => setCollapsed((prev) => !prev)}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
      </div>

      {/* Channel tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 overflow-x-auto shrink-0 mt-1">
        <span className="text-[11px] text-muted-foreground/50 mr-1 shrink-0">
          Agent Slack
        </span>
        {channels.map((ch) => {
          const count = channelCounts[ch] || 0;
          return (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full transition-colors shrink-0 flex items-center gap-1",
                activeChannel === ch
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground/60 hover:text-foreground"
              )}
            >
              #{ch}
              {count > 0 && activeChannel !== ch && (
                <span className={cn(
                  "text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full",
                  ch === "alerts" ? "bg-red-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        {showNewChannel ? (
          <div className="flex items-center gap-1 shrink-0">
            <Hash className="h-3 w-3 text-muted-foreground/40" />
            <input
              autoFocus
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateChannel();
                if (e.key === "Escape") { setShowNewChannel(false); setNewChannelName(""); }
              }}
              onBlur={() => { if (!newChannelName.trim()) { setShowNewChannel(false); setNewChannelName(""); } }}
              placeholder="channel-name"
              className="text-[11px] w-24 bg-transparent border-b border-primary/30 focus:outline-none placeholder:text-muted-foreground/30"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNewChannel(true)}
            className="text-[11px] px-1.5 py-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            title={t("slackPanel:createChannel")}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0" ref={scrollRef}>
        {/* Thread header */}
        {threadId && (() => {
          const parent = messages.find((m) => m.id === threadId);
          return (
            <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border/50">
              <button
                onClick={() => setThreadId(null)}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <span className="text-[11px] font-medium text-muted-foreground">{t("slackPanel:thread")}</span>
              {parent && (
                <span className="text-[11px] text-muted-foreground/50 truncate">
                  — {parent.displayName || parent.agent}: {parent.content.slice(0, 60)}
                </span>
              )}
            </div>
          );
        })()}

        {(() => {
          // Compute reply counts for top-level messages
          const replyCounts = new Map<string, number>();
          for (const msg of messages) {
            if (msg.thread) {
              replyCounts.set(msg.thread, (replyCounts.get(msg.thread) || 0) + 1);
            }
          }

          // Filter messages: show top-level or thread replies based on threadId
          const visibleMessages = threadId
            ? messages.filter((m) => m.id === threadId || m.thread === threadId)
            : messages.filter((m) => !m.thread);

          if (visibleMessages.length === 0) {
            return (
              <p className="text-[12px] text-muted-foreground/40 text-center py-4">
                {threadId
                  ? "No replies in this thread yet."
                  : `No messages in #${activeChannel} yet. Agents will post here when they run.`}
              </p>
            );
          }

          return visibleMessages.map((msg) => {
            const replyCount = replyCounts.get(msg.id) || 0;
            return (
              <div key={msg.id} className="group">
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-muted-foreground/50 mt-0.5 w-10 text-right shrink-0 tabular-nums">
                    {formatTime(msg.timestamp)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {msg.agent === "human" ? (
                        <span className="text-[12px] font-medium text-primary">You</span>
                      ) : msg.agent === "system" ? (
                        <span className="text-[12px] font-medium text-muted-foreground/60 italic">system</span>
                      ) : (
                        <>
                          {msg.emoji && <span className="text-[11px]">{msg.emoji}</span>}
                          <span className="text-[12px] font-medium text-foreground">
                            {msg.displayName || msg.agent}
                          </span>
                        </>
                      )}
                      {msg.type !== "message" && (
                        <span className={cn(
                          "text-[9px] px-1 py-0.5 rounded-full",
                          msg.type === "alert" ? "bg-red-500/10 text-red-500" :
                          msg.type === "report" ? "bg-blue-500/10 text-blue-500" :
                          "bg-muted text-muted-foreground/60"
                        )}>
                          {msg.type}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
                      {renderMessageContent(msg.content, onOpenFile, msg.agent)}
                    </p>
                    {/* Thread reply button — only on top-level messages, not inside a thread view */}
                    {!threadId && (
                      <button
                        onClick={() => setThreadId(msg.id)}
                        className={cn(
                          "flex items-center gap-1 mt-1 text-[10px] transition-colors",
                          replyCount > 0
                            ? "text-primary hover:text-primary/80"
                            : "text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <MessageCircle className="h-3 w-3" />
                        {replyCount > 0
                          ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                          : "Reply"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Typing indicator */}
      {respondingAgents.filter((a) => a.channel === activeChannel).length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/30 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            {respondingAgents
              .filter((a) => a.channel === activeChannel)
              .map((a) => (
                <span key={a.slug} className="flex items-center gap-1">
                  <span className="text-[10px]">{a.emoji}</span>
                  <span className="font-medium">{a.name}</span>
                </span>
              ))}
            <span className="text-muted-foreground/50">is thinking</span>
            <span className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 border-t border-border/50 shrink-0 relative">
        {/* @mention autocomplete dropdown */}
        {mentionQuery !== null && (() => {
          const filtered = agents.filter((a) =>
            a.slug.includes(mentionQuery.toLowerCase()) ||
            a.name.toLowerCase().includes(mentionQuery.toLowerCase())
          ).slice(0, 6);
          if (filtered.length === 0) return null;
          return (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-background border border-border rounded-lg shadow-lg py-1 z-20">
              {filtered.map((a, i) => (
                <button
                  key={a.slug}
                  onClick={() => {
                    // Replace @query with @slug
                    const atIdx = input.lastIndexOf("@");
                    const before = input.slice(0, atIdx);
                    setInput(before + `@${a.slug} `);
                    setMentionQuery(null);
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors",
                    i === mentionIdx ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <span className="text-sm">{a.emoji}</span>
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted-foreground/50 text-[10px]">@{a.slug}</span>
                </button>
              ))}
            </div>
          );
        })()}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Detect @mention typing
              const val = e.target.value;
              const atIdx = val.lastIndexOf("@");
              if (atIdx >= 0) {
                const afterAt = val.slice(atIdx + 1);
                // Only show autocomplete if @ is recent (within 20 chars) and no space after query
                if (afterAt.length <= 20 && !/\s/.test(afterAt)) {
                  setMentionQuery(afterAt);
                  setMentionIdx(0);
                  return;
                }
              }
              setMentionQuery(null);
            }}
            onKeyDown={(e) => {
              if (mentionQuery !== null) {
                const filtered = agents.filter((a) =>
                  a.slug.includes(mentionQuery.toLowerCase()) ||
                  a.name.toLowerCase().includes(mentionQuery.toLowerCase())
                ).slice(0, 6);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIdx((prev) => Math.min(prev + 1, filtered.length - 1));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIdx((prev) => Math.max(prev - 1, 0));
                  return;
                }
                if ((e.key === "Enter" || e.key === "Tab") && filtered.length > 0) {
                  e.preventDefault();
                  const selected = filtered[mentionIdx];
                  if (selected) {
                    const atIdx = input.lastIndexOf("@");
                    const before = input.slice(0, atIdx);
                    setInput(before + `@${selected.slug} `);
                    setMentionQuery(null);
                  }
                  return;
                }
                if (e.key === "Escape") {
                  setMentionQuery(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={threadId ? "Reply in thread..." : `Message #${activeChannel}... (@mention agents)`}
            className="flex-1 text-[12px] bg-muted/30 border border-border/50 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1">
          You are speaking as: CEO (human)
        </p>
      </div>
    </div>
  );
}
