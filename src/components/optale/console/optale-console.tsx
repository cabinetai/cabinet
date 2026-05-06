"use client";

import { useEffect, useState } from "react";
import type { OptaleIdentitySnapshot } from "@/lib/optale/identity-shared";
import { CONSOLE_MODULES } from "./console-config";
import { ConsoleModuleSurface } from "./module-surfaces";
import {
  ConsoleHeader,
  ConsoleSidebar,
  SubpageStrip,
  WorkspaceStatusBar,
  WorkspaceTerminalPanel,
} from "./shell-chrome";
import { SettingsModal } from "./settings-modal";
import type {
  ConsoleModuleId,
  WorkspaceTerminalPosition,
} from "./types";

type DesktopRuntime = {
  runtime?: string;
  platform?: string;
  startMode?: string;
  cloudOrigin?: string;
  profile?: string;
  mode?: string;
};

export function OptaleConsole({
  initialModule = "command",
}: {
  initialModule?: ConsoleModuleId;
}) {
  const [activeModule, setActiveModule] =
    useState<ConsoleModuleId>(initialModule);
  const [subpages, setSubpages] = useState<Record<ConsoleModuleId, string>>({
    command: "Home",
    objects: "Registry",
    agents: "Mission Control",
    brain: "Knowledge base",
    observatory: "Approval",
  });
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalPosition, setTerminalPosition] =
    useState<WorkspaceTerminalPosition>("bottom");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [identity, setIdentity] = useState<OptaleIdentitySnapshot | null>(null);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntime | null>(
    null
  );

  const activeSubpage = subpages[activeModule];
  const activeModuleDef = CONSOLE_MODULES.find(
    (module) => module.id === activeModule
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/optale/identity", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { identity?: OptaleIdentitySnapshot } | null) => {
        if (payload?.identity) setIdentity(payload.identity);
      })
      .catch(() => {
        if (!controller.signal.aborted) setIdentity(null);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const desktop = (
      window as typeof window & {
        CabinetDesktop?: {
          getRuntime?: () => Promise<DesktopRuntime>;
          startMode?: string;
          cloudOrigin?: string | null;
        };
      }
    ).CabinetDesktop;

    if (!desktop) return;
    if (typeof desktop.getRuntime === "function") {
      void desktop.getRuntime().then(setDesktopRuntime).catch(() => {
        queueMicrotask(() => {
          setDesktopRuntime({
            runtime: "electron",
            startMode: desktop.startMode || "local",
            cloudOrigin: desktop.cloudOrigin || undefined,
          });
        });
      });
      return;
    }
    queueMicrotask(() => {
      setDesktopRuntime({
        runtime: "electron",
        startMode: desktop.startMode || "local",
        cloudOrigin: desktop.cloudOrigin || undefined,
      });
    });
  }, []);

  function handleSubpageChange(nextSubpage: string) {
    setSubpages((current) => ({
      ...current,
      [activeModule]: nextSubpage,
    }));
  }

  return (
    <main className="min-h-screen bg-[#0e1015] text-[#ebe9df]">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <ConsoleSidebar
          activeModule={activeModule}
          onModuleChange={setActiveModule}
          identity={identity}
        />

        <section className="flex min-w-0 flex-1 flex-col border-t border-white/10 bg-[#111318] lg:border-l lg:border-t-0">
          <ConsoleHeader
            moduleLabel={activeModuleDef?.label ?? "Command"}
            subpage={activeSubpage}
            identity={identity}
          />
          <SubpageStrip
            moduleId={activeModule}
            activeSubpage={activeSubpage}
            onSubpageChange={handleSubpageChange}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ConsoleModuleSurface
                moduleId={activeModule}
                subpage={activeSubpage}
                identity={identity}
              />
            </div>
            {terminalOpen && terminalPosition === "right" ? (
              <WorkspaceTerminalPanel
                position="right"
                onClose={() => setTerminalOpen(false)}
              />
            ) : null}
          </div>

          {terminalOpen && terminalPosition === "bottom" ? (
            <WorkspaceTerminalPanel
              position="bottom"
              onClose={() => setTerminalOpen(false)}
            />
          ) : null}

          <WorkspaceStatusBar
            desktopRuntime={desktopRuntime}
            terminalOpen={terminalOpen}
            terminalPosition={terminalPosition}
            onTerminalToggle={() => setTerminalOpen((value) => !value)}
            onPositionToggle={() =>
              setTerminalPosition((value) =>
                value === "bottom" ? "right" : "bottom"
              )
            }
            onSettingsOpen={() => setSettingsOpen(true)}
          />
        </section>
      </div>

      {settingsOpen ? (
        <SettingsModal
          identity={identity}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}
