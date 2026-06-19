"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Mail,
  CheckCircle,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GmailStatus {
  connected: boolean;
  email: string | null;
  method: "imap" | null;
  lastIndexed: string | null;
}

export function GmailSection() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status", { cache: "no-store" });
      const data = await res.json() as GmailStatus;
      setStatus(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    setError(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/gmail/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Connection failed (${res.status})`);
        return;
      }
      setEmail("");
      setPassword("");
      await loadStatus();
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "success", message: `Gmail connected as ${email}` },
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch("/api/gmail/disconnect", { method: "DELETE" });
      await loadStatus();
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "info", message: "Gmail disconnected" },
        })
      );
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Gmail connection&hellip;
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[14px] font-semibold mb-1">Gmail</h3>
        <p className="text-[12px] text-muted-foreground">
          Connect Gmail via IMAP so agents can read, search, and summarize your inbox. Sending always requires your approval.
        </p>
      </div>

      {status?.connected ? (
        /* Connected state */
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            <div className="text-[12px]">
              <div className="font-medium text-emerald-700 dark:text-emerald-400">
                Connected via IMAP
              </div>
              <div className="text-muted-foreground mt-0.5">{status.email}</div>
              {status.lastIndexed && (
                <div className="text-muted-foreground/70 mt-0.5 text-[11px]">
                  Last indexed: {new Date(status.lastIndexed).toLocaleString()}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-[12px] text-destructive hover:text-destructive"
            disabled={disconnecting}
            onClick={handleDisconnect}
          >
            {disconnecting ? (
              <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 me-1.5" />
            )}
            Disconnect Gmail
          </Button>
        </div>
      ) : (
        /* Not connected state */
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-[12px] font-medium" htmlFor="gmail-email">
              Gmail address
            </label>
            <Input
              id="gmail-email"
              type="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-8 text-[12px]"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[12px] font-medium" htmlFor="gmail-password">
              App Password
            </label>
            <Input
              id="gmail-password"
              type="password"
              placeholder="xxxx xxxx xxxx xxxx"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-8 text-[12px] font-mono"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-[12px] text-destructive">{error}</p>
          )}

          {/* Instructions toggle */}
          <button
            type="button"
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setInstructionsOpen((v) => !v)}
          >
            <Mail className="h-3.5 w-3.5" />
            How to get an App Password
            {instructionsOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {instructionsOpen && (
            <div className="rounded-md border border-border bg-muted/20 px-3.5 py-3 text-[12px] space-y-1.5">
              <p className="text-muted-foreground">
                App Passwords require 2-Step Verification to be enabled on your Google account.
              </p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>
                  Go to{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-0.5"
                    onClick={() =>
                      window.open("https://myaccount.google.com/security", "_blank")
                    }
                  >
                    myaccount.google.com/security
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                </li>
                <li>Under &ldquo;How you sign in to Google&rdquo;, open 2-Step Verification</li>
                <li>Scroll to the bottom &rarr; App passwords</li>
                <li>Select app: Mail, device: Other &rarr; name it &ldquo;Cabinet&rdquo;</li>
                <li>Copy the 16-character password and paste it above</li>
              </ol>
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] mt-1"
                onClick={() =>
                  window.open(
                    "https://myaccount.google.com/apppasswords",
                    "_blank"
                  )
                }
              >
                <ExternalLink className="h-3 w-3 me-1.5" />
                Open App Passwords page
              </Button>
            </div>
          )}

          <Button
            size="sm"
            className="text-[12px]"
            disabled={connecting || !email || !password}
            onClick={handleConnect}
          >
            {connecting ? (
              <Loader2 className="h-3.5 w-3.5 me-1.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5 me-1.5" />
            )}
            Connect
          </Button>
        </div>
      )}

      {/* OAuth coming soon */}
      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2.5 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground/70">Prefer not to create an App Password?</span>{" "}
        OAuth sign-in is coming soon — connect with your Google account directly.
      </div>
    </div>
  );
}
