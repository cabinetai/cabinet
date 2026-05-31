# Integrations Hub assets

The Integrations Hub (`src/components/settings/integrations-hub-section.tsx`)
references two static assets per catalog entry. Both are optional — the UI
degrades gracefully (gradient backdrop + emoji/brand-color icon from
`integration-icon.tsx`) when a file is missing — but supplying them is what
makes the hub visual-first.

## Required files

For each catalog id (`slack`, `google-workspace`, `discord`):

| File | Spec | Source |
|---|---|---|
| `<id>-bg.webp` | ~1200×480, optimized WebP, **abstract** | AI-generated via the `ai-image-generation` skill (Gemini). Prompt: *"abstract premium soft-gradient hero texture, <brand> palette (#hex …), depth, subtle grain — no text, no logos, no symbols"*. Generated art only; never embed a real logo or wordmark in the backdrop. |
| `<id>-logo.svg` | Crisp vector mark | The vendor's **official brand-assets page** (Slack, Google, Discord brand kits). Do NOT hand-draw or AI-generate brand logos — inaccurate marks are off-brand and an IP risk. Logos are used nominatively to identify the integration. |

## Why the split

- Backdrops are non-infringing original abstract art → safe to generate and commit.
- Logos must be the genuine official mark → obtained from the brand's own kit, used only to identify the service the user is connecting.

Commit the optimized files here; they are referenced by static path (`/integrations/<id>-bg.webp`).
