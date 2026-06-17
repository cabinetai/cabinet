# syntax=docker/dockerfile:1
#
# Cabinet (j0nathontayl0r/cabinet, fork of hilash/cabinet) — multi-stage image.
#
# This file is a ready-to-copy artifact maintained in the `portainer` repo
# (ai-agents-wd/cabinet/Dockerfile). To build:
#   1. Copy this file into the root of a clone of `j0nathontayl0r/cabinet`
#      (the repo's existing .dockerignore already excludes node_modules,
#      .next, .git, data, and most *.md files from the build context).
#   2. From that repo's root:
#        docker build -t ghcr.io/j0nathontayl0r/cabinet:0.4.11 .
#
# Runtime model:
#   - The image's default CMD starts BOTH the Next.js app (`npm run
#     start:next`) and the daemon (`npm run start:daemon`) as a single
#     container process (useful for local/manual `docker run`).
#   - In Kubernetes, the Deployment runs TWO containers from this same
#     image, each overriding `command:` to run only one of the two
#     processes (`["npm","run","start:next"]` / `["npm","run","start:daemon"]`).
#     ENTRYPOINT is intentionally left as the default shell form so that
#     `command:` overrides replace CMD cleanly without any wrapper logic
#     getting in the way.

# ---------------------------------------------------------------------------
# Stage: builder
# ---------------------------------------------------------------------------
# Base image pinned by digest (DK1) — node:22-bookworm at capture time.
# Re-pin deliberately when bumping Node; a bare tag let two builds from the
# same commit diverge.
FROM node:22-bookworm@sha256:2d178f2785b96dfbf62a416ca2e40f50e30150b4ff3320d706f0d96e90600eb3 AS builder

WORKDIR /app

# better-sqlite3 and node-pty are native modules (regular `dependencies`,
# not devDependencies) and need a C/C++ build toolchain + Python during
# `npm ci`. node:22-bookworm does not include these by default.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching.
#
# package.json declares a `postinstall` hook (`node scripts/postinstall.mjs`)
# that npm runs automatically during `npm ci`, so that script must exist in
# the image before the install or `npm ci` fails with MODULE_NOT_FOUND. It is
# self-contained (only Node builtins + better-sqlite3, no project imports) and
# on Linux rebuilds better-sqlite3 from source when the prebuilt binding's
# NODE_MODULE_VERSION doesn't match this runtime. Copy just that one script
# (not the whole source tree) so the dependency layer still caches across
# source-only changes.
COPY package.json package-lock.json ./
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
RUN npm ci

# Copy the rest of the source and build the Next.js app.
COPY . .
RUN npm run build

# Shrink node_modules to production-only. This keeps tsx, node-pty,
# better-sqlite3, simple-git, etc. (all regular dependencies) while dropping
# devDependencies (typescript, eslint, electron-forge, @types/*, ...) that
# are only needed for `next build`.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage: runtime
# ---------------------------------------------------------------------------
# Same glibc family + Node major version as the builder so the
# better-sqlite3/node-pty native bindings compiled above load without a
# rebuild (ensureBetterSqlite3()'s NODE_MODULE_VERSION check passes).
# Runtime base pinned by digest (DK1) — node:22-bookworm-slim at capture time.
# Keep the major version in lockstep with the builder digest above.
FROM node:22-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS runtime

WORKDIR /app
ENV NODE_ENV=production

# git: Cabinet auto-commits knowledge-base edits via simple-git (shells out to
# the `git` binary), and the in-app skills installer runs `git clone` over
# HTTPS. node:22-bookworm-slim ships neither git nor a CA bundle.
# ca-certificates is REQUIRED for the HTTPS clones — without it git uses the
# empty system CA store and every `git clone https://...` fails with "server
# certificate verification failed. CAfile: none". (Node's own fetch() is
# unaffected because Node bundles its own CAs; this only bites the git binary.)
# openssh-client: Cabinet's in-app git pull (status-bar auto-pull) and any
# ssh:// remote operations shell out to `ssh`. Without it, `git pull` against
# the ssh:// cabinet-storage remote fails with "cannot run ssh: No such file
# or directory" -> "fatal: unable to fork".
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates openssh-client \
    && rm -rf /var/lib/apt/lists/*

# AI agent CLIs that Cabinet drives as subprocesses. Installed globally to
# /usr/local/bin, which is on Cabinet's ADAPTER_RUNTIME_PATH so the daemon
# resolves them automatically. Authenticate via interactive `claude login` /
# `codex login` run once in a terminal; CLAUDE_CONFIG_DIR / CODEX_HOME (set on
# the daemon container) point their config dirs at the cabinet-agent-state PVC
# so the OAuth tokens persist across pod restarts.
# Versions pinned (DK2). Note: at runtime the compose bind-mount overrides this
# image's `claude` with the host binary, so the claude-code pin is for
# reproducibility; the codex pin actually governs the runtime codex version.
RUN npm install -g @anthropic-ai/claude-code@2.1.179 @openai/codex@0.140.0

# Pruned production node_modules (tsx, node-pty, better-sqlite3, simple-git,
# next, react, etc.) and the Next.js build output.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Daemon source (run via `tsx server/cabinet-daemon.ts`) and the `src/`
# tree it imports via the `@/` path alias (e.g. src/lib/agents/daemon-auth,
# src/lib/runtime/runtime-config, src/lib/storage/path-utils, ...). tsx
# resolves tsconfig.json's `paths` natively, so tsconfig.json must ship too.
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json ./package.json

# Cabinet-root skill bundle(s) shipped in the image, plus a writable skills
# tree. In production the container runs as the non-root `node` user (uid 1000,
# via compose `user: "1000:1000"`), and the in-app skills installer
# (/api/agents/skills/import) resolves the default "root" scope to
# <PROJECT_ROOT>/.agents/skills (i.e. /app/.agents/skills) where it mkdtemp's a
# temp clone dir. /app is root-owned from the build, so without the chown the
# install fails with EACCES -> HTTP 500. Hand the tree to `node`.
#
# Persistence + seeding: in production /app/.agents/skills is bind-mounted to a
# host dir (cabinet-storage) so user-installed skills survive rebuilds. But that
# mount SHADOWS whatever skills this image ships at that path. To keep bundled
# skills available — and to make NEW bundled skills from future images appear
# automatically — copy a pristine bundle to /app/.agents/skills-seed, a sibling
# path the bind-mount never covers. The startup script (below) merges seed ->
# skills on every boot without clobbering user-installed skills.
COPY --chown=node:node --from=builder /app/.agents ./.agents
RUN mkdir -p /app/.agents/skills /app/.agents/skills-seed \
    && cp -a /app/.agents/skills/. /app/.agents/skills-seed/ \
    && chown -R node:node /app/.agents

# Cabinet writes runtime state files directly in PROJECT_ROOT (= /app): the
# skills lock (skills-lock.json), the env/auth-salt file (.cabinet.env), the
# install config (.cabinet-install.json), and it appends to /app/.gitignore.
# /app is root-owned from the image build but the container runs as non-root
# `node` (uid 1000), so those writes fail with EACCES -> HTTP 500 (e.g. skill
# installs). Make /app and its top-level entries node-owned. -maxdepth 1 keeps
# this cheap: it does NOT recurse into node_modules (no layer bloat), it just
# lets `node` create/modify the top-level state files.
RUN find /app -maxdepth 1 -exec chown node:node {} +

# Default CMD: run both the Next.js app and the daemon as one container
# process, forwarding signals to both. Plain `npm run start`'s
# `&`-backgrounding does not propagate SIGTERM to its children, which would
# leave processes lingering / cause slow, non-graceful container stops.
#
# This is written inline (rather than a separate docker-entrypoint.sh copied
# alongside this Dockerfile) to keep the artifact a single self-contained
# file. ENTRYPOINT is left at its default (none/shell form) so that
# Kubernetes `command:` overrides (e.g. ["npm","run","start:next"]) replace
# this CMD cleanly for the per-process containers.
# Uses bash for `wait -n` (wait for the first job to exit). Debian/bookworm
# images (including -slim) ship /bin/bash as part of the base system.
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -e' \
    '' \
    '# Merge image-bundled skills into the (possibly bind-mounted) skills dir' \
    '# without clobbering user-installed ones. skills-seed is baked into the' \
    '# image at a path the runtime bind-mount does not cover, so NEW bundled' \
    '# skills from a future image appear automatically on the next start, and' \
    '# existing/user skills are left untouched (cp -n = no-clobber).' \
    'mkdir -p /app/.agents/skills' \
    'cp -rn /app/.agents/skills-seed/. /app/.agents/skills/ 2>/dev/null || true' \
    '' \
    'pids=()' \
    '' \
    'term() {' \
    '  trap - TERM INT' \
    '  for pid in "${pids[@]}"; do' \
    '    kill "$pid" 2>/dev/null || true' \
    '  done' \
    '  wait "${pids[@]}" 2>/dev/null || true' \
    '}' \
    'trap term TERM INT' \
    '' \
    'npm run start:next &' \
    'pids+=("$!")' \
    'npm run start:daemon &' \
    'pids+=("$!")' \
    '' \
    '# Wait for the first process to exit, then shut down the other and' \
    '# propagate a non-zero status if either died.' \
    'wait -n "${pids[@]}"' \
    'status=$?' \
    'term' \
    'exit "$status"' \
    > /usr/local/bin/cabinet-start.sh \
    && chmod +x /usr/local/bin/cabinet-start.sh

EXPOSE 3000 3001

CMD ["/usr/local/bin/cabinet-start.sh"]
