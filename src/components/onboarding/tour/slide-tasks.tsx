"use client";

import { ArrowRight, Music, AtSign } from "lucide-react";
import { Trans } from "react-i18next";
import { MockupSidebar } from "./mockup-sidebar";
import { TOUR_PALETTE as P } from "./palette";
import { useLocale } from "@/i18n/use-locale";

// English song titles — intentional creative content for the demo, not
// translated. They feel like song titles in any locale because they're
// poetic English phrases.
const SONG_TITLES = [
  "Neon Dreams",
  "Paper Moons",
  "Cassette",
  "Slow Burn",
  "Overgrown",
  "Salt & Smoke",
  "Late Bloom",
  "Low Tide",
  "Signal Lost",
  "Halfway Home",
];

export function SlideTasks() {
  const { t } = useLocale();
  const TYPED_COMMAND = t("slideTasks:typedCommand");
  return (
    <div className="flex h-full flex-col items-center gap-6 md:grid md:grid-cols-[minmax(360px,420px)_1fr] md:gap-10 md:items-center lg:gap-14">
      <div className="order-2 h-[420px] w-full max-w-[320px] md:order-1 md:h-[440px] md:max-w-none">
        <MockupSidebar activeTab="tasks" viewTransitionName="cabinet-card">
          <div className="flex h-full flex-col gap-2 px-2 py-2">
            {/* Composer */}
            <div
              className="opacity-0 rounded-lg px-2.5 py-2"
              style={{
                background: P.bgCard,
                border: `1px solid ${P.border}`,
                boxShadow: "0 1px 2px rgba(59,47,47,0.06)",
                animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                animationDelay: "200ms",
              }}
            >
              <div className="flex items-center gap-1.5">
                <div className="flex-1 overflow-hidden">
                  <div
                    className="relative whitespace-nowrap text-[13px] overflow-hidden"
                    style={{
                      color: P.text,
                      animation: "cabinet-tour-typing 1.6s steps(40, end) forwards",
                      animationDelay: "600ms",
                      width: 0,
                    }}
                  >
                    {TYPED_COMMAND.split(/(@\w+\/?)/).map((part, i) =>
                      part.startsWith("@") ? (
                        <span
                          key={i}
                          className="font-mono font-semibold"
                          style={{ color: P.accent }}
                        >
                          {part}
                        </span>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                    <span
                      className="ml-0.5 inline-block h-3 w-[1.5px] translate-y-[2px]"
                      style={{
                        background: P.text,
                        animation: "cabinet-tour-caret-blink 0.9s step-end infinite",
                      }}
                    />
                  </div>
                </div>
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-0"
                  style={{
                    background: P.accentBg,
                    color: P.accent,
                    animation: "cabinet-tour-pop-in 0.3s ease-out forwards",
                    animationDelay: "2300ms",
                  }}
                >
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            </div>

            {/* Fan-out grid */}
            <div className="grid flex-1 grid-cols-2 gap-1.5 overflow-hidden">
              {SONG_TITLES.map((title, i) => (
                <div
                  key={title}
                  className="opacity-0 flex flex-col gap-1 rounded-md px-1.5 py-1.5"
                  style={{
                    background: P.bgCard,
                    border: `1px solid ${P.border}`,
                    animation: "cabinet-tour-pop-in 0.35s ease-out forwards",
                    animationDelay: `${2500 + i * 60}ms`,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Music
                      className="h-2.5 w-2.5 shrink-0"
                      style={{ color: "#D08BA6" }}
                    />
                    <span
                      className="truncate text-[9px] font-medium"
                      style={{ color: P.text }}
                    >
                      {title}
                    </span>
                    <span className="ml-auto relative flex h-1 w-1 shrink-0">
                      <span
                        className="absolute inline-flex h-full w-full rounded-full"
                        style={{
                          background: "#5A9E7B",
                          animation:
                            "cabinet-tour-heartbeat-dot 1.2s ease-in-out infinite",
                          animationDelay: `${i * 80}ms`,
                        }}
                      />
                      <span
                        className="relative inline-flex h-1 w-1 rounded-full"
                        style={{ background: "#4A8E6B" }}
                      />
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="h-0.5 rounded-full"
                      style={{
                        background: "rgba(59,47,47,0.18)",
                        animation: "cabinet-tour-stream-bar 1.4s ease-out forwards",
                        animationDelay: `${2900 + i * 80}ms`,
                        width: 0,
                      }}
                    />
                    <span
                      className="h-0.5 rounded-full"
                      style={{
                        background: "rgba(59,47,47,0.12)",
                        animation: "cabinet-tour-stream-bar 1.6s ease-out forwards",
                        animationDelay: `${3100 + i * 80}ms`,
                        width: 0,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Footer destination pill */}
            <div
              className="opacity-0 flex items-center justify-center gap-1 rounded-full py-1 text-[9px]"
              style={{
                color: P.textSecondary,
                background: P.paperWarm,
                border: `1px solid ${P.borderLight}`,
                animation: "cabinet-tour-fade-up 0.4s ease-out forwards",
                animationDelay: "3800ms",
              }}
            >
              <AtSign className="h-2.5 w-2.5" style={{ color: P.accent }} />
              <span>{t("tour:savingTo")}</span>
              <span className="font-mono font-semibold" style={{ color: P.text }}>
                {t("slideTasks:savingFolder")}
              </span>
            </div>
          </div>
        </MockupSidebar>
      </div>

      {/* Copy */}
      <div className="order-1 flex flex-col items-center gap-3 max-w-lg text-center md:order-2 md:items-start md:gap-5 md:text-start">
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
          {t("slideTasks:slideNum")}
        </span>
        <h2
          className="font-logo text-3xl italic tracking-tight opacity-0 md:text-4xl lg:text-5xl"
          style={{
            color: P.text,
            animation: "cabinet-tour-fade-up 0.5s ease-out forwards",
            animationDelay: "180ms",
          }}
        >
          <Trans
            i18nKey="slideTasks:headlineSentence"
            components={{ accent: <span style={{ color: P.accent }} /> }}
          />
        </h2>
        <p
          className="font-body-serif text-base leading-relaxed opacity-0 lg:text-lg"
          style={{
            color: P.textSecondary,
            animation: "cabinet-tour-fade-up 0.5s ease-out forwards",
            animationDelay: "320ms",
          }}
        >
          {t("slideTasks:paragraphPrefix")}
          <span className="font-mono" style={{ color: P.accent }}>@</span>
          {t("slideTasks:paragraphSuffix")}
        </p>
      </div>
    </div>
  );
}
