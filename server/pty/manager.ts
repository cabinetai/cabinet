import * as pty from "node-pty";
import { WebSocket } from "ws";
import { readCabinetEnvFile } from "../../src/lib/runtime/cabinet-env";
import {
  getOneShotLaunchSpec,
  getSessionLaunchSpec,
  resolveProviderId,
} from "../../src/lib/agents/provider-runtime";
import { resolveLegacyExecutionProviderId } from "../../src/lib/agents/adapters";
import { createClaudeStreamAccumulator } from "../../src/lib/agents/adapters/claude-stream";
import { stripAnsi } from "./ansi";
import {
  claudePromptReady,
  clearClaudeCompletionTimer,
  consumeStructuredOutput,
  flushStructuredOutput,
  maybeAutoExitClaudeSession,
  submitInitialPrompt,
} from "./claude-lifecycle";
import type { BaseSession, CompletedOutputEntry, PtySession } from "./types";

/**
 * Shared session map type the manager uses. The daemon's map is
 * `Map<string, ActiveSession>` (PtySession | StructuredSession); because
 * Map is invariant, that isn't assignable to `Map<string, PtySession>`.
 * Typing it as `Map<string, BaseSession>` lets both sides share the same
 * underlying instance — the manager only sets PtySession values itself,
 * and narrows via `.kind === "pty"` on read.
 */
export interface PtyManagerDeps {
  sessions: Map<string, BaseSession>;
  completedOutput: Map<string, CompletedOutputEntry>;
  /**
   * Callbacks accept `PtySession` rather than `BaseSession` so the daemon's
   * `ActiveSession`-accepting versions are assignable via function
   * parameter contravariance (a function that handles any ActiveSession
   * can safely be called with a PtySession).
   */
  finalizeSessionConversation: (session: PtySession) => Promise<void>;
  /** Emits output to the shared output-buffer + WS client + onData hook. */
  emitSessionOutput: (
    session: PtySession,
    chunk: string,
    onData?: (chunk: string) => void
  ) => void;
  clearSessionStopFallbackTimer: (session: PtySession) => void;
  resolveSessionCwd: (input?: string) => string;
  /** PATH the PTY subprocess should inherit (homebrew/nvm/~/.local/bin). */
  enrichedPath: string;
}

export interface SpawnPtyInput {
  sessionId: string;
  providerId?: string;
  adapterType?: string;
  adapterConfig?: Record<string, unknown>;
  prompt?: string;
  cwd?: string;
  timeoutSeconds?: number;
  onData?: (chunk: string) => void;
  launchMode?: "session" | "one-shot";
  /**
   * Provider-specific session id captured from a prior terminal-mode PTY
   * run. Threaded into the launch spec so the CLI resumes the old session
   * (e.g. `claude --resume <id>`, `opencode --session <id>`) instead of
   * starting fresh. Absent on first turns.
   */
  adapterResumeId?: string | null;
  /**
   * Trigger from the originating ConversationMeta. Only `"manual"` opts
   * out of the claude auto-exit grace; other triggers keep the existing
   * 1.2s idle-then-close behavior so scheduled jobs/heartbeats don't
   * accumulate live PTY processes.
   */
  trigger?: import("../../src/types/tasks").TaskTrigger;
}

export interface PtyManager {
  spawn(input: SpawnPtyInput): PtySession;
  writeInput(
    sessionId: string,
    rawInput: string,
    options?: { appendEnter?: boolean }
  ): { ok: true } | { ok: false; reason: "not_found" | "not_pty" | "exited" };
}

export function createPtyManager(deps: PtyManagerDeps): PtyManager {
  function spawn(input: SpawnPtyInput): PtySession {
    const cwd = deps.resolveSessionCwd(input.cwd);
    const isShell = input.adapterType === "shell";
    const executionProviderId = isShell ? "shell" : resolveLegacyExecutionProviderId({
      adapterType: input.adapterType,
      providerId: input.providerId,
    });
    const resumeId =
      typeof input.adapterResumeId === "string" && input.adapterResumeId.trim()
        ? input.adapterResumeId.trim()
        : undefined;
    let launch = isShell
      ? { command: process.env.SHELL || "/bin/zsh", args: [] as string[], initialPrompt: undefined, readyStrategy: undefined }
      : input.launchMode === "one-shot" && input.prompt?.trim()
        ? getOneShotLaunchSpec({
            providerId: executionProviderId,
            prompt: input.prompt,
            workdir: cwd,
            resumeId,
          })
        : getSessionLaunchSpec({
            providerId: executionProviderId,
            prompt: input.prompt,
            workdir: cwd,
            resumeId,
          });
    const resolvedProviderId = isShell ? "shell" : resolveProviderId(executionProviderId);

    if (
      input.launchMode === "one-shot" &&
      resolvedProviderId === "claude-code"
    ) {
      const nextArgs: string[] = [];
      for (let index = 0; index < launch.args.length; index += 1) {
        const arg = launch.args[index];
        if (arg === "--output-format") {
          index += 1;
          continue;
        }
        if (arg === "text" && launch.args[index - 1] === "--output-format") {
          continue;
        }
        nextArgs.push(arg);
      }

      nextArgs.push(
        "--verbose",
        "--output-format",
        "stream-json",
        "--include-partial-messages"
      );
      launch = {
        ...launch,
        args: nextArgs,
      };
    }

    // Merge `.cabinet.env` values at spawn time so PTY runs see API keys
    // edited via the UI without a daemon restart. mtime-cached; cheap.
    // process.env wins over file values (shell-supplied keys debug-override).
    const cabinetEnvValues = readCabinetEnvFile().values;
    const term = pty.spawn(launch.command, launch.args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...cabinetEnvValues,
        ...(process.env as Record<string, string>),
        PATH: deps.enrichedPath,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
        LANG: "en_US.UTF-8",
        // Audit #060/#125: agent CLIs occasionally spawn sub-shells (zsh,
        // bash) for git/node operations. If the user has echoes in their
        // ~/.zshenv (or BASH_ENV-sourced files), the noise lands in the
        // PTY stream and shows up as the first agent message. Pointing
        // ZDOTDIR at /dev/null makes zsh skip .zshenv/.zshrc/.zlogin;
        // clearing BASH_ENV prevents non-interactive bash from sourcing
        // anything analogous. Neither affects the agent CLI itself —
        // these only matter if the CLI shells out. Skip for plain shell
        // sessions so the user's dotfiles load normally.
        ...(!isShell ? { ZDOTDIR: "/dev/null", BASH_ENV: "" } : {}),
      },
    });

    const session: PtySession = {
      id: input.sessionId,
      kind: "pty",
      providerId: resolvedProviderId,
      adapterType: input.adapterType,
      trigger: input.trigger,
      pty: term,
      ws: null,
      createdAt: new Date(),
      output: [],
      exited: false,
      exitCode: null,
      stop: (signal = "SIGTERM") => {
        try {
          term.kill(signal);
        } catch {}
      },
      initialPrompt: launch.initialPrompt?.trim() || undefined,
      initialPromptSent: false,
      promptSubmittedOutputLength: 0,
      autoExitRequested: false,
      readyStrategy: launch.readyStrategy,
      outputMode:
        input.launchMode === "one-shot" && resolvedProviderId === "claude-code"
          ? "claude-stream-json"
          : "plain",
      structuredOutput:
        input.launchMode === "one-shot" && resolvedProviderId === "claude-code"
          ? createClaudeStreamAccumulator()
          : undefined,
    };
    deps.sessions.set(input.sessionId, session);

    term.onData((data: string) => {
      const displayChunk = consumeStructuredOutput(session, data);
      if (displayChunk) {
        deps.emitSessionOutput(session, displayChunk, input.onData);
      }
      if (
        session.initialPrompt &&
        !session.initialPromptSent &&
        session.readyStrategy === "claude" &&
        claudePromptReady(session.output.join(""))
      ) {
        submitInitialPrompt(session);
      }
      maybeAutoExitClaudeSession(session, {
        completedOutput: deps.completedOutput,
      });
    });

    term.onExit(({ exitCode }) => {
      console.log(`Session ${input.sessionId} PTY exited with code ${exitCode}`);
      session.exited = true;
      session.exitCode = exitCode;
      deps.clearSessionStopFallbackTimer(session);
      if (session.timeoutHandle) {
        clearTimeout(session.timeoutHandle);
        delete session.timeoutHandle;
      }
      if (session.initialPromptTimer) {
        clearTimeout(session.initialPromptTimer);
        delete session.initialPromptTimer;
      }
      if (session.autoExitFallbackTimer) {
        clearTimeout(session.autoExitFallbackTimer);
        delete session.autoExitFallbackTimer;
      }
      if (session.streamExtractionTimer) {
        clearTimeout(session.streamExtractionTimer);
        delete session.streamExtractionTimer;
      }
      if (session.awaitingInputIdleTimer) {
        clearTimeout(session.awaitingInputIdleTimer);
        delete session.awaitingInputIdleTimer;
      }
      if (session.awaitingInputBusyTimer) {
        clearTimeout(session.awaitingInputBusyTimer);
        delete session.awaitingInputBusyTimer;
      }
      session.awaitingInput = false;
      clearClaudeCompletionTimer(session);

      const trailingDisplay = flushStructuredOutput(session);
      if (trailingDisplay) {
        deps.emitSessionOutput(session, trailingDisplay, input.onData);
      }

      const plain = stripAnsi(session.output.join(""));
      deps.completedOutput.set(input.sessionId, {
        output: plain,
        completedAt: Date.now(),
      });
      void deps.finalizeSessionConversation(session).catch(() => {});

      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        deps.sessions.delete(input.sessionId);
        session.ws.close();
      }
    });

    if (input.timeoutSeconds && input.timeoutSeconds > 0) {
      session.timeoutHandle = setTimeout(() => {
        console.warn(
          `Session ${input.sessionId} timed out after ${input.timeoutSeconds}s`
        );
        try {
          term.kill();
        } catch {}
      }, input.timeoutSeconds * 1000);
    }

    if (session.initialPrompt) {
      session.initialPromptTimer = setTimeout(() => {
        submitInitialPrompt(session);
      }, 1500);
    }

    return session;
  }

  function writeInput(
    sessionId: string,
    rawInput: string,
    options?: { appendEnter?: boolean }
  ): { ok: true } | { ok: false; reason: "not_found" | "not_pty" | "exited" } {
    const session = deps.sessions.get(sessionId);
    if (!session) return { ok: false, reason: "not_found" };
    if (session.kind !== "pty") return { ok: false, reason: "not_pty" };
    if (session.exited) return { ok: false, reason: "exited" };

    const ptySession = session as PtySession;
    ptySession.pty.write(rawInput);
    if (options?.appendEnter !== false) {
      // Same paste-window guard as submitInitialPrompt — Claude's TUI
      // groups rapid input as a paste, and an Enter inside that window
      // becomes part of the paste instead of submitting.
      setTimeout(() => {
        if (!ptySession.exited) ptySession.pty.write("\r");
      }, 600);
    }
    return { ok: true };
  }

  return { spawn, writeInput };
}
