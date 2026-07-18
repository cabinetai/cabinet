"use client";

import { useEffect, useState, useCallback } from "react";
import { Mail, CheckCircle, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GmailAccount {
  email: string;
  needsReconnect: boolean;
  lastIndexed: string | null;
}

interface GmailStatus {
  connected: boolean;
  needsReconnect?: boolean;
  email: string | null;
  method: "imap" | null;
  lastIndexed: string | null;
  accounts?: GmailAccount[];
}

export function GmailSection() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  const accounts = status?.accounts ?? [];
  const showForm = accounts.length === 0 || adding;

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
      setAdding(false);
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

  const handleDisconnect = async (account: string) => {
    setDisconnecting(account);
    try {
      await fetch(`/api/gmail/disconnect?account=${encodeURIComponent(account)}`, {
        method: "DELETE",
      });
      await loadStatus();
      window.dispatchEvent(
        new CustomEvent("cabinet:toast", {
          detail: { kind: "info", message: `Disconnected ${account}` },
        })
      );
    } finally {
      setDisconnecting(null);
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
          Connect one or more Gmail accounts via IMAP so agents can read, search, and summarize your inbox. Sending always requires your approval.
        </p>
      </div>

      {accounts.length > 0 && (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.email}
              className={
                account.needsReconnect
                  ? "flex items-start justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5"
                  : "flex items-start justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5"
              }
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <CheckCircle
                  className={
                    account.needsReconnect
                      ? "h-4 w-4 text-amber-500 mt-0.5 shrink-0"
                      : "h-4 w-4 text-emerald-500 mt-0.5 shrink-0"
                  }
                />
                <div className="text-[12px] min-w-0">
                  <div className="truncate font-medium">{account.email}</div>
                  {account.needsReconnect ? (
                    <div className="text-amber-700 dark:text-amber-300 mt-0.5">
                      Reconnect needed — Cabinet can no longer read the saved App
                      Password (its encryption key changed).{" "}
                      <button
                        type="button"
                        className="underline underline-offset-2"
                        onClick={() => {
                          setEmail(account.email);
                          setAdding(true);
                        }}
                      >
                        Re-enter it
                      </button>
                    </div>
                  ) : account.lastIndexed ? (
                    <div className="text-muted-foreground/70 mt-0.5 text-[11px]">
                      Last indexed: {new Date(account.lastIndexed).toLocaleString()}
                    </div>
                  ) : (
                    <div className="text-muted-foreground mt-0.5 text-[11px]">Connected via IMAP</div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive shrink-0"
                disabled={disconnecting === account.email}
                onClick={() => handleDisconnect(account.email)}
              >
                {disconnecting === account.email ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}

          {!showForm && (
            <Button
              variant="outline"
              size="sm"
              className="text-[12px]"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5 me-1.5" />
              Add another account
            </Button>
          )}
        </div>
      )}

      {showForm && (
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

          <div className="flex items-center gap-2">
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
            {accounts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[12px]"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {/* OAuth coming soon */}
      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2.5 text-[12px] text-muted-foreground">
        <span className="font-medium text-foreground/70">Prefer not to create an App Password?</span>{" "}
        OAuth sign-in is coming soon: connect with your Google account directly.
      </div>
    </div>
  );
}
