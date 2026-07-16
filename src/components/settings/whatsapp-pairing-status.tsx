"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Loader2, Check } from "lucide-react";

/**
 * Manual-testing widget for the WhatsApp connector's pairing-code flow
 * (docs/WHATSAPP_CONNECTOR.md). Set WHATSAPP_ACCOUNTS and
 * WHATSAPP_PAIRING_PHONE above via "Custom..." to start pairing, then watch
 * this card for the 8-digit code. Not part of the connector's public
 * feature surface yet — the settings-UI connector card is still on the
 * "later layers" list in the doc.
 */

interface StatusPayload {
  status?: string;
  method?: "qr" | "code";
  code?: string;
  error?: string;
  loggedOut?: boolean;
  updatedAt?: string;
}

export function WhatsAppPairingStatus(): React.ReactElement | null {
  const [data, setData] = useState<StatusPayload>({ status: "not_started" });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/whatsapp/status?accountId=personal");
        const json = (await res.json()) as StatusPayload;
        if (!cancelled) setData(json);
      } catch {
        /* transient; try again next tick */
      }
    };
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data.status || data.status === "not_started") return null;

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-start gap-2.5">
      {data.status === "open" ? (
        <Check className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
      ) : (
        <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="text-[12.5px] space-y-0.5">
        <div className="font-medium">WhatsApp (personal)</div>
        {data.status === "open" && <div className="text-muted-foreground">Connected.</div>}
        {data.status === "pairing" && data.method === "code" && !data.code && !data.error && (
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Requesting pairing code…
          </div>
        )}
        {data.status === "pairing" && data.code && (
          <div>
            <span className="text-muted-foreground">Enter this code in WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead: </span>
            <code className="font-mono font-semibold tracking-wider">{data.code}</code>
          </div>
        )}
        {data.status === "pairing" && data.method === "qr" && (
          <div className="text-muted-foreground">
            QR pairing in progress — check the daemon log.
          </div>
        )}
        {data.error && <div className="text-destructive">{data.error}</div>}
        {data.status === "close" && data.loggedOut && (
          <div className="text-destructive">
            Logged out — delete the session store and re-pair.
          </div>
        )}
      </div>
    </div>
  );
}
