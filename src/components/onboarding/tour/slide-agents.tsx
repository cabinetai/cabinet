"use client";

import { Brain, Heart, Calendar, Search, PenLine, FolderTree } from "lucide-react";
import { MockupSidebar } from "./mockup-sidebar";
import { TOUR_PALETTE as P } from "./palette";

const OTHER_AGENTS = [
  { name: "Writer", icon: PenLine, tone: "#6B8CC4" },
  { name: "Organizer", icon: FolderTree, tone: "#9678BA" },
];

export function SlideAgents() {
  return (
    <div className="grid h-full grid-cols-[minmax(260px,320px)_1fr] gap-10 lg:gap-14 items-center">
      <div className="h-[440px] w-full">
        <MockupSidebar activeTab="agents" viewTransitionName="cabinet-card">
          <div className="relative flex h-full flex-col gap-2 px-2.5 py-2">
            {/* Other agents fade in then fade out */}
            {OTHER_AGENTS.map((agent, i) => {
              const Icon = agent.icon;
              return (
                <div
                  key={agent.name}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-[12px] opacity-0"
                  style={{
                    color: P.text,
                    animation:
                      "cabinet-tour-fade-up 0.35s ease-out forwards, cabinet-tour-fade-in 0.4s ease-in reverse forwards",
                    animationDelay: `${120 + i * 100}ms, 1800ms`,
                  }}
                >
                  <Icon className="h-4 w-4" style={{ color: agent.tone }} />
                  <span style={{ color: P.textSecondary }}>{agent.name}</span>
                  <span
                    className="ml-auto text-[9px]"
                    style={{ color: P.textTertiary }}
                  >
                    idle
                  </span>
                </div>
              );
            })}

            {/* Research Analyst — the hero card */}
            <div
              className="absolute inset-2 flex flex-col gap-2.5 rounded-xl p-3 opacity-0 backdrop-blur"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.borderDark}`,
                boxShadow: "0 20px 50px -15px rgba(59,47,47,0.25)",
                animation:
                  "cabinet-tour-fade-up 0.4s ease-out forwards, cabinet-tour-agent-lift 0.6s ease-out forwards",
                animationDelay: "600ms, 1900ms",
              }}
            >
              {/* Card header */}
              <div
                className="flex items-center gap-2 pb-2"
                style={{ borderBottom: `1px solid ${P.border}` }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                  style={{
                    background: `linear-gradient(135deg, ${P.accent}, ${P.accentWarm})`,
                  }}
                >
                  <Search className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: P.text }}
                  >
                    Research Analyst
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: P.textTertiary }}
                  >
                    Claude · Sonnet 4.6
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className="absolute inline-flex h-full w-full rounded-full"
                      style={{
                        background: "#5A9E7B",
                        animation: "cabinet-tour-heartbeat-dot 1.4s ease-in-out infinite",
                      }}
                    />
                    <span
                      className="relative inline-flex h-1.5 w-1.5 rounded-full"
                      style={{ background: "#4A8E6B" }}
                    />
                  </span>
                  <span
                    className="text-[9px] font-medium"
                    style={{ color: "#4A8E6B" }}
                  >
                    live
                  </span>
                </div>
              </div>

              {/* (1) Persona */}
              <Callout
                num={1}
                icon={Brain}
                iconColor={P.accent}
                label="Persona"
                body="&ldquo;Rigorous analyst. Cites sources. Flags conflicting claims.&rdquo;"
                delay="2500ms"
              />

              {/* (2) Heartbeat */}
              <Callout
                num={2}
                icon={Heart}
                iconColor="#C26B6B"
                label="Heartbeat"
                body="Scans @Market Research every 15 min"
                delay="2900ms"
              />

              {/* (3) Jobs */}
              <Callout
                num={3}
                icon={Calendar}
                iconColor="#8B7FB5"
                label="Jobs"
                body="Mon 9:00 · Weekly competitor digest"
                delay="3300ms"
              />
            </div>
          </div>
        </MockupSidebar>
      </div>

      {/* Copy */}
      <div className="flex flex-col gap-5 max-w-lg">
        <span
          className="inline-block w-fit rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.18em] opacity-0"
          style={{
            color: P.accent,
            background: P.accentBg,
            border: `1px solid ${P.borderDark}`,
            animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
            animationDelay: "60ms",
          }}
        >
          02 &middot; AGENTS
        </span>
        <h2
          className="font-logo text-4xl italic tracking-tight opacity-0 lg:text-5xl"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.5s ease-out forwards",
            animationDelay: "180ms",
          }}
        >
          Your <span style={{ color: P.accent }}>AI team</span>.
        </h2>
        <p
          className="font-body-serif text-base leading-relaxed opacity-0 lg:text-lg"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.5s ease-out forwards",
            animationDelay: "320ms",
          }}
        >
          Each agent has a <span className="font-medium" style={{ color: P.text }}>persona</span>, its own{" "}
          <span className="font-medium" style={{ color: P.text }}>schedule</span>, and a{" "}
          <span className="font-medium" style={{ color: P.text }}>memory</span>. Your AI agents get the work done, 24/7. Go be human — they&apos;ll handle the rest.
        </p>
      </div>
    </div>
  );
}

function Callout({
  num,
  icon: Icon,
  iconColor,
  label,
  body,
  delay,
}: {
  num: number;
  icon: typeof Brain;
  iconColor: string;
  label: string;
  body: string;
  delay: string;
}) {
  return (
    <div
      className="flex gap-2 opacity-0"
      style={{
        animation: "cabinet-tour-callout-in 0.4s ease-out forwards",
        animationDelay: delay,
      }}
    >
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
        style={{
          color: P.accent,
          background: P.accentBg,
          border: `1px solid ${P.borderDark}`,
        }}
      >
        {num}
      </div>
      <div className="flex-1">
        <div
          className="flex items-center gap-1.5 text-[10px] font-semibold"
          style={{ color: P.text }}
        >
          <Icon className="h-3 w-3" style={{ color: iconColor }} />
          {label}
        </div>
        <p
          className="mt-0.5 text-[10px] leading-snug"
          style={{ color: P.textSecondary }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}
