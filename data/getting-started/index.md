---
title: Getting Started
created: '2026-04-12T00:00:00.000Z'
modified: '2026-04-27T07:31:53.824Z'
tags:
  - guide
  - onboarding
  - files
order: 0
---
# Getting Started with Cabinet

Cabinet is an AI-first knowledge base. Everything lives as files on disk — no database, no cloud lock-in. You write pages in markdown, organize them in a tree, and let AI agents help you edit and maintain the whole thing.

## Editor — Notion-grade writing

The WYSIWYG editor runs on Tiptap. Everything you type roundtrips to plain markdown on disk.

### Headings, lists, and styling

Select any text and the **bubble menu** appears. Use it for **bold**, *italic*, <u>underline</u>, ~strike~, `code`, super<sup>script</sup>, sub<sub>script</sub>, alignment, and links.

### Text color and highlights

Pick text color or background <span style="color: rgb(147, 51, 234);"><mark data-color="#e9d5ff" style="background-color: rgb(233, 213, 255); color: inherit;">highlight</mark></span> from the toolbar or <mark data-color="#fed7aa" style="background-color: rgb(254, 215, 170); color: inherit;">bubble</mark> menu. They roundtrip through markdown as inline HTML.

-   <span style="color: rgb(220, 38, 38);">Red urgency notes</span> for incidents
    
-   <span style="color: rgb(22, 163, 74);">Green confirmations</span> for shipped items
    
-   <mark data-color="#fef08a" style="background-color: rgb(254, 240, 138); color: inherit;">Yellow highlights</mark> for key terms
    
-   <mark data-color="#bfdbfe" style="background-color: rgb(191, 219, 254); color: inherit;">Blue backgrounds</mark> for cross-references
    

### <span style="color: rgb(217, 119, 6);">Images</span> — paste, drop, or URL

Three ways to add an image, all save the file next to this page on disk:

1.  **Paste** a copy-pasted screenshot — it uploads and inserts automatically
    
2.  **Drag & drop** a file from Finder onto the editor
    
3.  Click the **image icon** on the toolbar, or type `/Image`, and use the **Upload** tab or **From URL** tab
    

Hover any image and drag its side handles to resize — the width persists across reloads.

<img class="rounded-lg max-w-full" src="https://runcabinet.com/cabinet-icon.png" alt="Cabinet icon" data-align="center" style="width: 96px;" />

↑ Example: the Cabinet logo inserted via `/Image → From URL`. Hover it in edit mode to see the resize handles.

### Videos and universal embeds

Click the **video icon** on the toolbar or type `/Video` to upload a file or paste a direct video URL. Click the **embed icon** (sparkles) or type `/Embed` for YouTube, X, Vimeo, Loom, TikTok, Spotify, Facebook, Instagram, or any URL — Cabinet auto-detects the provider.

↑ Example: `demo.webm` embedded via `/Video → From URL` with `https://runcabinet.com/demo.webm`.

<div data-embed="true" data-provider="youtube" data-src="https://www.youtube.com/embed/vBJS8-STB8o" data-original-url="https://www.youtube.com/shorts/vBJS8-STB8o" data-aspect-ratio="1.7777777777777777"><iframe src="https://www.youtube.com/embed/vBJS8-STB8o" data-embed-provider="youtube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen loading="lazy" frameborder="0"></iframe></div>

Supported providers when you type `/Embed`:

<table class="border-collapse w-full" style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Provider</p></th><th colspan="1" rowspan="1"><p>Paste a link like…</p></th></tr><tr><td colspan="1" rowspan="1"><p>YouTube</p></td><td colspan="1" rowspan="1"><p><code>https://youtube.com/watch?v=…</code></p></td></tr><tr><td colspan="1" rowspan="1"><p>Vimeo</p></td><td colspan="1" rowspan="1"><p><code>https://vimeo.com/…</code></p></td></tr><tr><td colspan="1" rowspan="1"><p>Loom</p></td><td colspan="1" rowspan="1"><p><code>https://loom.com/share/…</code></p></td></tr><tr><td colspan="1" rowspan="1"><p>X / Twitter</p></td><td colspan="1" rowspan="1"><p><code>https://x.com/user/status/…</code></p></td></tr><tr><td colspan="1" rowspan="1"><p>TikTok</p></td><td colspan="1" rowspan="1"><p><code>https://tiktok.com/@user/video/…</code></p></td></tr><tr><td colspan="1" rowspan="1"><p>Facebook / Instagram</p></td><td colspan="1" rowspan="1"><p>any public post URL</p></td></tr><tr><td colspan="1" rowspan="1"><p>Spotify</p></td><td colspan="1" rowspan="1"><p><code>https://open.spotify.com/track/…</code></p></td></tr><tr><td colspan="1" rowspan="1"><p>Anything else</p></td><td colspan="1" rowspan="1"><p>Falls back to a generic iframe</p></td></tr></tbody></table>

Pasting a recognized URL on an empty line auto-embeds without the popover.

### Slash commands

Press `/` on an empty line to open the command menu, grouped into **Basic**, **Media**, and **Advanced**.

<table class="border-collapse w-full" style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Group</p></th><th colspan="1" rowspan="1"><p>Commands</p></th></tr><tr><td colspan="1" rowspan="1"><p>Basic</p></td><td colspan="1" rowspan="1"><p>Text, H1/H2/H3, Bullet, Numbered, Checklist, Code block, Quote, Divider, Table</p></td></tr><tr><td colspan="1" rowspan="1"><p>Media</p></td><td colspan="1" rowspan="1"><p>Image, Video, Embed, File</p></td></tr><tr><td colspan="1" rowspan="1"><p>Advanced</p></td><td colspan="1" rowspan="1"><p>Callout, Warning, Math, Emoji</p></td></tr></tbody></table>

### Callouts

Use `/Callout` for info blocks and `/Warning` for alerts:

**Tip.** You can drop a file onto an already-open page and it saves straight into the page's directory — no need to move it manually.

**Heads up.** Don't edit files inside `.git`, `.history`, or `.jobs` — Cabinet owns those.

### Math, emoji, checklists

-   Type `/Math` or wrap in `$…$` / `$$…$$` — KaTeX renders inline, e.g., $E = mc^2$
    
-   Type `/Emoji` for a picker, or 🚀 paste unicode directly
    
-   Type `/Checklist` for a task list:
    
-   Edit colors and highlights
    
-   Paste a YouTube link
    
-   Try the drag handle on the left gutter
    

### Drag handle

Hover any block and a ⋮⋮ handle appears in the left margin. Drag it to reorder paragraphs, lists, embeds, or images.

### Wiki-links and mentions

Type `<a data-wiki-link="true" data-page-name="Apps and Repos" href="#page:apps-and-repos" class="wiki-link">Apps and Repos</a>` to link another page (autocompletes the slug). In the right-side AI panel use `@PageName` to attach pages as context for the agent.

### Source mode

Every editor view has a **Source** toggle in the top-right. Click it to see (and edit) the raw markdown that will be written to disk.

## Core Features

-   **WYSIWYG Editor** — rich text with Notion-grade features (see the section above). Auto-saves 500 ms after each keystroke.
    
    *Example:* Select a phrase → pick yellow highlight → keep typing. On disk it's saved as `<mark style="background-color: #fef08a">phrase</mark>`.
    
-   **AI Editor Panel** — right-side chat for editing the current page. `@mention` other pages to pass their content as context.
    
    *Example:* Open a draft, press `Cmd+Shift+A`, type "Tighten the intro using @Brand Voice as reference." The agent edits this page inline.
    
-   **Agent Dashboard** — detached AI runs with live transcripts. Each conversation becomes a row under Agents.
    
    *Example:* Ask an agent to research competitors overnight. Run shows `running → completed` with its full output accessible next morning.
    
-   **Scheduled Jobs** — YAML configs in `/data/.jobs/` fired by cron.
    
    *Example:* `monday-digest.yaml` runs every Monday 09:00, asks Claude to summarize last week's commits, writes the result to `/data/weekly/`.
    
-   **Heartbeats** — recurring agent check-ins defined in `persona.md`. Lightweight "ping the state" runs.
    
    *Example:* A `support` heartbeat every 4 h scans `/data/inbox/` for new tickets and tags urgency.
    
-   **Kanban Tasks** — visit `/tasks`. Cards live in `board.yaml`.
    
    *Example:* Drag a card from **Backlog** to **In Progress** → Cabinet kicks off the linked agent run automatically.
    
-   **Agent-to-Agent Dispatch** — any agent with the **Can dispatch** toggle flipped on (agent detail header) can propose tasks, scheduled runs, and recurring jobs for teammates. Every proposal is queued for one-click human approval with inline **model** / **effort** overrides per row. See [[Delegating Between Agents]] for the full guide.
    
-   **Web Terminal** — `` Cmd+` `` toggles an interactive terminal. Good for focused CLI work.
    
    *Example:* Open the terminal, run `git log --oneline`, paste interesting hashes into a page as references.
    
-   **Search** — `Cmd+K`, full-text across every markdown page, ranked by relevance.
    
    *Example:* Search "ARR target" — jumps straight to the OKR page that mentions it.
    
-   **Version History** — click the clock icon on any page to see git commits, diff them, or one-click restore.
    
    *Example:* Accidentally deleted a section? Restore the commit from 10 minutes ago.
    
-   **Drag & Drop** — reorder pages in the sidebar, drop files onto the editor to upload.
    
    *Example:* Drag a PDF into a folder — it lands as a first-class PDF page in the sidebar.
    
-   **Cabinets** — subdirectories tagged as runtime cabinets get their own agents, jobs, and visibility.
    
    *Example:* `/data/client-acme/` becomes an isolated cabinet with its own agent roster and private views.
    
-   **Office documents** — drop `.docx`, `.xlsx`, or `.pptx` anywhere under `/data` and they render inline. Read-only, with Download and Reveal-in-Finder buttons.
    
    *Example:* Paste `Q2-board-deck.pptx` into a project folder — clicking it opens a slide-by-slide view right in Cabinet, no PowerPoint install needed.
    
-   **Google Workspace pages** — a markdown page with a `google:` frontmatter key becomes a live iframe of a Google Sheet, Slide deck, Doc, or Form.
    
    *Example:* Create a page, add `google: { url: https://docs.google.com/spreadsheets/d/... }` to its frontmatter, and the page opens as the live sheet — click **Open in Google** to edit.
    

## Keyboard Shortcuts

<table class="border-collapse w-full" style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Shortcut</p></th><th colspan="1" rowspan="1"><p>Action</p></th></tr><tr><td colspan="1" rowspan="1"><p><code>Cmd+K</code></p></td><td colspan="1" rowspan="1"><p>Open search</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>Cmd+S</code></p></td><td colspan="1" rowspan="1"><p>Force save</p></td></tr><tr><td colspan="1" rowspan="1"><p>`Cmd+``</p></td><td colspan="1" rowspan="1"><p>Toggle terminal</p></td></tr><tr><td colspan="1" rowspan="1"><p><code>Cmd+Shift+A</code></p></td><td colspan="1" rowspan="1"><p>Toggle AI panel</p></td></tr></tbody></table>

## Sub-pages

-   [[Apps and Repos]] — Embedded apps, full-screen mode, and linked repos
    
-   [[Symlinks and Load Knowledge]] — Direct symlinks, `.cabinet-meta`, `.repo.yaml`, and `CABINET_DATA_DIR`
    
-   [[Delegating Between Agents]] — Agent-to-agent dispatch, `LAUNCH_TASK` / `SCHEDULE_*` proposals, approval panel, per-row model/effort overrides
    

## Supported File Types

Cabinet treats specific file formats as first-class views. Everything else can still live in the KB as an asset linked from a markdown page.

<table class="border-collapse w-full" style="min-width: 100px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Type</p></th><th colspan="1" rowspan="1"><p>Files</p></th><th colspan="1" rowspan="1"><p>How Cabinet shows it</p></th><th colspan="1" rowspan="1"><p>Sidebar icon</p></th></tr><tr><td colspan="1" rowspan="1"><p>Markdown page</p></td><td colspan="1" rowspan="1"><p><code>*.md</code>, <code>index.md</code></p></td><td colspan="1" rowspan="1"><p>WYSIWYG editor with markdown source toggle</p></td><td colspan="1" rowspan="1"><p><span data-lucide="file-text" data-color="gray" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2YjcyODAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIvPjxwYXRoIGQ9Ik0xNCAydjVhMSAxIDAgMCAwIDEgMWg1Ii8+PHBhdGggZD0iTTEwIDlIOCIvPjxwYXRoIGQ9Ik0xNiAxM0g4Ii8+PHBhdGggZD0iTTE2IDE3SDgiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>CSV data</p></td><td colspan="1" rowspan="1"><p><code>*.csv</code></p></td><td colspan="1" rowspan="1"><p>Interactive table editor with source view</p></td><td colspan="1" rowspan="1"><p><span data-lucide="table" data-color="green" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxNmEzNGEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTIgM3YxOCIvPjxyZWN0IHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgeD0iMyIgeT0iMyIgcng9IjIiLz48cGF0aCBkPSJNMyA5aDE4Ii8+PHBhdGggZD0iTTMgMTVoMTgiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>PDF document</p></td><td colspan="1" rowspan="1"><p><code>*.pdf</code></p></td><td colspan="1" rowspan="1"><p>Inline PDF viewer (browser-native)</p></td><td colspan="1" rowspan="1"><p><span data-lucide="file-type" data-color="red" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNkYzI2MjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIvPjxwYXRoIGQ9Ik0xNCAydjVhMSAxIDAgMCAwIDEgMWg1Ii8+PHBhdGggZD0iTTExIDE4aDIiLz48cGF0aCBkPSJNMTIgMTJ2NiIvPjxwYXRoIGQ9Ik05IDEzdi0uNWEuNS41IDAgMCAxIC41LS41aDVhLjUuNSAwIDAgMSAuNS41di41Ii8+PC9zdmc+&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Mermaid diagram</p></td><td colspan="1" rowspan="1"><p><code>*.mermaid</code>, <code>*.mmd</code></p></td><td colspan="1" rowspan="1"><p>Rendered diagram</p></td><td colspan="1" rowspan="1"><p><span data-lucide="git-branch" data-color="violet" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4YjVjZjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTUgNmE5IDkgMCAwIDAtOSA5VjMiLz48Y2lyY2xlIGN4PSIxOCIgY3k9IjYiIHI9IjMiLz48Y2lyY2xlIGN4PSI2IiBjeT0iMTgiIHI9IjMiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Image</p></td><td colspan="1" rowspan="1"><p><code>.png .jpg .jpeg .gif .webp .svg .avif .ico</code></p></td><td colspan="1" rowspan="1"><p>Inline image viewer</p></td><td colspan="1" rowspan="1"><p><span data-lucide="image" data-color="pink" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYzQ4OTkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHg9IjMiIHk9IjMiIHJ4PSIyIiByeT0iMiIvPjxjaXJjbGUgY3g9IjkiIGN5PSI5IiByPSIyIi8+PHBhdGggZD0ibTIxIDE1LTMuMDg2LTMuMDg2YTIgMiAwIDAgMC0yLjgyOCAwTDYgMjEiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Video</p></td><td colspan="1" rowspan="1"><p><code>.mp4 .webm .mov .m4v</code></p></td><td colspan="1" rowspan="1"><p>Inline video player</p></td><td colspan="1" rowspan="1"><p><span data-lucide="video" data-color="cyan" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwNmI2ZDQiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJtMTYgMTMgNS4yMjMgMy40ODJhLjUuNSAwIDAgMCAuNzc3LS40MTZWNy44N2EuNS41IDAgMCAwLS43NTItLjQzMkwxNiAxMC41Ii8+PHJlY3QgeD0iMiIgeT0iNiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjEyIiByeD0iMiIvPjwvc3ZnPg==&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Audio</p></td><td colspan="1" rowspan="1"><p><code>.mp3 .wav .ogg .m4a .aac</code></p></td><td colspan="1" rowspan="1"><p>Inline audio player</p></td><td colspan="1" rowspan="1"><p><span data-lucide="music" data-color="amber" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNkOTc3MDYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAxOFY1bDEyLTJ2MTMiLz48Y2lyY2xlIGN4PSI2IiBjeT0iMTgiIHI9IjMiLz48Y2lyY2xlIGN4PSIxOCIgY3k9IjE2IiByPSIzIi8+PC9zdmc+&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Source code</p></td><td colspan="1" rowspan="1"><p><code>.js .ts .py .go .swift .yaml .json</code> (and more)</p></td><td colspan="1" rowspan="1"><p>Syntax-highlighted viewer</p></td><td colspan="1" rowspan="1"><p><span data-lucide="code" data-color="violet" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4YjVjZjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJtMTYgMTggNi02LTYtNiIvPjxwYXRoIGQ9Im04IDYtNiA2IDYgNiIvPjwvc3ZnPg==&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Embedded website</p></td><td colspan="1" rowspan="1"><p>Directory with <code>index.html</code>, no <code>index.md</code></p></td><td colspan="1" rowspan="1"><p>Iframe in main panel, sidebar visible</p></td><td colspan="1" rowspan="1"><p><span data-lucide="globe" data-color="blue" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzZWIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjxwYXRoIGQ9Ik0xMiAyYTE0LjUgMTQuNSAwIDAgMCAwIDIwIDE0LjUgMTQuNSAwIDAgMCAwLTIwIi8+PHBhdGggZD0iTTIgMTJoMjAiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Full-screen app</p></td><td colspan="1" rowspan="1"><p>Directory with <code>index.html</code> + <code>.app</code> marker</p></td><td colspan="1" rowspan="1"><p>Full-screen iframe, sidebar collapses</p></td><td colspan="1" rowspan="1"><p><span data-lucide="app-window" data-color="green" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxNmEzNGEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIyIiB5PSI0IiB3aWR0aD0iMjAiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHBhdGggZD0iTTEwIDR2NCIvPjxwYXRoIGQ9Ik0yIDhoMjAiLz48cGF0aCBkPSJNNiA0djQiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Directory</p></td><td colspan="1" rowspan="1"><p>Any folder with <code>index.md</code></p></td><td colspan="1" rowspan="1"><p>Expandable tree node in the sidebar</p></td><td colspan="1" rowspan="1"><p><span data-lucide="folder" data-color="gray" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2YjcyODAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgMjBhMiAyIDAgMCAwIDItMlY4YTIgMiAwIDAgMC0yLTJoLTcuOWEyIDIgMCAwIDEtMS42OS0uOUw5LjYgMy45QTIgMiAwIDAgMCA3LjkzIDNINGEyIDIgMCAwIDAtMiAydjEzYTIgMiAwIDAgMCAyIDJaIi8+PC9zdmc+&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Linked Git repo</p></td><td colspan="1" rowspan="1"><p>Directory with <code>.repo.yaml</code></p></td><td colspan="1" rowspan="1"><p>Normal page/folder, repo context for agents</p></td><td colspan="1" rowspan="1"><p><span data-lucide="git-branch" data-color="orange" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYTU4MGMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTUgNmE5IDkgMCAwIDAtOSA5VjMiLz48Y2lyY2xlIGN4PSIxOCIgY3k9IjYiIHI9IjMiLz48Y2lyY2xlIGN4PSI2IiBjeT0iMTgiIHI9IjMiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Linked directory</p></td><td colspan="1" rowspan="1"><p>Symlink without <code>.repo.yaml</code></p></td><td colspan="1" rowspan="1"><p>Normal folder, contents appear as children</p></td><td colspan="1" rowspan="1"><p><span data-lucide="link-2" data-color="blue" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzZWIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNOSAxN0g3QTUgNSAwIDAgMSA3IDdoMiIvPjxwYXRoIGQ9Ik0xNSA3aDJhNSA1IDAgMSAxIDAgMTBoLTIiLz48bGluZSB4MT0iOCIgeDI9IjE2IiB5MT0iMTIiIHkyPSIxMiIvPjwvc3ZnPg==&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Word document</p></td><td colspan="1" rowspan="1"><p><code>.docx</code></p></td><td colspan="1" rowspan="1"><p>Inline read-only render (docx-preview)</p></td><td colspan="1" rowspan="1"><p><span data-lucide="file-text" data-color="blue" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzZWIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIvPjxwYXRoIGQ9Ik0xNCAydjVhMSAxIDAgMCAwIDEgMWg1Ii8+PHBhdGggZD0iTTEwIDlIOCIvPjxwYXRoIGQ9Ik0xNiAxM0g4Ii8+PHBhdGggZD0iTTE2IDE3SDgiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Spreadsheet</p></td><td colspan="1" rowspan="1"><p><code>.xlsx</code>, <code>.xlsm</code></p></td><td colspan="1" rowspan="1"><p>Multi-sheet grid with tabs (SheetJS)</p></td><td colspan="1" rowspan="1"><p><span data-lucide="file-spreadsheet" data-color="green" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxNmEzNGEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIvPjxwYXRoIGQ9Ik0xNCAydjVhMSAxIDAgMCAwIDEgMWg1Ii8+PHBhdGggZD0iTTggMTNoMiIvPjxwYXRoIGQ9Ik0xNCAxM2gyIi8+PHBhdGggZD0iTTggMTdoMiIvPjxwYXRoIGQ9Ik0xNCAxN2gyIi8+PC9zdmc+&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Presentation</p></td><td colspan="1" rowspan="1"><p><code>.pptx</code></p></td><td colspan="1" rowspan="1"><p>Slide-by-slide view (pptx-preview)</p></td><td colspan="1" rowspan="1"><p><span data-lucide="presentation" data-color="orange" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNlYTU4MGMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMiAzaDIwIi8+PHBhdGggZD0iTTIxIDN2MTFhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJWMyIvPjxwYXRoIGQ9Im03IDIxIDUtNSA1IDUiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Google Workspace page</p></td><td colspan="1" rowspan="1"><p><code>*.md</code> with <code>google:</code> frontmatter</p></td><td colspan="1" rowspan="1"><p>Iframe to Sheets / Slides / Docs / Forms</p></td><td colspan="1" rowspan="1"><p><span data-lucide="globe" data-color="blue" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzZWIiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIvPjxwYXRoIGQ9Ik0xMiAyYTE0LjUgMTQuNSAwIDAgMCAwIDIwIDE0LjUgMTQuNSAwIDAgMCAwLTIwIi8+PHBhdGggZD0iTTIgMTJoMjAiLz48L3N2Zz4=&quot;) center center / contain no-repeat;">&nbsp;</span></p></td></tr><tr><td colspan="1" rowspan="1"><p>Legacy office / archive</p></td><td colspan="1" rowspan="1"><p><code>.doc .ppt .xls .odt .rtf .zip .fig .sketch</code> (and more)</p></td><td colspan="1" rowspan="1"><p>Shown in sidebar, opens in Finder</p></td><td colspan="1" rowspan="1"><p><span data-lucide="file" data-color="gray" style="display: inline-block; width: 18px; height: 18px; vertical-align: -4px; background: url(&quot;data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2YjcyODAiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNNiAyMmEyIDIgMCAwIDEtMi0yVjRhMiAyIDAgMCAxIDItMmg4YTIuNCAyLjQgMCAwIDEgMS43MDQuNzA2bDMuNTg4IDMuNTg4QTIuNCAyLjQgMCAwIDEgMjAgOHYxMmEyIDIgMCAwIDEtMiAyeiIvPjxwYXRoIGQ9Ik0xNCAydjVhMSAxIDAgMCAwIDEgMWg1Ii8+PC9zdmc+&quot;) center center / contain no-repeat;">&nbsp;</span></p><div data-embed="true" data-provider="video" data-src="https://runcabinet.com/demo.webm" data-original-url="https://runcabinet.com/demo.webm"><video src="https://runcabinet.com/demo.webm" controls="true"></video></div></td></tr></tbody></table>
