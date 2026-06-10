<p align="center">
  <img src="assets/cabinet-wordmark.svg" alt="cabinet /ˈkab.ɪ.nət/" width="920">
</p>

<p align="center">
  <img src="https://runcabinet.com/demo.gif" alt="Cabinet demo" width="900">
</p>

<h1 align="center">🗄️ Cabinet</h1>

<p align="center">
  <strong>Your knowledge base. Your AI team.</strong><br />
  <sub>🗂️ Files on disk &nbsp;•&nbsp; 📁 AI workspaces &nbsp;•&nbsp; 🧠 Agents with memory</sub>
</p>

<p align="center">
  The AI-first startup OS where everything lives as markdown files on disk. No database. No vendor lock-in. Self-hosted. Your data never leaves your machine.
</p>

<p align="center">
  Built by Hila Shmuel, former Engineering Manager at Apple — now building Cabinet in public, with the open-source community.
</p>

<p align="center">
  <a href="https://x.com/HilaShmuel" target="_blank" rel="noopener noreferrer">@HilaShmuel</a>&nbsp; • &nbsp;
  <a href="https://runcabinet.com" target="_blank" rel="noopener noreferrer">runcabinet.com</a>&nbsp; • &nbsp;
  <a href="mailto:hi@runcabinet.com" target="_blank" rel="noopener noreferrer">hi@runcabinet.com</a>
</p>

<p align="center">
  <a href="https://github.com/hilash/cabinet/stargazers" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/github/stars/hilash/cabinet?style=for-the-badge&logo=github&logoColor=white&label=Star%20the%20vision%20%F0%9F%98%8D%F0%9F%8C%9F&labelColor=4b4b4b&color=f5b301" alt="Star Cabinet on GitHub" valign="middle">
  </a>&nbsp;
  <a href="https://discord.gg/hJa5TRTbTH" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?style=for-the-badge&logo=discord&logoColor=white&labelColor=4b4b4b" alt="Join the Discord" valign="middle">
  </a>&nbsp;
  <a href="https://runcabinet.com/waitlist" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/%F0%9F%97%84%EF%B8%8F%20Cabinet-Cloud%20Waitlist-55c938?style=for-the-badge&labelColor=4b4b4b" alt="Cabinet Cloud Waitlist" valign="middle">
  </a>&nbsp;
  <a href="https://coderabbit.ai" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/coderabbit/prs/github/hilash/cabinet?utm_source=oss&utm_medium=github&utm_campaign=hilash%2Fcabinet&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews" alt="CodeRabbit Pull Request Reviews" valign="middle">
  </a>
</p>

---

## From zero to AI team in 2 minutes

```bash
npx create-cabinet@latest
cd cabinet
npm run dev:all
```

Open [http://localhost:4000](http://localhost:4000). The onboarding wizard builds your custom AI team in 5 questions.

---

## Install, update, uninstall

Cabinet runs entirely through `npx` — no global install needed. The CLI is the [`cabinetai`](https://www.npmjs.com/package/cabinetai) package; `create-cabinet` is a thin wrapper around it.

### Install / create

```bash
npx create-cabinet@latest          # create a cabinet and start it
npx cabinetai create my-startup    # just create, don't start
npx cabinetai run                  # start Cabinet in the current dir
```

On first run, Cabinet downloads the app to `~/.cabinet/app/v{version}/` and installs its dependencies there. Your cabinet directory is just a folder of markdown files — put it anywhere.

### Update

```bash
npx cabinetai update               # check for and install a newer app version
```

The CLI compares your installed app version against `cabinet-release.json` from the latest GitHub Release.

### Uninstall / remove

```bash
npx cabinetai uninstall            # remove cached app versions only
npx cabinetai uninstall --all      # also remove global state + telemetry data
npx cabinetai uninstall --yes      # skip the confirmation prompt
npx cabinetai remove               # alias for uninstall
```

The command prints a summary of what will be deleted and asks for confirmation before doing anything. **Your cabinet directories and their data are never touched — those you'd delete manually.**

`--all` additionally removes the platform-specific telemetry directory:

- macOS: `~/Library/Application Support/cabinet-telemetry/`
- Windows: `%APPDATA%\cabinet-telemetry\`
- Linux: `$XDG_CONFIG_HOME/cabinet/` (falls back to `~/.config/cabinet/`)

To wipe Cabinet completely, run `uninstall --all` and then `rm -rf` your cabinet directories yourself.

See [docs/CABINETAI.md](docs/CABINETAI.md) for the full CLI reference.

---

## The problem

Every time you start a new Claude session, it forgets everything. Your project context, your decisions, your research — gone. Scattered docs in Notion. AI sessions with no memory. Manual copy-paste between tools.

## The solution

One knowledge base. AI agents that remember everything. Scheduled jobs that compound. Your team grows while you sleep.

> If it feels like enterprise workflow software, it's wrong. If it feels like watching a team work, it's right.

---

## Philosophy

Cabinet is built around a few principles that we think matter deeply for the future of AI + data tools:

- **Yours** — Your data stays yours: local, visible, and portable. It’s not trapped inside a particular AI provider’s system with no clean way to get it out. You stay in control of your information.
- **Git everything** — Memory should have history. You should be able to inspect changes, revert mistakes, audit how knowledge evolves, and treat your AI system like the important infrastructure it is.
- **BYOAI** — Bring your own AI. Cabinet should work with Claude, Codex, OpenCode, local models, and whatever comes next, without forcing your knowledge into a single provider’s ecosystem.
- **KISS** — Keep it simple, stupid. AI tools should be understandable, inspectable, and hackable. We prefer plain files, clear behavior, and systems that developers can actually reason about.
- **Security** — We care deeply about security. If AI is going to work with your documents, research, plans, and internal context, the system should minimize surprise, reduce unnecessary exposure, and make trust a design requirement rather than an afterthought.
- **Self-hosted** — If AI is going to hold your context, plans, research, and operating memory, it should run in an environment you control.

## Everything you need. Nothing you don't.

| Feature | What it does |
|---|---|
| **WYSIWYG + Markdown** | Rich text editing with Tiptap. Tables, code blocks, slash commands. |
| **AI Agents** | Each has goals, skills, scheduled jobs. Watch them work like a real team. |
| **Skills** | Browse and install from skills.sh or any GitHub repo. Attach per agent, or `@`-mention in the composer to scope to a single task. |
| **Scheduled Jobs** | Cron-based agent automation. Reddit scout every 6 hours. Weekly reports on Monday. |
| **Embedded HTML Apps** | Drop an `index.html` in any folder — it renders as an iframe. Full-screen mode. |
| **Web Terminal** | Interactive local AI CLI terminal in the browser. Kept for direct sessions, debugging, and future terminal-native features such as tmux-style Cabinet workflows. |
| **File-Based Everything** | No database. Markdown on disk. Your data is always yours, always portable. |
| **Git-Backed History** | Every save auto-commits. Full diff viewer. Restore any page to any point in time. |
| **Missions & Tasks** | Break goals into missions. Track progress with Kanban boards. |
| **Internal Chat** | Built-in team channels. Agents and humans communicate. |
| **Full-Text Search** | Cmd+K instant search across all pages. Fuzzy matching. |
| **PDF & CSV Viewers** | First-class support for PDFs and spreadsheets. |
| **Dark/Light Mode** | Theme toggle. Dark mode by default. |

---

## Ship HTML apps inside your knowledge base

This is the biggest difference between Cabinet and tools like Obsidian or Notion. Drop an `index.html` in any directory — it renders as an embedded app. Full-screen mode with sidebar auto-collapse. AI-generated apps written directly into your KB. Version controlled via git. No build step.

---

## Not another note-taking app

| Feature | Cabinet | Obsidian | Notion |
|---|---|---|---|
| AI agent orchestration | Yes | No | No |
| Scheduled cron jobs | Yes | No | No |
| Embedded HTML apps | Yes | No | No |
| Web terminal | Yes | No | No |
| Self-hosted, files on disk | Yes | Yes | No |
| No database / no lock-in | Yes | Yes | No |
| Git-backed version history | Yes | Via plugin | No |
| WYSIWYG + Markdown | Yes | Yes | Yes |

---

## Hire your AI team in 5 questions

Cabinet ships with 20 pre-built agent templates. Each has a role, recurring jobs, recommended skills, and a workspace in the knowledge base.

| Department | Agents |
|---|---|
| **Leadership** | CEO, COO, CFO, CTO |
| **Product** | Product Manager, UX Designer |
| **Marketing** | Content Marketer, SEO Specialist, Social Media, Growth Marketer, Copywriter |
| **Engineering** | Editor, QA Agent, DevOps Engineer |
| **Sales & Support** | Sales Agent, Customer Success |
| **Analytics** | Data Analyst |
| **Operations** | People Ops, Legal Advisor, Researcher |

---

## How it works

1. **Install & Run** — One command. Next.js + daemon start.
2. **Answer 5 Questions** — Cabinet builds your custom AI team.
3. **Watch Your Team Work** — Agents create missions, write content, scout Reddit, file reports.
4. **Knowledge Compounds** — Every agent run, every edit adds to the KB. Context builds over time.

---

## AI Runtime Today

Cabinet no longer treats the browser terminal as the only way to run AI work.

- **Tasks, jobs, and heartbeats** now run through a provider adapter layer with persisted conversations and transcript-driven live views.
- **Per-run overrides** can choose provider, model, and reasoning effort, while personas and jobs can still inherit defaults.
- **Current defaults** are structured local adapters: `claude_local` for Claude Code and `codex_local` for Codex CLI.
- **The web terminal is staying** as a first-class interactive surface for direct CLI sessions and future terminal-native features such as Cabinet-managed tmux-like workspaces.

---

## Atlas Cloud (BYOAI provider)

<p align="center">
  <a href="https://www.atlascloud.ai/?utm_source=github&utm_medium=link&utm_campaign=cabinet" target="_blank" rel="noopener noreferrer">
    <img src="docs/atlas-cloud-logo.png" alt="Atlas Cloud" width="200">
  </a>
</p>

Cabinet's BYOAI philosophy means you can point it at any model backend you control. [Atlas Cloud](https://www.atlascloud.ai/?utm_source=github&utm_medium=link&utm_campaign=cabinet) is a full-modal AI inference platform that exposes a single OpenAI-compatible API for 300+ curated LLM, image, and video models. You connect once and keep your data, keys, and choice of model entirely in your hands. No vendor lock-in, which is exactly how Cabinet is meant to work.

Because Atlas Cloud speaks the OpenAI protocol, it plugs into Cabinet through the **OpenCode** provider (already one of the built-in CLI runtimes), which routes to any OpenAI-compatible backend. Bring your own Atlas Cloud key and route through it:

```bash
# 1. Install the OpenCode CLI runtime (one of Cabinet's built-in providers)
npm i -g opencode-ai

# 2. Point OpenCode at Atlas Cloud's OpenAI-compatible endpoint.
#    Use your own key from https://www.atlascloud.ai/ and never commit it.
export OPENAI_BASE_URL="https://api.atlascloud.ai/v1"
export OPENAI_API_KEY="your-atlas-cloud-api-key"

# 3. Verify the runtime, then pick OpenCode + an Atlas model in Cabinet's
#    composer (Native/Terminal runtime picker) or Settings -> Providers.
opencode run 'Reply with exactly OK'
```

Your data never leaves a backend you chose, and you can swap models per run using Cabinet's existing provider, model, and effort overrides.

<details>
<summary><strong>Atlas Cloud model catalog</strong> (synced with <a href="https://www.atlascloud.ai/zh/models/list/llm">the official list</a>)</summary>

Reach all of these through the single OpenAI-compatible base URL `https://api.atlascloud.ai/v1`:

**LLMs**

- Anthropic (Claude): `anthropic/claude-haiku-4.5-20251001`, `anthropic/claude-opus-4.8`, `anthropic/claude-sonnet-4.6`
- OpenAI (GPT): `openai/gpt-5.4`, `openai/gpt-5.5`
- Google (Gemini): `google/gemini-3.1-flash-lite`, `google/gemini-3.1-pro-preview`, `google/gemini-3.5-flash`
- Alibaba (Qwen): `Qwen/Qwen3-235B-A22B-Instruct-2507`, `qwen/qwen3-coder-next`, `qwen/qwen3-max-2026-01-23`, `Qwen/Qwen3-Next-80B-A3B-Instruct`, `Qwen/Qwen3-VL-235B-A22B-Instruct`, `qwen/qwen3.6-plus`
- DeepSeek: `deepseek-ai/DeepSeek-V3-0324`, `deepseek-ai/DeepSeek-V3.2-Exp`, `deepseek-ai/deepseek-v4-pro`, `deepseek-ai/deepseek-r1-0528`
- Moonshot (Kimi): `moonshotai/Kimi-K2-Thinking`, `moonshotai/kimi-k2.6`
- Zhipu (GLM): `zai-org/GLM-4.6`, `zai-org/glm-5`, `zai-org/glm-5.1`
- MiniMax: `MiniMaxAI/MiniMax-M2`, `minimaxai/minimax-m2.7`
- xAI: `xai/grok-4.3`
- Kuaishou (KAT): `kwaipilot/kat-coder-pro-v2`

**Image / video (for the multi-modal side of your knowledge base)**

- Text-to-image: `qwen/qwen-image-2.0/text-to-image`, `openai/gpt-image-2/text-to-image`
- Image-to-image: `qwen/qwen-image-2.0/edit`, `openai/gpt-image-2/edit`
- Text-to-video: `bytedance/seedance-2.0-fast/text-to-video`, `google/veo3.1/text-to-video`
- Image-to-video: `bytedance/seedance-2.0-fast/image-to-video`, `google/veo3.1/image-to-video`

For budget-friendly API access, see the Atlas Cloud [coding plan](https://www.atlascloud.ai/console/coding-plan).

</details>

---

## Architecture

```
cabinet/
  src/
    app/api/         -> Next.js API routes
    components/      -> React components (sidebar, editor, agents, jobs, terminal)
    stores/          -> Zustand state management
    lib/             -> Storage, markdown, git, agents, jobs
  server/
    cabinet-daemon.ts -> WebSocket + job scheduler + structured adapters + agent executor
    pty/              -> PTY session module (spawn, Claude lifecycle, ansi)
  data/
    .agents/.library/ -> 20 pre-built agent templates
    getting-started/  -> Default KB page
```

**Tech stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Tiptap, Zustand, xterm.js, node-cron

---

## Requirements

- **Node.js** 22+ (LTS). The repo ships an `.nvmrc` — run `nvm use` to auto-switch. Node 20 still works but produces an `EBADENGINE` warning from a transitive `chevrotain@12` pulled in by mermaid.
- At least one supported CLI provider:
  - **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`)
  - **Codex CLI** (`npm install -g @openai/codex` or `brew install --cask codex`)
- macOS or Linux (Windows via WSL)

## Configuration

```bash
cp .env.example .env.local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `KB_PASSWORD` | _(empty)_ | Password to protect the UI. Leave empty for no auth. |
| `DOMAIN` | `localhost` | Domain for the app. |

## Commands

```bash
npm run dev          # Next.js dev server (port 4000 by default)
npm run dev:daemon   # Unified daemon: structured runs, terminal sessions, WebSockets, scheduler (port 4100 by default)
npm run dev:all      # Both servers
npm run build        # Production build
npm run start        # Production mode (both servers)
```

---

## Ready to build your AI team?

Cabinet is free, open source, and self-hosted. Your data never leaves your machine.

```bash
npx create-cabinet my-startup
```

[Get Started](https://runcabinet.com) | <a href="https://github.com/hilash/cabinet/stargazers" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/github/stars/hilash/cabinet?label=GitHub%20Stars&logo=github&color=f5b301" alt="GitHub Stars" valign="middle"></a>

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for breaking changes, or follow the full release history on the [documentation site](https://runcabinet.com).

## Privacy

Cabinet sends anonymous usage telemetry by default (event counts, versions,
platform — never file contents, paths, prompts, or secrets).

To turn it off, pick one:

```bash
export CABINET_TELEMETRY_DISABLED=1   # env var (any shell session)
```

…or open **Settings → Privacy** and toggle **Send anonymous usage telemetry**
off. To also wipe the local install ID and queue, run
`npx cabinetai uninstall --all`.

See [TELEMETRY.md](TELEMETRY.md) for the full event list, payload schema,
and where data is stored.

## Community

Questions, ideas, feedback, screenshots, wild experiments — bring them to the [Discord](https://discord.gg/hJa5TRTbTH). That’s where the Cabinet community hangs out and where a lot of the product direction gets shaped in real time.

---

## Contributing

Cabinet is moving fast right now. We’d love thoughtful contributors who want to help shape it early.

If you’re thinking about opening a PR, please start by joining the [Discord](https://discord.gg/hJa5TRTbTH) and talking with Hila before coding. Hila is Cabinet’s builder, and that early sync helps us keep the roadmap coherent while the product is still evolving rapidly.

Once the direction is aligned, open your PR on [GitHub](https://github.com/hilash/cabinet). The goal is not gatekeeping — it’s making sure your energy goes into work that has a clear path to landing and shipping.

---

MIT License

---

## Star History

<a href="https://www.star-history.com/?repos=hilash%2Fcabinet&type=date&legend=top-left" target="_blank" rel="noopener noreferrer">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=hilash/cabinet&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=hilash/cabinet&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=hilash/cabinet&type=date&legend=top-left" />
 </picture>
</a>
