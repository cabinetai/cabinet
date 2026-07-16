"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Link2Off, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/ui/toast";

const BRAND = "#25D366";
const ACCOUNT_ID = "personal";
const POLL_MS = 2000;

interface StatusPayload {
  status?: "not_started" | "connecting" | "pairing" | "open" | "close";
  method?: "qr" | "code";
  code?: string;
  error?: string;
  loggedOut?: boolean;
}

/**
 * WhatsApp connector panel — Settings → Integrations → WhatsApp.
 *
 * Read-only monitor (docs/WHATSAPP_CONNECTOR.md): pairs a single personal
 * account via a Baileys pairing code (no QR scan needed) and polls
 * /api/whatsapp/status until the daemon reports the link is open.
 */
export function WhatsAppSection() {
  const [phone, setPhone] = useState("");
  const [data, setData] = useState<StatusPayload>({ status: "not_started" });
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/status?accountId=${ACCOUNT_ID}`, { cache: "no-store" });
      const json = (await res.json()) as StatusPayload;
      setData(json);
    } catch {
      /* transient; next poll tries again */
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleConnect = async () => {
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 8) {
      showError("Enter your number with country code, digits only.");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID, phone: digits }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setData({ status: "connecting" });
      await fetchStatus();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to start pairing");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: ACCOUNT_ID }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData({ status: "not_started" });
      setPhone("");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  if (data.status === "open") {
    return (
      <div className="flex flex-col items-center gap-2.5 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <div className="text-[14px] font-semibold text-foreground">Connected</div>
        <p className="max-w-[220px] text-[12px] text-muted-foreground">
          Incoming messages are posting to the #whatsapp channel board.
        </p>
        <Button size="sm" variant="outline" className="mt-1" onClick={handleDisconnect} disabled={disconnecting}>
          {disconnecting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2Off className="mr-1.5 h-3.5 w-3.5" />
          )}
          Unlink device
        </Button>
      </div>
    );
  }

  if (data.status === "pairing" || (data.status === "connecting" && !data.error)) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        {data.code ? (
          <>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Enter this code on your phone
            </div>
            <code className="text-2xl font-mono font-semibold tracking-[0.25em]" style={{ color: BRAND }}>
              {data.code}
            </code>
            <p className="max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">
              WhatsApp → Settings → Linked Devices → Link a Device →{" "}
              <b className="text-foreground">Link with phone number instead</b>
            </p>
          </>
        ) : data.error ? (
          <>
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-[12px] text-destructive">{data.error}</p>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-foreground/70" />
            <div className="text-[13px] text-muted-foreground">Requesting pairing code…</div>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={disconnecting} className="mt-1">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background/50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Read-only monitor: pairing links a device, but Cabinet can never send messages or mark chats read.
        </p>
      </div>
      {data.status === "close" && data.loggedOut && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-[12px] leading-relaxed text-foreground">
            Device was unlinked on your phone. Re-pair below.
          </p>
        </div>
      )}
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Phone number
        </label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="972501234567 (country code, digits only)"
          className="h-8 text-[12.5px] font-mono"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !connecting) {
              e.preventDefault();
              void handleConnect();
            }
          }}
        />
      </div>
      <Button className="w-full text-black" style={{ background: BRAND }} onClick={handleConnect} disabled={connecting}>
        {connecting ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <MessageCircle className="mr-1.5 h-4 w-4" />
        )}
        Connect WhatsApp
      </Button>
    </div>
  );
}
