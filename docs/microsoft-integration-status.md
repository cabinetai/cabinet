# Microsoft Integration — Status

_Last updated: 2026-06-28_

| Integration | Status | Server / Type | Source | TODO |
|---|---|---|---|---|
| **Microsoft 365** (Outlook mail, calendar, Teams, files) | ✅ **Live** — launched (`LAUNCHED` gate on), connectable. Personal accounts: in-panel one-click device-code sign-in. Work/school: paste your own Entra app. ⚠️ Not yet fully verified end-to-end on a real account. **Note:** file access is read/browse only (`Files.Read.All` / `Sites.Read.All`) — no write-back | Community MCP server (`@softeria/ms-365-mcp-server`) | Open source | Complete a real personal sign-in to confirm completion detection + token-cache sharing · verify the work/school path |
| **Microsoft Teams** (chats & channels into agent context) | ✅ **Launched** — `microsoft-teams` added to `LAUNCHED`; card connects through the Microsoft 365 suite. ⚠️ **Work/school only** — personal accounts have no Teams. The Teams Graph tools are now auto-enabled via the server's `--org-mode` flag, which Cabinet appends only when an Entra Client ID is set (work mode). **Not yet verified end-to-end** (needs a work/school tenant). | Community MCP server (same `ms-365-mcp-server`, `--org-mode`) | Open source | Verify against a real work/school tenant (e.g. M365 Developer Program E5 sandbox): connect → list Teams chats → post a marker message |
| **OneDrive + SharePoint** (browse files in left sidebar) | ⚠️ MCP access works, but **mounted files in sidebar don't exist** | Community MCP server (same `ms-365-mcp-server`) | Open source | Show mounted files in the left sidebar ❓ (needs sync-to-disk or a remote tree — separate from the MCP integration) |
| **Official Microsoft** (Agent 365 / tenant) | ❌ Integration does not exist | Tenant Agent (Agent 365 hosted servers) | Closed source | Get a compatible Microsoft account (Agent-365-enabled work tenant) for testing |
| **SharePoint** (official) | ❌ Integration does not exist | Tenant Agent — no dedicated server; site/file content only via Agent 365 Copilot Chat search | Closed source | Get an Agent-365-enabled work tenant · confirm SharePoint coverage via Copilot Chat search |

## Microsoft 365 — what's built (2026-06-16)

- **Launched:** added `microsoft-365` to the `LAUNCHED` set in `preview-catalog.ts` so the card is live (no longer "Soon").
- **Two connect modes** (chooser in the connect panel):
  - **Personal account** (outlook.com / hotmail): no fields. Click "Sign in with Microsoft" and Cabinet displays a verification URL plus a short user code. You open that URL in your browser and enter the code on Microsoft's own sign-in page (the code is not pasted back into Cabinet), then approve access. Cabinet polls in the background until you've finished, then registers the MCP server. Uses the server's built-in app; no Azure setup.
  - **Work / school app:** paste your own Entra `MS365_MCP_CLIENT_ID` / `TENANT_ID` / `CLIENT_SECRET` (stored in `.cabinet.env`, 0600). Sign-in happens on first agent use.
- **Capabilities are account-aware:** personal accounts show Outlook mail & calendar + OneDrive only (Teams and SharePoint are work/school features).
- **No username/password anywhere** — auth is OAuth via Microsoft Graph. Personal tokens are cached by the connector in the OS keychain; Cabinet stores nothing for personal accounts.

### Files / code

- `src/lib/integrations/preview-catalog.ts` — launch gate
- `src/lib/agents/mcp-catalog.ts` — optional credentials (personal path)
- `src/lib/agents/mcp-config-writer.ts` — `resolveServerEnv()` drops unset env placeholders
- `src/components/integrations/hub/connect-panel.tsx` — account chooser + in-panel device-code sign-in
- `src/components/integrations/hub/integration-detail-page.tsx` — mode-aware setup guide, capabilities, and trust note
- `src/lib/agents/microsoft-login.ts` + `src/app/api/agents/config/mcp-catalog/microsoft/login/route.ts` — device-code backend

### Open verification items

- Device-code URL/code parsing is **verified** against real server output.
- **Not yet confirmed:** sign-in completion detection (relies on the `--login` process exiting 0) and that the token cached by the standalone login is picked up by the agent-spawned server.
- Packaged Electron build needs `npx`/node on PATH (same dependency the MCP server already has).

## Reset / start over

Three independent layers:
1. Server registration → Integrations → Microsoft 365 → **Disconnect**
2. Cached login token → `npx -y @softeria/ms-365-mcp-server --logout`
3. Pasted Entra creds (work mode) → Integrations → **API Keys** → remove `MS365_MCP_*`
