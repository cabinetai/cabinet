"use client";

// stepArtFor returns render callbacks ((index) => ReactNode), not components —
// react/display-name false-positives on those inline arrows.
/* eslint-disable react/display-name */

import type { ReactNode } from "react";
import { DiscordStepArt } from "@/components/integrations/hub/discord-setup-art";
import { TelegramStepArt } from "@/components/integrations/hub/telegram-setup-art";
import { GoogleDriveStepArt } from "@/components/integrations/hub/google-drive-setup-art";
import {
  Avatar,
  BtnMock,
  CheckRow,
  FieldMock,
  Hint,
  KvRow,
  MockWindow,
  ToggleRow,
} from "@/components/integrations/hub/setup-art-primitives";

/**
 * Per-step "mini-mockup" art for the setup guide of EVERY integration.
 *
 * Most connectors share a setup *pattern*, so rather than hand-draw 50 bespoke
 * mockups we render reusable, brand-parameterized ones keyed by pattern:
 *   - official one-click OAuth  → a consent-screen mock
 *   - bring-your-own URL        → get-URL + paste-URL mocks
 *   - Microsoft 365             → Azure app register / scopes / secret
 *   - Shopify / Figma / Salesforce → tailored single-screen mocks
 *   - LinkedIn                  → install-uv / browser-login / ready-to-connect
 * Multi-step official-OAuth connectors (Google / GitHub / Notion) reuse the
 * consent mock for step 0 and add tailored mocks for their own-app / scopes /
 * scoping steps. Discord & Telegram keep their fully bespoke art. Slack has no
 * generic art at all — each of its setup steps carries a real screenshot via
 * `CatalogSetupStep.image` instead. `stepArtFor` is the dispatcher the detail
 * page calls.
 */

export function stepArtFor(opts: {
  id: string;
  label: string;
  brand: string;
  authBackend: string;
  transport: string;
  hasUrlCredential: boolean;
}): ((index: number) => ReactNode) | undefined {
  const { id, label, brand, authBackend, transport, hasUrlCredential } = opts;

  if (id === "discord") return (i) => <DiscordStepArt step={i} brand={brand} />;
  if (id === "telegram") return (i) => <TelegramStepArt step={i} brand={brand} />;
  if (id === "google-drive") return (i) => <GoogleDriveStepArt step={i} brand={brand} />;
  if (id === "microsoft-365") return (i) => <MicrosoftArt step={i} brand={brand} />;
  if (id === "shopify") return () => <ShopifyArt brand={brand} />;
  if (id === "figma") return () => <FigmaArt brand={brand} />;
  if (id === "salesforce") return () => <SalesforceArt brand={brand} />;
  if (id === "linkedin") return (i) => <LinkedInArt step={i} brand={brand} />;

  // Multi-step official-OAuth connectors: step 0 is the generic consent screen,
  // but their later "register your own app / scopes / scope the access" steps
  // need their own tailored mocks (the steps users actually get stuck on).
  // Slack has no entry here — its setup steps each carry a real screenshot via
  // `CatalogSetupStep.image`, so a stylized mockup would just be noise.
  if (id === "google-workspace") return (i) => <GoogleArt step={i} label={label} brand={brand} />;
  if (id === "github") return (i) => <GithubArt step={i} label={label} brand={brand} />;
  if (id === "notion") return (i) => <NotionArt step={i} label={label} brand={brand} />;

  if (transport === "http" && authBackend === "cli-pkce") {
    return (i) => <OAuthConsentArt step={i} label={label} brand={brand} />;
  }
  if (authBackend === "token" && hasUrlCredential) {
    return (i) => <ByoUrlArt step={i} label={label} brand={brand} />;
  }
  return undefined;
}

/* ── pattern renderers ──────────────────────────────────────────────────── */

/** Official one-click OAuth — the browser consent screen (step 0 only). */
function OAuthConsentArt({ step, label, brand }: { step: number; label: string; brand: string }) {
  if (step !== 0) return null;
  return (
    <MockWindow title={`Authorize · ${label}`} brand={brand}>
      <div className="flex flex-col items-center text-center">
        <Avatar brand={brand}>{label.charAt(0)}</Avatar>
        <div className="mt-2 text-[11px] text-foreground">
          <b>Cabinet</b> wants to access your <b>{label}</b> account
        </div>
        <div className="mt-2 w-full space-y-1 text-left">
          <CheckRow brand={brand}>Read your {label} data</CheckRow>
          <CheckRow brand={brand}>Act on your behalf</CheckRow>
        </div>
        <div className="mt-3 flex w-full items-center justify-center gap-2">
          <BtnMock brand={brand}>Authorize</BtnMock>
          <BtnMock>Cancel</BtnMock>
        </div>
      </div>
      <Hint brand={brand}>
        Your agent&apos;s CLI opens this in the browser the first time. Approve once, nothing to paste.
      </Hint>
    </MockWindow>
  );
}

/** Bring-your-own remote — copy your URL (0), then paste it (1). */
function ByoUrlArt({ step, label, brand }: { step: number; label: string; brand: string }) {
  if (step === 0) {
    return (
      <MockWindow title={`${label} · MCP server`} brand={brand}>
        <div className="text-[10px] text-muted-foreground">Your server URL</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 truncate rounded-md bg-foreground/[0.06] px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
            https://mcp.example.com/…/mcp
          </div>
          <BtnMock brand={brand}>Copy</BtnMock>
        </div>
        <Hint brand={brand}>
          Copy your MCP URL from {label}, or a hosted gateway (Composio, Pipedream, Zapier).
        </Hint>
      </MockWindow>
    );
  }
  return (
    <MockWindow title={`Connect ${label}`} brand={brand}>
      <div className="text-[10px] font-medium text-foreground">{label} MCP server URL</div>
      <FieldMock>https://…/mcp</FieldMock>
      <BtnMock brand={brand} full>
        Connect
      </BtnMock>
      <Hint brand={brand}>Paste it into the field on the right →</Hint>
    </MockWindow>
  );
}

/** Microsoft 365 — Azure app registration / Graph scopes / client secret. */
function MicrosoftArt({ step, brand }: { step: number; brand: string }) {
  if (step === 0) {
    return (
      <MockWindow title="Azure · App registrations" brand={brand}>
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">App registrations</span>
          <BtnMock brand={brand}>+ New registration</BtnMock>
        </div>
        <div className="mt-2 space-y-1">
          <KvRow k="Application (client) ID" v="0000…-0000" />
          <KvRow k="Directory (tenant) ID" v="common" />
        </div>
        <Hint brand={brand}>Register an app, then copy the Client &amp; Tenant IDs.</Hint>
      </MockWindow>
    );
  }
  if (step === 1) {
    return (
      <MockWindow title="API permissions · Microsoft Graph" brand={brand}>
        <div className="grid grid-cols-1 gap-1">
          <CheckRow brand={brand}>Mail.ReadWrite</CheckRow>
          <CheckRow brand={brand}>Calendars.ReadWrite</CheckRow>
          <CheckRow brand={brand}>Chat.ReadWrite</CheckRow>
          <CheckRow brand={brand}>Sites.Read.All · Files.Read.All</CheckRow>
        </div>
        <div className="mt-2">
          <BtnMock brand={brand}>✓ Grant admin consent</BtnMock>
        </div>
        <Hint brand={brand}>Add the delegated Graph scopes, then grant consent.</Hint>
      </MockWindow>
    );
  }
  return (
    <MockWindow title="Certificates &amp; secrets" brand={brand}>
      <div className="flex items-center justify-between">
        <span className="text-foreground">New client secret</span>
        <BtnMock brand={brand}>+ New</BtnMock>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-md bg-foreground/[0.06] px-2 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">••••••••••••••••</span>
        <span className="text-[10px] font-medium" style={{ color: brand }}>
          Copy
        </span>
      </div>
      <Hint brand={brand}>Create a secret, then paste Client ID, Tenant ID &amp; Secret below.</Hint>
    </MockWindow>
  );
}

/** Shopify — runs locally via npx (docs + GraphQL), no sign-in. */
function ShopifyArt({ brand }: { brand: string }) {
  return (
    <MockWindow title="Terminal" brand={brand}>
      <div className="rounded-md bg-foreground/[0.06] p-2 font-mono text-[10px] leading-relaxed">
        <div className="text-muted-foreground">
          <span style={{ color: brand }}>$</span> npx -y @shopify/dev-mcp@latest
        </div>
        <div className="text-foreground">✓ Shopify dev MCP ready: docs + GraphQL schema</div>
      </div>
      <Hint brand={brand}>No sign-in, it runs locally. Just click Connect.</Hint>
    </MockWindow>
  );
}

/** Figma — enable the Dev Mode MCP server in the desktop app. */
function FigmaArt({ brand }: { brand: string }) {
  return (
    <MockWindow title="Figma · Preferences" brand={brand}>
      <ToggleRow label="Enable Dev Mode MCP Server" brand={brand} on />
      <div className="mt-2 rounded-md bg-foreground/[0.06] px-2 py-1 font-mono text-[10px] text-muted-foreground">
        Server: http://127.0.0.1:3845/mcp
      </div>
      <Hint brand={brand}>Turn it on in the Figma desktop app, then click Connect.</Hint>
    </MockWindow>
  );
}

/** Salesforce — authorize an org via the sf CLI. */
function SalesforceArt({ brand }: { brand: string }) {
  return (
    <MockWindow title="Terminal" brand={brand}>
      <div className="rounded-md bg-foreground/[0.06] p-2 font-mono text-[10px] leading-relaxed">
        <div className="text-muted-foreground">
          <span style={{ color: brand }}>$</span> sf org login web
        </div>
        <div className="text-foreground">✓ Logged in to org: DEFAULT_TARGET_ORG</div>
      </div>
      <Hint brand={brand}>Authorize your org once; the MCP uses your CLI&apos;s default org.</Hint>
    </MockWindow>
  );
}

/** LinkedIn — install uv (0) → browser login (1) → ready to connect (2). */
function LinkedInArt({ step, brand }: { step: number; brand: string }) {
  if (step === 0) {
    return (
      <MockWindow title="Terminal" brand={brand}>
        <div className="rounded-md bg-foreground/[0.06] p-2 font-mono text-[10px] leading-relaxed">
          <div className="text-muted-foreground">
            <span style={{ color: brand }}>$</span> curl -LsSf https://astral.sh/uv/install.sh | sh
          </div>
          <div className="text-foreground">✓ uv installed, uvx ready</div>
        </div>
        <Hint brand={brand}>One-time: installs uv so Cabinet can launch the server locally.</Hint>
      </MockWindow>
    );
  }
  if (step === 1) {
    return (
      <MockWindow title="Sign in · LinkedIn" brand={brand}>
        <div className="flex flex-col items-center text-center">
          <Avatar brand={brand}>in</Avatar>
          <div className="mt-2 text-[11px] font-medium text-foreground">Sign in to LinkedIn</div>
          <div className="mt-2 w-full space-y-1">
            <FieldMock>you@email.com</FieldMock>
            <FieldMock>••••••••••</FieldMock>
          </div>
          <BtnMock brand={brand} full>
            Sign in
          </BtnMock>
        </div>
        <Hint brand={brand}>
          <b>uvx linkedin-scraper-mcp --login</b> opens this in a browser. Sign in once; the session stays on this device.
        </Hint>
      </MockWindow>
    );
  }
  return (
    <MockWindow title="Terminal" brand={brand}>
      <div className="rounded-md bg-foreground/[0.06] p-2 font-mono text-[10px] leading-relaxed">
        <div className="text-foreground">✓ Logged in, session saved to ~/.linkedin-mcp</div>
      </div>
      <Hint brand={brand}>Now click Connect. Your agent drives your own logged-in session.</Hint>
    </MockWindow>
  );
}

/* ── multi-step official-OAuth connectors ───────────────────────────────── */

/** Google Workspace: consent (0) → your own GCP app — APIs + OAuth client (1). */
// Indices map to the google-workspace `setupSteps` order in mcp-catalog.ts:
// 0 install uv · 1 create OAuth client · 2 add test user · 3 connect & authorize.
function GoogleArt({ step, label, brand }: { step: number; label: string; brand: string }) {
  // 0 — install uv (the server runs via uvx).
  if (step === 0) {
    return (
      <MockWindow title="Terminal · install uv" brand={brand}>
        <FieldMock>curl -LsSf https://astral.sh/uv/install.sh | sh</FieldMock>
        <Hint brand={brand}>
          One-time. Windows: <b>winget install --id=astral-sh.uv</b>. Restart Cabinet after installing.
        </Hint>
      </MockWindow>
    );
  }
  // 1 — enable APIs, create a Desktop OAuth client, copy its Client ID/Secret.
  if (step === 1) {
    return (
      <MockWindow title="Google Cloud Console · APIs &amp; Services" brand={brand}>
        <div className="space-y-1">
          <CheckRow brand={brand}>Google Calendar API</CheckRow>
          <CheckRow brand={brand}>People API (contacts)</CheckRow>
        </div>
        <div className="mt-2 space-y-1">
          <KvRow k="OAuth client type" v="Web application" />
          <KvRow k="Redirect URI" v="http://localhost:8000/oauth2callback" />
          <KvRow k="Client ID" v="1234…apps.googleusercontent.com" />
          <KvRow k="Client secret" v="GOCSPX-••••" />
        </div>
        <Hint brand={brand}>
          Create a <b>Web application</b> client, add the redirect URI above, then paste its Client ID and Secret into the fields on the right.
        </Hint>
      </MockWindow>
    );
  }
  // 2 — add yourself as a test user on the consent screen.
  if (step === 2) {
    return (
      <MockWindow title="OAuth consent screen · Test users" brand={brand}>
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">Test users</span>
          <BtnMock brand={brand}>+ Add users</BtnMock>
        </div>
        <div className="mt-2">
          <KvRow k="you@gmail.com" v="added" />
        </div>
        <Hint brand={brand}>
          Add your own Google account so sign-in works while the app is unverified.
        </Hint>
      </MockWindow>
    );
  }
  // 3 — connect: the browser consent screen the server opens on first use.
  return <OAuthConsentArt step={0} label={label} brand={brand} />;
}

/** GitHub: consent (0) → scope the access — orgs/repos grant + revoke (1). */
function GithubArt({ step, label, brand }: { step: number; label: string; brand: string }) {
  if (step === 0) return <OAuthConsentArt step={0} label={label} brand={brand} />;
  return (
    <MockWindow title="GitHub · Settings · Applications" brand={brand}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar brand={brand}>C</Avatar>
          <span className="text-foreground">Cabinet</span>
        </div>
        <BtnMock>Revoke</BtnMock>
      </div>
      <div className="mt-2">
        <KvRow k="Repository access" v="Only select repos" />
      </div>
      <Hint brand={brand}>
        Grant only the orgs/repos the agent needs. Review or revoke here anytime.
      </Hint>
    </MockWindow>
  );
}

/** Notion: consent (0) → choose what to share — page/database picker (1). */
function NotionArt({ step, label, brand }: { step: number; label: string; brand: string }) {
  if (step === 0) return <OAuthConsentArt step={0} label={label} brand={brand} />;
  return (
    <MockWindow title="Select pages" brand={brand}>
      <div className="rounded-md bg-foreground/[0.05] px-2 py-1 text-[10px] text-muted-foreground">
        🔍 Search pages…
      </div>
      <div className="mt-2 space-y-1">
        <CheckRow brand={brand}>📄 Product roadmap</CheckRow>
        <CheckRow brand={brand} on={false}>📄 Personal notes</CheckRow>
        <CheckRow brand={brand}>🗄 Tasks database</CheckRow>
      </div>
      <Hint brand={brand}>
        Tick exactly the pages/databases to share. Change it anytime in Notion → Connections.
      </Hint>
    </MockWindow>
  );
}
