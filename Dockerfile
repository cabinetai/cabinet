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
#        docker build -t ghcr.io/j0nathontayl0r/cabinet:0.4.12 .
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

# ===========================================================================
# TOOL LAYER — curated CLI toolbox for the in-app AI agents
# ===========================================================================
# Cabinet's agents diagnose/lint/scan/build homelab GitOps changes by shelling
# out to these CLIs. They are placed here (after the rarely-changing npm
# globals, before the frequently-changing app-source COPYs below) so editing
# Cabinet source never busts this expensive layer's cache.
#
# SECURITY POSTURE — this image is PUBLIC (the cabinet fork + ghcr package are
# public; anyone can `docker pull` and inspect layers). This layer is therefore
# strictly TOOLS-ONLY: no secrets, credentials, IPs, hostnames, API-server
# URLs or cluster topology appear anywhere in it. The agents' only cluster
# authority is a READ-ONLY ServiceAccount kubeconfig mounted at RUNTIME — never
# baked here. Deliberately EXCLUDED: talosctl (node admin), any docker CLI /
# socket access, and any terraform/cloud (aws/gcloud/az) CLI — the agents must
# never gain node-admin or cloud authority.
#
# PINNING + INTEGRITY (matches this repo's DK1/DK2 digest-pinning discipline):
# every tool is pinned to an explicit version via the ARG block below, and
# every downloaded binary/tarball is verified against the PROJECT'S OWN
# published checksum fetched at build time (never a hand-written hash). Each
# tool's RUN block ends by invoking the tool, so a wrong version (-> 404 ->
# missing/!verifying file) fails the build immediately (fail-closed).

# --- Pinned tool versions (bump these; everything below is derived) ---------
# kubectl tracks the cluster's Kubernetes minor (v1.35.x).
ARG KUBECTL_VERSION=v1.35.6
ARG HELM_VERSION=v3.21.1
ARG ARGOCD_VERSION=v3.4.3
ARG KUBECONFORM_VERSION=v0.8.0
ARG KUBE_LINTER_VERSION=v0.8.3
ARG YQ_VERSION=v4.53.2
ARG TRIVY_VERSION=0.71.1
ARG GITLEAKS_VERSION=8.30.1
ARG TRUFFLEHOG_VERSION=3.95.5
ARG HADOLINT_VERSION=2.14.0
ARG ACTIONLINT_VERSION=1.7.12
ARG GH_VERSION=2.94.0
ARG GO_VERSION=1.26.4
ARG CHECKOV_VERSION=3.3.1
ARG YAMLLINT_VERSION=1.38.0
ARG ZIZMOR_VERSION=1.25.2

# --- Base OS tooling (single apt layer) -------------------------------------
# python3 + venv/pip + pipx: pipx-installed Python linters (checkov, yamllint,
#   zizmor) and ad-hoc agent scripting. (python3/make existed only in the
#   builder stage; the runtime stage needs them too.)
# build-essential + make: native builds for `go`/Makefile-driven repos and any
#   tool the agents `make`. Intentional size cost per the plan.
# jq: JSON wrangling (also used below to read go.dev's checksum JSON).
# shellcheck: shell linting (Debian-packaged; tracks the distro, not pinned).
# curl/wget/unzip/gnupg: fetch + unpack the release binaries pinned below.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip pipx \
        build-essential make \
        jq shellcheck \
        curl wget unzip gnupg; \
    rm -rf /var/lib/apt/lists/*; \
    python3 --version; \
    make --version; \
    jq --version; \
    shellcheck --version

# --- Go toolchain (official tarball -> /usr/local/go) -----------------------
# go.dev does not ship a per-file .sha256 sidecar, so we fetch the official
# release manifest (go.dev/dl ?mode=json) and pull the published sha256 for the
# exact pinned archive — still the project's own checksum, verified at build
# time, no hand-written hash. GOTOOLCHAIN=local (set on PATH below) stops `go`
# from fetching a different toolchain over the network at runtime.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    [ "$arch" = "amd64" ] || { echo "unsupported arch: $arch" >&2; exit 1; }; \
    file="go${GO_VERSION}.linux-amd64.tar.gz"; \
    curl -fsSL "https://go.dev/dl/${file}" -o "/tmp/${file}"; \
    sum="$(curl -fsSL 'https://go.dev/dl/?mode=json&include=all' \
        | jq -r --arg f "$file" \
            '.[].files[] | select(.filename == $f) | .sha256')"; \
    [ -n "$sum" ] || { echo "no published sha256 for ${file}" >&2; exit 1; }; \
    echo "${sum}  /tmp/${file}" | sha256sum -c -; \
    tar -C /usr/local -xzf "/tmp/${file}"; \
    rm -f "/tmp/${file}"; \
    # Symlink into /usr/local/bin so `go` resolves on the DEFAULT PATH too — a
    # login shell (bash -l) sources /etc/profile and resets PATH to a system
    # default that lacks /usr/local/go/bin, so the ENV PATH below isn't enough
    # for the in-app Terminal. go resolves GOROOT via the real binary path, so
    # the symlink is transparent. gofmt likewise.
    ln -sf /usr/local/go/bin/go /usr/local/bin/go; \
    ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt; \
    /usr/local/go/bin/go version
# Put Go on PATH for the runtime `node` user and pin the toolchain to local.
ENV PATH="/usr/local/go/bin:${PATH}" \
    GOTOOLCHAIN=local

# --- kubectl (dl.k8s.io; bare-hash .sha256 sidecar) -------------------------
RUN set -eux; \
    base="https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64"; \
    curl -fsSL "${base}/kubectl" -o /tmp/kubectl; \
    curl -fsSL "${base}/kubectl.sha256" -o /tmp/kubectl.sha256; \
    echo "$(cat /tmp/kubectl.sha256)  /tmp/kubectl" | sha256sum -c -; \
    install -m 0755 /tmp/kubectl /usr/local/bin/kubectl; \
    rm -f /tmp/kubectl /tmp/kubectl.sha256; \
    kubectl version --client

# --- helm (get.helm.sh; .tar.gz.sha256sum sidecar) --------------------------
RUN set -eux; \
    file="helm-${HELM_VERSION}-linux-amd64.tar.gz"; \
    curl -fsSL "https://get.helm.sh/${file}" -o "/tmp/${file}"; \
    curl -fsSL "https://get.helm.sh/${file}.sha256sum" -o /tmp/helm.sha256sum; \
    # sidecar already in "<hash>  <file>" form, but references the bare name.
    ( cd /tmp && sha256sum -c helm.sha256sum ); \
    tar -C /tmp -xzf "/tmp/${file}"; \
    install -m 0755 /tmp/linux-amd64/helm /usr/local/bin/helm; \
    rm -rf "/tmp/${file}" /tmp/helm.sha256sum /tmp/linux-amd64; \
    helm version

# --- argocd CLI (GitHub release; cli_checksums.txt) -------------------------
RUN set -eux; \
    base="https://github.com/argoproj/argo-cd/releases/download/${ARGOCD_VERSION}"; \
    curl -fsSL "${base}/argocd-linux-amd64" -o /tmp/argocd; \
    curl -fsSL "${base}/cli_checksums.txt" -o /tmp/argocd_checksums.txt; \
    ( cd /tmp && grep ' argocd-linux-amd64$' argocd_checksums.txt \
        | sed 's# argocd-linux-amd64# argocd#' | sha256sum -c - ); \
    install -m 0755 /tmp/argocd /usr/local/bin/argocd; \
    rm -f /tmp/argocd /tmp/argocd_checksums.txt; \
    argocd version --client

# --- kubeconform (GitHub release; CHECKSUMS) --------------------------------
RUN set -eux; \
    base="https://github.com/yannh/kubeconform/releases/download/${KUBECONFORM_VERSION}"; \
    curl -fsSL "${base}/kubeconform-linux-amd64.tar.gz" -o /tmp/kubeconform.tar.gz; \
    curl -fsSL "${base}/CHECKSUMS" -o /tmp/kubeconform_checksums.txt; \
    ( cd /tmp && grep ' kubeconform-linux-amd64.tar.gz$' kubeconform_checksums.txt \
        | sed 's# kubeconform-linux-amd64.tar.gz# kubeconform.tar.gz#' \
        | sha256sum -c - ); \
    tar -C /tmp -xzf /tmp/kubeconform.tar.gz kubeconform; \
    install -m 0755 /tmp/kubeconform /usr/local/bin/kubeconform; \
    rm -f /tmp/kubeconform /tmp/kubeconform.tar.gz /tmp/kubeconform_checksums.txt; \
    kubeconform -v

# --- kube-linter (GitHub release) -------------------------------------------
# EXCEPTION to the checksum-file rule: kube-linter v0.8.x ships ONLY Sigstore
# attestations (kube-linter-linux.sigstore.json), no sha256/checksums asset
# verifiable with sha256sum alone (cosign is intentionally not in this image).
# We therefore fetch the pinned tarball over HTTPS from the official GitHub
# release URL — the version pin + TLS are the integrity controls here.
RUN set -eux; \
    base="https://github.com/stackrox/kube-linter/releases/download/${KUBE_LINTER_VERSION}"; \
    curl -fsSL "${base}/kube-linter-linux.tar.gz" -o /tmp/kube-linter.tar.gz; \
    tar -C /tmp -xzf /tmp/kube-linter.tar.gz kube-linter; \
    install -m 0755 /tmp/kube-linter /usr/local/bin/kube-linter; \
    rm -f /tmp/kube-linter /tmp/kube-linter.tar.gz; \
    kube-linter version

# --- yq (built + verified via the Go module checksum database) --------------
# yq's release "checksums" file is a multi-column-per-algorithm format and its
# extract-checksum.sh helper emits a bare hash (not "<file>  <hash>"), which
# makes portable `sha256sum -c` verification fragile. Since the Go toolchain is
# already installed above, build yq from source pinned to the exact tag instead:
# `go install pkg@version` verifies the module against go.sum / the public
# transparency-log checksum database (sum.golang.org) — a stronger integrity
# guarantee than a flat checksums file, with nothing to parse. GOBIN drops the
# binary on PATH; clean the build/module caches after to keep the layer small
# (the /usr/local/go toolchain itself is untouched, so `go` stays available).
RUN set -eux; \
    GOBIN=/usr/local/bin GOFLAGS=-trimpath \
        go install "github.com/mikefarah/yq/v4@${YQ_VERSION}"; \
    go clean -cache -modcache; \
    yq --version

# --- trivy (GitHub release; <name>_checksums.txt) ---------------------------
RUN set -eux; \
    base="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"; \
    file="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"; \
    curl -fsSL "${base}/${file}" -o "/tmp/${file}"; \
    curl -fsSL "${base}/trivy_${TRIVY_VERSION}_checksums.txt" -o /tmp/trivy_checksums.txt; \
    ( cd /tmp && grep " ${file}\$" trivy_checksums.txt | sha256sum -c - ); \
    tar -C /tmp -xzf "/tmp/${file}" trivy; \
    install -m 0755 /tmp/trivy /usr/local/bin/trivy; \
    rm -f "/tmp/${file}" /tmp/trivy /tmp/trivy_checksums.txt; \
    trivy --version

# --- gitleaks (GitHub release; <name>_checksums.txt) ------------------------
# NB: gitleaks names the linux amd64 asset "..._linux_x64.tar.gz".
RUN set -eux; \
    base="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"; \
    file="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"; \
    curl -fsSL "${base}/${file}" -o "/tmp/${file}"; \
    curl -fsSL "${base}/gitleaks_${GITLEAKS_VERSION}_checksums.txt" -o /tmp/gitleaks_checksums.txt; \
    ( cd /tmp && grep " ${file}\$" gitleaks_checksums.txt | sha256sum -c - ); \
    tar -C /tmp -xzf "/tmp/${file}" gitleaks; \
    install -m 0755 /tmp/gitleaks /usr/local/bin/gitleaks; \
    rm -f "/tmp/${file}" /tmp/gitleaks /tmp/gitleaks_checksums.txt; \
    gitleaks version

# --- trufflehog (GitHub release; <name>_checksums.txt) ----------------------
RUN set -eux; \
    base="https://github.com/trufflesecurity/trufflehog/releases/download/v${TRUFFLEHOG_VERSION}"; \
    file="trufflehog_${TRUFFLEHOG_VERSION}_linux_amd64.tar.gz"; \
    curl -fsSL "${base}/${file}" -o "/tmp/${file}"; \
    curl -fsSL "${base}/trufflehog_${TRUFFLEHOG_VERSION}_checksums.txt" -o /tmp/trufflehog_checksums.txt; \
    ( cd /tmp && grep " ${file}\$" trufflehog_checksums.txt | sha256sum -c - ); \
    tar -C /tmp -xzf "/tmp/${file}" trufflehog; \
    install -m 0755 /tmp/trufflehog /usr/local/bin/trufflehog; \
    rm -f "/tmp/${file}" /tmp/trufflehog /tmp/trufflehog_checksums.txt; \
    trufflehog --version

# --- hadolint (GitHub release; bare-hash .sha256 sidecar) -------------------
RUN set -eux; \
    base="https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}"; \
    curl -fsSL "${base}/hadolint-linux-x86_64" -o /tmp/hadolint; \
    curl -fsSL "${base}/hadolint-linux-x86_64.sha256" -o /tmp/hadolint.sha256; \
    # sidecar is a bare hash; pair it with our local filename for sha256sum -c.
    echo "$(awk '{print $1}' /tmp/hadolint.sha256)  /tmp/hadolint" | sha256sum -c -; \
    install -m 0755 /tmp/hadolint /usr/local/bin/hadolint; \
    rm -f /tmp/hadolint /tmp/hadolint.sha256; \
    hadolint --version

# --- actionlint (GitHub release; <name>_checksums.txt) ----------------------
RUN set -eux; \
    base="https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}"; \
    file="actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"; \
    curl -fsSL "${base}/${file}" -o "/tmp/${file}"; \
    curl -fsSL "${base}/actionlint_${ACTIONLINT_VERSION}_checksums.txt" -o /tmp/actionlint_checksums.txt; \
    ( cd /tmp && grep " ${file}\$" actionlint_checksums.txt | sha256sum -c - ); \
    tar -C /tmp -xzf "/tmp/${file}" actionlint; \
    install -m 0755 /tmp/actionlint /usr/local/bin/actionlint; \
    rm -f "/tmp/${file}" /tmp/actionlint /tmp/actionlint_checksums.txt; \
    actionlint --version

# --- gh / GitHub CLI (GitHub release; <name>_checksums.txt) -----------------
RUN set -eux; \
    base="https://github.com/cli/cli/releases/download/v${GH_VERSION}"; \
    file="gh_${GH_VERSION}_linux_amd64.tar.gz"; \
    curl -fsSL "${base}/${file}" -o "/tmp/${file}"; \
    curl -fsSL "${base}/gh_${GH_VERSION}_checksums.txt" -o /tmp/gh_checksums.txt; \
    ( cd /tmp && grep " ${file}\$" gh_checksums.txt | sha256sum -c - ); \
    tar -C /tmp -xzf "/tmp/${file}"; \
    install -m 0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh; \
    rm -rf "/tmp/${file}" "/tmp/gh_${GH_VERSION}_linux_amd64" /tmp/gh_checksums.txt; \
    gh --version

# --- Python linters via pipx (checkov, yamllint, zizmor) --------------------
# pipx runs as root here; root's ~/.local/bin is NOT on the runtime `node`
# user's PATH. Point the shims at /usr/local/bin (already on PATH, world-exec)
# so the agents resolve them. PIPX_HOME holds the per-tool venvs. pipx pins the
# exact version (==) from PyPI; the trailing invoke fails the build if missing.
ENV PIPX_HOME=/opt/pipx \
    PIPX_BIN_DIR=/usr/local/bin
RUN set -eux; \
    pipx install "checkov==${CHECKOV_VERSION}"; \
    pipx install "yamllint==${YAMLLINT_VERSION}"; \
    pipx install "zizmor==${ZIZMOR_VERSION}"; \
    checkov --version; \
    yamllint --version; \
    zizmor --version

# ===========================================================================
# END TOOL LAYER
# ===========================================================================

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
