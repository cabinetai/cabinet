# CLIProxyAPI connector design

Date: 2026-07-14
Status: experimental implementation; release gates remain
Upstream reviewed: `router-for-me/CLIProxyAPI` at `c8803713c972af0076f55933fdeed4db81d72d24` and release `v7.2.77`

## Decision

Run CLIProxyAPI as a Cabinet-managed, loopback-only sidecar. It is a connector
for account authentication, model routing, and protocol translation; it is not
an agent provider by itself.

Cabinet's existing Claude Code and Codex adapters remain the
agent runtimes. They own the coding loop, tool execution, workspace access,
structured event stream, and session resume. When a user selects a connected
CLIProxyAPI account, Cabinet injects proxy settings into that one child process.
It must not rewrite the user's global CLI configuration.

This preserves both halves of the product:

```text
Cabinet task
  -> existing agent CLI adapter (tools, sessions, JSON stream)
  -> Cabinet-managed CLIProxyAPI sidecar (OAuth, account pool, routing)
  -> Claude / ChatGPT Codex account
```

Making CLIProxyAPI an `AgentExecutionAdapter` directly would be misleading. Its
HTTP completion APIs do not implement Cabinet's coding-agent tool loop.

## Why it is a good fit

CLIProxyAPI provides the missing account-routing layer beneath Cabinet's
multi-CLI runtime:

- OpenAI Responses, Chat Completions, Claude Messages, Gemini, and Codex-direct
  compatible routes.
- OAuth flows and multiple-account pools for Claude, Codex, Antigravity,
  xAI, and Kimi.
- Round-robin or fill-first routing, retry/cooldown handling, hot reload, and
  optional session affinity.
- A management API suitable for a Cabinet-native connection UI.
- Cross-platform release artifacts and a reusable Go SDK.

The Go SDK is not the first integration choice. Cabinet is TypeScript/Electron;
embedding the SDK would require a new Go host binary and would still leave
packaging and process supervision work. A supervised release binary gives the
same lifecycle boundary with lower coupling.

## Native user experience

Settings should expose an **AI accounts** connector, separate from the existing
**Agent CLIs** readiness grid.

1. **Set up connector** downloads Cabinet's pinned artifact, verifies its
   SHA-256 digest, creates a private config, and starts the sidecar.
2. **Connect account** opens a validated HTTPS provider authorization URL returned by the
   management API. Cabinet polls the OAuth state and refreshes the account list
   on completion. Device-code providers also display a copyable user code.
3. Connected accounts show provider, redacted identity, enabled/disabled state,
   and health. Raw credential records never cross to the browser.
4. Runtime selection can offer direct auth or **via connected accounts**.
   Routing is applied only to the spawned child process.
5. Uninstall/disable stops the sidecar but keeps account data unless the user
   explicitly chooses **Remove accounts and credentials**.

## Runtime and storage contract

Cabinet owns the following under `DATA_DIR/.cabinet-state/cli-proxy/`:

```text
bin/<version>/cli-proxy-api[.exe]
auth/                         # upstream OAuth records, private
config.yaml                   # generated; never user-edited
runtime.json                  # API key, management key, selected port
```

The generated configuration must:

- bind `127.0.0.1`, never all interfaces;
- require a random API key on model routes;
- require a separate random management key;
- keep remote management disabled;
- disable the downloadable management control panel;
- disable plugins initially (and use Linux no-plugin artifacts);
- keep request logging, debug/pprof, and usage aggregation disabled by default;
- keep WebSocket authentication enabled;
- use a Cabinet-owned authentication directory.

The daemon owns the child process, restores it only when the user previously
left it running, and waits for termination during Cabinet shutdown.
Readiness is `GET /healthz`; model readiness is authenticated `GET /v1/models`.

## Packaging and update policy

Initial releases use a Cabinet-pinned CLIProxyAPI version and checksums. Do not
resolve `latest` during every install: an upstream release must not silently
change Cabinet behavior.

The upstream release publishes SHA-256 checksums but no independently signed
manifest. Pinning the digest detects corruption and unexpected artifact changes,
but it does not provide provenance independent of GitHub. Before general
availability, mirror the reviewed artifacts into Cabinet's signed release and
include the upstream MIT license. Updates should follow Cabinet's release train
with a health-check and rollback to the previous binary.

Linux uses the `_no-plugin` build to avoid glibc/plugin-loading constraints.
macOS and Windows currently have only standard builds, so plugins remain
disabled in configuration. macOS distribution must validate Gatekeeper and
notarization behavior in the packaged app.

## Adapter routing contract

Routing defaults off and is enabled by the connector-level **Use connected
accounts for agent runs** toggle. It applies only when a matching connected account exists and can
be overridden per run with adapter configuration. It never mutates global
environment state.

- Claude Code: inject its supported Anthropic base URL and auth-token variables.
- Codex: pass per-invocation `-c` overrides for a custom Responses provider and
  inject only that provider's API-key environment variable.
- Terminal/PTY mode and structured mode use the same routing helper.

Gemini/OpenCode execution routing is deferred until their authentication
precedence and streaming/session behavior are validated end to end.

Provider health must distinguish two layers: **agent CLI installed** and
**connected account available**. A proxy connection cannot make a missing
Claude/Codex/Gemini client executable runnable.

## API boundary

The browser never talks to port 8317 (or the selected ephemeral port). Browser
requests go through Cabinet's authenticated Next.js API, then the bearer-gated
daemon. Only the daemon holds CLIProxyAPI's management and model API keys.

The minimal daemon surface is:

```text
GET  /cli-proxy/status
POST /cli-proxy/install
POST /cli-proxy/start
POST /cli-proxy/stop
POST /cli-proxy/routing
POST /cli-proxy/oauth/start
GET  /cli-proxy/oauth/status?state=...
POST /cli-proxy/oauth/cancel
GET  /cli-proxy/models
GET  /cli-proxy/accounts
```

OAuth providers supported by the initial management surface are `anthropic`
and `codex`. Arbitrary management API proxying is not allowed.

## Known risks and gates

- Subscription/OAuth relay behavior may be restricted by upstream provider
  terms. Cabinet should describe it accurately and require users to connect
  accounts they are authorized to use; legal review is a release gate.
- OAuth callback listeners use provider-specific localhost ports. Port conflicts
  need a targeted error with retry guidance.
- Account files contain refresh/access tokens. Cabinet uses private file modes,
  masks identities returned to the browser, excludes the entire connector state
  from backups, and never inherits Cabinet/provider tokens into the sidecar.
  Credential deletion UX still requires a follow-up.
- CLIProxyAPI is fast-moving. Protocol compatibility tests should run against
  the pinned binary for Claude stream JSON, Codex Responses JSONL, Gemini stream
  JSON, tool calls, images, session resume, cancellation, and quota failover.
- Cloud/headless deployments need a separate callback and tenant-isolation
  design. The first release is local desktop/self-hosted only.

## Delivery sequence

1. Managed binary install, secure config generation, supervision, and health.
2. Narrow daemon/Next API plus OAuth account UI.
3. Per-run routing for Codex and Claude structured adapters.
4. PTY parity and account health are implemented; dynamic model hydration and
   credential removal flows remain follow-ups.
5. Packaging mirror, license inclusion, upgrade/rollback, and cross-platform
   release tests.
