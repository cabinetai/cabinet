"use client";

import { useEffect, useRef, useState } from "react";

interface WebTerminalProps {
  sessionId?: string;
  prompt?: string;
  displayPrompt?: string;
  reconnect?: boolean; // If true, connect without sending prompt (session already exists on server)
  themeSurface?: "terminal" | "page";
  providerId?: string;
  adapterType?: string;
  cwd?: string; // DATA_DIR-relative working directory for shell sessions
  onClose: () => void;
}

interface DaemonAuthPayload {
  token: string;
  wsOrigin?: string;
}

function readRootVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getTerminalTheme(themeSurface: "terminal" | "page" = "terminal") {
  const backgroundVar = themeSurface === "page" ? "--background" : "--terminal-bg";
  const foregroundVar = themeSurface === "page" ? "--foreground" : "--terminal-fg";
  const background = readRootVar(backgroundVar, "#0a0a0a");
  const foreground = readRootVar(foregroundVar, "#e5e5e5");

  return {
    background,
    foreground,
    cursor: readRootVar("--terminal-cursor", foreground),
    cursorAccent: background,
    selectionBackground: readRootVar("--terminal-selection", "#ffffff30"),
    selectionForeground: foreground,
    black: readRootVar("--terminal-ansi-black", "#1a1a2e"),
    red: readRootVar("--terminal-ansi-red", "#ff6b6b"),
    green: readRootVar("--terminal-ansi-green", "#51cf66"),
    yellow: readRootVar("--terminal-ansi-yellow", "#ffd43b"),
    blue: readRootVar("--terminal-ansi-blue", "#74c0fc"),
    magenta: readRootVar("--terminal-ansi-magenta", "#cc5de8"),
    cyan: readRootVar("--terminal-ansi-cyan", "#66d9e8"),
    white: readRootVar("--terminal-ansi-white", foreground),
    brightBlack: readRootVar("--terminal-ansi-bright-black", "#555570"),
    brightRed: readRootVar("--terminal-ansi-bright-red", "#ff8787"),
    brightGreen: readRootVar("--terminal-ansi-bright-green", "#69db7c"),
    brightYellow: readRootVar("--terminal-ansi-bright-yellow", "#ffe066"),
    brightBlue: readRootVar("--terminal-ansi-bright-blue", "#91d5ff"),
    brightMagenta: readRootVar("--terminal-ansi-bright-magenta", "#da77f2"),
    brightCyan: readRootVar("--terminal-ansi-bright-cyan", "#99e9f2"),
    brightWhite: readRootVar("--terminal-ansi-bright-white", "#ffffff"),
  };
}

function replacePastedTextNotice(output: string, displayPrompt?: string): string {
  if (!displayPrompt) return output;
  return output.replace(/\[Pasted text #\d+(?: \+\d+ lines)?\]/g, displayPrompt);
}

export function WebTerminal({
  sessionId,
  prompt,
  displayPrompt,
  providerId,
  adapterType,
  cwd,
  reconnect,
  themeSurface = "terminal",
  onClose,
}: WebTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;
    let statusPollHandle: ReturnType<typeof setInterval> | null = null;
    let disposed = false;
    let sessionFinished = false;
    let terminalReady = false;
    let wsOpen = false;
    const pendingWrites: Array<string | Uint8Array> = [];

    // Route every terminal write through here so bytes that arrive before
    // the xterm chunk finishes compiling (dev mode: can be multi-second) are
    // buffered and replayed in order once the terminal mounts. Empty chunks
    // are dropped — xterm's VT parser treats zero-length input as a parse
    // error (non-fatal but produces console noise).
    const safeWrite = (chunk: string | Uint8Array) => {
      if (!chunk || chunk.length === 0) return;
      if (typeof chunk === "string") terminal!.write(chunk);
      else terminal!.write(chunk);
    };
    const writeToTerminal = (chunk: string | Uint8Array) => {
      if (disposed) return;
      if (!chunk || chunk.length === 0) return;
      if (terminalReady && terminal) {
        safeWrite(chunk);
      } else {
        pendingWrites.push(chunk);
      }
    };

    const flushPending = () => {
      if (!terminal) return;
      for (const chunk of pendingWrites) {
        safeWrite(chunk);
      }
      pendingWrites.length = 0;
    };

    const finishSession = (closeSocket = false) => {
      if (disposed || sessionFinished) return;
      sessionFinished = true;
      if (statusPollHandle) {
        clearInterval(statusPollHandle);
        statusPollHandle = null;
      }
      writeToTerminal("\r\n\x1b[90m[Session ended]\x1b[0m\r\n");
      if (closeSocket && ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      onCloseRef.current?.();
    };

    // ----- Chain A: connection (auth + WebSocket). Fires immediately. -----
    const startConnection = async () => {
      const id = sessionId || `session-${Date.now()}`;
      try {
        const authResponse = await fetch("/api/daemon/auth");
        if (!authResponse.ok) {
          throw new Error(`Auth failed (${authResponse.status})`);
        }
        const auth = (await authResponse.json()) as DaemonAuthPayload;
        if (disposed) return;

        const params = new URLSearchParams({ id, token: auth.token });
        if (prompt && !reconnect) params.set("prompt", prompt);
        if (providerId && !reconnect) params.set("providerId", providerId);
        if (adapterType && !reconnect) params.set("adapterType", adapterType);
        if (cwd && !reconnect) params.set("cwd", cwd);
        if (reconnect) params.set("reconnect", "1");

        const wsOrigin =
          auth.wsOrigin ||
          (window.location.protocol === "https:"
            ? `wss://${window.location.host}`
            : `ws://${window.location.host}`);
        const wsUrl = `${wsOrigin}/api/daemon/pty?${params.toString()}`;

        ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          if (disposed) return;
          setError(null);
          wsOpen = true;
          // Only send resize if xterm is already alive — otherwise startTerminal
          // will send one itself once the fit addon has real dimensions.
          if (terminal && ws) {
            ws.send(
              JSON.stringify({
                type: "resize",
                cols: terminal.cols,
                rows: terminal.rows,
              })
            );
          }
        };

        ws.onmessage = (event) => {
          if (disposed) return;
          const data = event.data;
          if (data instanceof ArrayBuffer) {
            if (data.byteLength === 0) return;
            writeToTerminal(new Uint8Array(data));
          } else if (typeof data === "string") {
            if (data.length === 0) return;
            writeToTerminal(replacePastedTextNotice(data, displayPrompt));
          }
          // Silently skip other types (Blob etc.) — binaryType is set to
          // "arraybuffer" so we never expect them.
        };

        ws.onerror = () => {
          if (disposed) return;
          setError("Connection failed. Is the daemon running?");
          writeToTerminal(
            "\r\n\x1b[31mConnection error.\x1b[0m Run \x1b[33mnpm run dev:all\x1b[0m to start Cabinet locally.\r\n"
          );
        };

        ws.onclose = () => {
          if (disposed) return;
          finishSession(false);
        };

        statusPollHandle = setInterval(() => {
          if (disposed || sessionFinished) return;
          void (async () => {
            try {
              const response = await fetch(`/api/daemon/session/${id}/output`);
              if (!response.ok) return;
              const data = (await response.json()) as { status?: string };
              if (data.status && data.status !== "running") {
                finishSession(true);
              }
            } catch {
              // Ignore transient polling failures; the socket remains the primary signal.
            }
          })();
        }, 3000);
      } catch {
        if (disposed) return;
        setError("Connection failed. Is the daemon running?");
        writeToTerminal(
          "\r\n\x1b[31mConnection error.\x1b[0m Run \x1b[33mnpm run dev:all\x1b[0m to start Cabinet locally.\r\n"
        );
      }
    };

    // ----- Chain B: xterm construction. Fires immediately. -----
    const startTerminal = async () => {
      const { Terminal } = await import(
        /* webpackPrefetch: true */ "@xterm/xterm"
      );
      const { FitAddon } = await import(
        /* webpackPrefetch: true */ "@xterm/addon-fit"
      );
      const { WebLinksAddon } = await import(
        /* webpackPrefetch: true */ "@xterm/addon-web-links"
      );
      const { Unicode11Addon } = await import(
        /* webpackPrefetch: true */ "@xterm/addon-unicode11"
      );
      await import(/* webpackPrefetch: true */ "@xterm/xterm/css/xterm.css");

      if (disposed) return;

      terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontSize: 13,
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
        lineHeight: 1.2,
        letterSpacing: 0,
        theme: getTerminalTheme(themeSurface),
        scrollback: 10000,
        allowProposedApi: true,
        convertEol: false,
        altClickMovesCursor: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 1,
        // xterm logs "Parsing error: <state>" at `error` level whenever the
        // VT parser recovers from an unknown escape sequence — non-fatal,
        // but some CLIs (codex, claude-code) emit enough of these during
        // status updates to spam the console. `off` silences the logger
        // entirely; the parser still recovers the same way, we just stop
        // narrating it to the user.
        logLevel: "off",
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      fitAddonRef.current = fitAddon;

      // Enable clickable links in output
      terminal.loadAddon(new WebLinksAddon());

      // Enable Unicode 11 for better emoji/icon rendering
      const unicode11Addon = new Unicode11Addon();
      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = "11";

      xtermRef.current = terminal;

      if (!termRef.current) return;

      const applyTheme = () => {
        if (!terminal) return;
        const nextTheme = getTerminalTheme(themeSurface);
        terminal.options.theme = nextTheme;
        termRef.current?.style.setProperty("background-color", nextTheme.background);
        termRef.current?.style.setProperty("color", nextTheme.foreground);
      };

      applyTheme();
      terminal.open(termRef.current);
      applyTheme();

      themeObserver = new MutationObserver(() => {
        requestAnimationFrame(() => {
          if (!disposed) {
            applyTheme();
          }
        });
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-custom-theme"],
      });

      // First fit + flush of anything that already arrived over the socket.
      requestAnimationFrame(() => {
        if (disposed || !terminal) return;
        fitAddon.fit();

        // Pipe buffered bytes before marking the terminal "ready" — otherwise
        // a race between the onmessage arriving and flushPending iterating can
        // interleave lines.
        flushPending();
        terminalReady = true;

        // Terminal is live. If the WS is already open, send a resize now —
        // the onopen handler skipped this because xterm wasn't ready yet.
        if (wsOpen && ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }

        // Wire input only after the terminal is alive.
        terminal.onData((data) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Handle container resize.
        resizeObserver = new ResizeObserver(() => {
          if (disposed) return;
          requestAnimationFrame(() => {
            if (disposed || !terminal) return;
            fitAddon.fit();
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "resize",
                  cols: terminal.cols,
                  rows: terminal.rows,
                })
              );
            }
          });
        });
        if (termRef.current) resizeObserver.observe(termRef.current);
      });
    };

    void startConnection();
    void startTerminal();

    return () => {
      disposed = true;
      if (statusPollHandle) {
        clearInterval(statusPollHandle);
      }
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      ws?.close();
      terminal?.dispose();
      pendingWrites.length = 0;
      wsRef.current = null;
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, prompt, displayPrompt, providerId, adapterType, cwd, reconnect, themeSurface]);

  const surfaceBackground = themeSurface === "page" ? "var(--background)" : "var(--terminal-bg)";
  const surfaceForeground = themeSurface === "page" ? "var(--foreground)" : "var(--terminal-fg)";

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: surfaceBackground,
        color: surfaceForeground,
      }}
    >
      {error && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-destructive/90 text-destructive-foreground text-xs rounded-md">
          {error}
        </div>
      )}
      <div
        ref={termRef}
        className="h-full w-full overflow-hidden"
        style={{ padding: "4px 8px" }}
      />
    </div>
  );
}
