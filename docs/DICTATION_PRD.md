# PRD — Voice Dictation (offline whisper.cpp)

**Status:** Planned · **Author:** hilash · **Date:** 2026-05-22
**Driver:** Direct user request — a microphone button on text inputs so users can dictate chats, tasks, and `.md` edits using an offline, free engine (like macOS F5 dictation, but built in and cross-platform).

---

## 1. Summary

Add a **microphone button** to Cabinet's text surfaces so users can speak instead of type. Speech is transcribed **on-device** by an offline [whisper.cpp](https://github.com/ggml-org/whisper.cpp) engine, so dictation is **free, private, and works without a network** after a one-time model download.

Critically, this is **not** a wrapper around the OS's native dictation. macOS and Windows expose **no API to programmatically start** system dictation (it only works passively in whatever field is focused, and we cannot reliably fake the user's configured hotkey). So Cabinet runs its own engine, which gives us a fully controllable, identical experience on macOS, Windows, and Linux: real recording state, a recording animation, language control, and graceful fallbacks.

Scope of this PRD:

1. **Mic button** on the shared composer (`ComposerInput` — chat + task creation + task replies) and on the Tiptap `.md` editor (`KBEditor`).
2. **Offline engine** via whisper.cpp, isolated in an Electron `utilityProcess`, exposed to the renderer over the existing `window.CabinetDesktop` bridge.
3. **Click-to-toggle** interaction (click to start, click or Esc to stop), with a **right-click / long-press helper menu** (language, model, settings, troubleshooting).
4. **First-use explainer popup** (privacy + one-time model download with progress + mic permission) and a **troubleshooting popup** with OS-specific guidance when the mic is blocked or the engine is unavailable.
5. **Settings → Dictation** section (enable, model management, language, insertion options).

## 2. Goals & non-goals

**Goals**
- One-click dictation that **inserts text at the caret** in chat, task composer, and markdown editing.
- **Free + private + offline** — no cloud STT, no per-use cost, audio never leaves the device.
- **Cross-platform parity** (macOS / Windows / Linux), not dependent on each OS's dictation being configured.
- The button is **always present** when the feature is enabled; when it can't work it **teaches the user how to fix it** rather than failing silently.
- **Multilingual**, including RTL (Hebrew) — defaults to the app's i18n locale, with auto-detect and manual override.

**Non-goals (this pass)**
- Triggering or integrating with the OS's native dictation engine (technically not possible to start programmatically — see §1).
- Cloud / API-based transcription (Whisper API, Deepgram, etc.). Free + private is the whole point.
- Voice **commands** ("new line", "delete that", "bold this") — v1 transcribes prose only. Punctuation comes from the model.
- Real-time/streaming partial text. v1 is **batch** (record → stop → transcribe → insert); streaming is a documented phase-2 upgrade.
- Speaker diarization, translation mode, or audio file import/transcription of existing attachments.
- A global, app-wide push-to-talk hotkey (future).

## 3. Decisions (from product Q&A, 2026-05-22)

| Question | Decision |
|---|---|
| Engine | **Offline whisper.cpp** (user named the repo explicitly). Not cloud, not OS-dictation triggering. |
| Node integration | **`smart-whisper`** native addon (accepts `Float32Array` directly, has a model manager), run in an **Electron `utilityProcess`** and surfaced via IPC. Fallbacks: `@kutalia/whisper-node-addon` (Electron prebuilds), or `nodejs-whisper` (CLI wrapper) if the addon ABI fights packaging. |
| Surfaces | **Composer** (`ComposerInput` → chat + task + replies) **and** the **Tiptap `.md` editor**. Not search/small inputs this pass. |
| Trigger | **Click to toggle** (click start, click/Esc stop). |
| Helper menu | **Right-click / long-press** on the mic. |
| Onboarding | **First-use explainer popup** + a **Settings → Dictation** section (user asked for both). |
| Default model | `ggml-base` multilingual (~142 MB), downloaded to `userData` on first use (kept out of the installer). `small` (~466 MB) offered for better non-English / Hebrew accuracy. |

---

## 4. Current state (relevant surfaces)

- **Composer** — `src/components/composer/composer-input.tsx` (`ComposerInput`): a plain auto-resizing `<textarea>` with `ref={composer.textareaRef}`, `dir="auto"`, mention dropdowns, drag-drop + paste uploads. State lives in `src/hooks/use-composer.ts` (`useComposer`: `input`, `textareaRef`, submit logic). Used by **chat**, `cabinet-task-composer.tsx` (task creation), and `tasks/conversation/task-composer-panel.tsx` (task replies). **One integration covers all three.**
- **Markdown editor** — `src/components/editor/editor.tsx` (`KBEditor`): Tiptap/ProseMirror WYSIWYG with a toolbar; extensions in `src/components/editor/extensions.ts`; has a raw-source `<textarea>` fallback (`sourceMode`). Insertion via `editor.chain().focus().insertContent(...)`.
- **Electron** — `electron/main.cjs` (electron-forge, `contextIsolation: true`, `sandbox: false`), preload `electron/preload.cjs` exposes `window.CabinetDesktop` (`platform`, `uninstallApp()`, `getPreferredLanguages()`) via `contextBridge`, and registers `ipcMain.handle(...)` handlers. **No native automation modules, no `globalShortcut` today.**
- **Daemon** — `server/cabinet-daemon.ts` runs structured adapter runs, PTY, scheduler, event bus (separate Node process). *Not* the chosen host for whisper (we use a dedicated `utilityProcess`, see §5), but listed for context.
- **Platform detection** — `src/lib/keys.ts::isMacPlatform()`; `formatShortcut` for key hints; `window.CabinetDesktop.platform` in Electron.
- **Stack constraints** — Next.js 16 + React 19; shadcn/ui on **base-ui** (no `asChild`); Zustand stores; i18n via `en.json` + `fallbackLng` for 38 other locales (`scripts/i18n-translate.mjs`); **no em-dashes in user-facing copy** (`docs/CLAUDE.md` rule #17); append to `PROGRESS.md` after every change.
- **No audio/speech deps** exist yet. Electron `^36`, electron-forge `7.8.x` (DMG + ZIP makers). Prior **hardened-runtime entitlements** pain on the v0.4.x DMGs is the area this feature must not regress.

---

## 5. Architecture & technical approach

```
Renderer (React)                         Electron main            utilityProcess (Node, Electron ABI)
────────────────                         ─────────────            ───────────────────────────────────
MicButton ──click──▶ useDictation
   │  getUserMedia({audio})              ipcMain.handle           smart-whisper (whisper.cpp .node addon)
   │  → AudioContext + AudioWorklet      "dictation:*"   ──fork──▶  • loads ggml model from userData
   │  → Float32 PCM, resampled 16kHz mono     │                      • runs inference off the UI thread
   │  → (v1) accumulate until stop           │ ◀──messages──▶        • returns { text, segments }
   └──IPC via window.CabinetDesktop──────────┘
            .dictation.transcribe(pcm, {language})
   ◀──── { text, segments } ────────────────────────────────────────────────┘
   └─▶ insert at caret:  textarea (composer)  |  editor.commands.insertContent (Tiptap)
```

### 5.1 Engine host
Run whisper.cpp via **`smart-whisper`** inside an **Electron `utilityProcess`** spawned by `electron/main.cjs`:
- `utilityProcess` runs Node under Electron's ABI, so the native addon's prebuilt `.node` (or an `@electron/rebuild` build) matches without separate Node-ABI gymnastics, and **inference never blocks the GUI/main process**.
- The model is loaded once and kept warm (smart-whisper's manager auto-offloads on idle to free RAM).
- The renderer never touches the native module; it talks only to `main`, which relays to the utility process. Keeps `contextIsolation` intact.

> Alternatives if `smart-whisper` prebuilds don't survive packaging: (a) `@kutalia/whisper-node-addon` (advertises Electron-ready prebuilds), (b) `nodejs-whisper` shelling out to the `whisper-cli` binary — but a child binary reintroduces the "executable in Resources must move to Frameworks + be signed" dance, so it's the last resort. The decision is validated in **Phase 0** before any UI work.

### 5.2 Audio capture (no ffmpeg)
- `navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.
- Pipe into a `MediaStreamAudioSourceNode` → **`AudioWorkletNode`** that posts `Float32Array` frames to the main thread.
- **Resample to 16 kHz mono** (the rate whisper expects). The hardware context is usually 44.1/48 kHz; resample with a small linear/polyphase resampler in the worklet, or via an `OfflineAudioContext` pass on stop. No ffmpeg, no temp WAV.
- v1: accumulate frames until stop, then transfer the combined `Float32Array` (as a transferable `ArrayBuffer`) to `main` → utility process. `smart-whisper` accepts `Float32Array` directly, so no WAV encode is needed.
- Guardrails: hard cap recording length (default 5 min) to bound memory; optional silence auto-stop (phase 2).

### 5.3 IPC surface (`window.CabinetDesktop.dictation.*`)
Added in `electron/preload.cjs`, handled in `electron/main.cjs`:

| Method | Purpose |
|---|---|
| `getStatus()` | `{ platformSupported, engineReady, model: { id, installed, sizeBytes }, micPermission }` |
| `ensureModel(modelId)` | Download model if missing; progress streamed via `dictation:model-progress` events |
| `listModels()` / `removeModel(id)` | Manage installed models + report disk usage |
| `transcribe({ pcm, sampleRate, language })` | **(v1, batch)** returns `{ text, segments, durationMs }` |
| `startStream/pushAudio/endStream` | **(phase 2)** streaming; partials via `dictation:partial` events |
| `getMicPermission()` / `requestMicPermission()` | macOS: `systemPreferences.getMediaAccessStatus/askForMediaAccess('microphone')` |
| `openSystemMicSettings()` | Deep-link to the OS microphone privacy pane |

Main also installs `session.setPermissionRequestHandler` to allow `media` for the app origin so getUserMedia can prompt.

### 5.4 Models
- Stored at `app.getPath('userData')/whisper-models/ggml-<id>.bin`; downloaded from `https://huggingface.co/ggml-org/whisper.cpp/resolve/main/ggml-<id>.bin`.
- Download is **resumable**, size-verified (and SHA-checked when feasible), with progress surfaced in the explainer popup and settings.
- Catalog: `tiny` (~75 MB, fastest), **`base` (~142 MB, default, multilingual)**, `small` (~466 MB, best for Hebrew/other languages), `large-v3-turbo` quantized (~1.5 GB, power users). English-only `.en` variants offered as a higher-accuracy option when the chosen language is English.
- Apple Silicon: whisper.cpp Metal acceleration is automatic in the prebuilt; first run may compile a Core ML/Metal cache (note in UX).

### 5.5 Text insertion
- **Composer:** add `insertAtCursor(text)` to `useComposer` — splice into `input` at `selectionStart`/`selectionEnd`, restore caret after the inserted text, re-run autosize, keep the controlled state authoritative. Append a trailing space; preserve existing content and selection semantics. Works with `dir="auto"` so Hebrew output renders RTL automatically.
- **Tiptap:** `editor.chain().focus().insertContentAt(editor.state.selection, text).run()` — plain text into the current block, respecting the current selection. In `sourceMode`, fall back to the same textarea-splice approach.
- Whisper already emits punctuation + capitalization; a setting controls auto-punctuation and the trailing space.

### 5.6 Packaging & signing (the risk area — see §11)
- New dep: `smart-whisper` (+ its prebuilt binaries). Add `@electron/rebuild` to the forge flow; `asarUnpack` the `.node` addon and any bundled whisper libs; exclude the model dir from asar.
- **macOS:** add `NSMicrophoneUsageDescription` to Info.plist; add entitlement `com.apple.security.device.audio-input` alongside the existing `allow-unsigned-executable-memory`, `allow-jit`, `allow-dyld-environment-variables`; sign nested native binaries; notarize. This is the same path that broke v0.4.x — verify in a packaged, signed build before building UI.
- **Windows:** ship the win-x64 prebuild; getUserMedia drives the OS mic prompt. arm64 best-effort.
- **Linux:** prebuild availability varies; if missing at runtime, the feature degrades gracefully (button hidden or disabled with an explanatory tooltip).

---

## 6. Feature specs

### F1 — Mic button & recording lifecycle

**F1.1 Component.** New `src/components/dictation/mic-button.tsx`, driven by a new `src/hooks/use-dictation.ts` state machine:

`idle → requesting-permission → recording → transcribing → idle` (plus `error`, `downloading-model`, `unsupported`).

**F1.2 States & affordances.**
- **idle:** mic glyph (Lucide `Mic`). Tooltip "Dictate" + the toggle hint.
- **recording:** filled/active mic (`Mic` in accent) with a gentle pulsing ring and an optional live input-level meter; a small timer; respects `prefers-reduced-motion` (no pulse, static indicator instead).
- **transcribing:** spinner over the mic; button disabled; "Transcribing…".
- **error / unsupported:** muted mic (`MicOff`) that opens the troubleshooting popup (F5) on click.

**F1.3 Trigger (click-to-toggle).** Click toggles record on/off. **Esc** while recording cancels and discards (no insert). Stopping (click again, or Enter) ends capture → transcribe → insert. Only one dictation session active app-wide at a time.

**F1.4 Placement.**
- Composer: in the action row of `composer-input.tsx`, near attach/send, shown only when dictation is enabled and the platform is supported.
- Tiptap: a toolbar button in the editor toolbar; same enable/support gating.

**F1.5 Accessibility.** `role="button"`, descriptive `aria-label` reflecting state, operable with Enter/Space, visible focus ring, and an `aria-live="polite"` region announcing "Listening" / "Transcribing" / "Inserted". Recording state is not conveyed by color/animation alone.

### F2 — Offline engine integration

**F2.1** Spawn the whisper `utilityProcess` lazily on first transcription; keep warm; tear down on app quit. Surface readiness via `getStatus()`.

**F2.2** `transcribe()` passes the 16 kHz mono `Float32Array` + language; returns text + segments + timing. Errors (model missing, OOM, addon load failure) return typed error codes the renderer maps to F5 messaging.

**F2.3** Inference runs off the UI thread (utility process); the main and renderer stay responsive during long clips.

### F3 — First-use explainer popup

Shown the first time a user clicks the mic (and re-openable from settings/helper menu). New `src/components/dictation/dictation-explainer-dialog.tsx` (base-ui dialog, no `asChild`).

Content (copy without em-dashes):
- Title: "Dictate with your voice".
- Privacy line: "Runs entirely on your device. Your audio never leaves this computer, and there is no cloud cost."
- Download line: "Cabinet downloads a one-time voice model (about 142 MB) so dictation works offline."
- Primary CTA: "Download and enable" → triggers `ensureModel` with a progress bar → then `requestMicPermission()`.
- Secondary: "Not now".
- After success, the mic begins recording immediately (so the click that opened the dialog is honored).

### F4 — Helper menu (right-click / long-press)

New `src/components/dictation/dictation-helper-menu.tsx`. Opens on **right-click** (desktop) or **long-press** (~500 ms, touch/trackpad). Left-click stays the toggle (no conflict).

Items:
- **Language** submenu: Auto-detect (default), the app locale, recent languages, and a searchable full list.
- **Model** quick switch (installed models; "Manage models…" jumps to settings).
- **Microphone** submenu: input device picker (optional, phase 2).
- **Dictation settings…** → opens F6.
- **Help / troubleshooting…** → opens F5.

### F5 — Troubleshooting / configuration popup

Reuses the explainer dialog shell with a diagnostic body, opened when the mic is blocked, the platform is unsupported, or the engine fails. OS-aware steps:
- **Mic blocked (macOS):** "Open System Settings ▸ Privacy & Security ▸ Microphone and enable Cabinet." + button calling `openSystemMicSettings()` + "Try again".
- **Mic blocked (Windows):** "Open Settings ▸ Privacy ▸ Microphone and allow desktop apps." + deep-link + retry.
- **Model failed/incomplete:** offer re-download (resume) + a fallback to a smaller model.
- **Unsupported platform / engine missing:** explain dictation isn't available on this build and (where relevant) that the OS's own dictation still works in any text field.

This is the user's "popup showing how to configure it" requirement.

### F6 — Settings → Dictation

New `src/components/settings/dictation-settings.tsx`, wired into `settings-page.tsx`.

- **Enable dictation** toggle (master switch; hides the mic buttons when off).
- **Engine status:** platform supported, engine ready, model installed, whisper.cpp/addon version.
- **Models:** picker (tiny / base / small / large-turbo, with `.en` variants for English), per-model **Download / Remove**, sizes, total disk usage, and the model storage path (copyable).
- **Default language:** Auto-detect / specific (defaults to the app i18n locale).
- **Insertion:** auto-punctuation on/off, trailing space on/off.
- **Microphone device** selector (optional).
- **Re-show the intro popup** + a one-line privacy statement linking to §10.
- (Future placeholder) global push-to-talk hotkey.

### F7 — Surface integration

- **Composer:** mount `MicButton` in `composer-input.tsx`; insertion via the new `useComposer.insertAtCursor`. Covers chat, task creation, and task replies in one place.
- **Tiptap:** toolbar `MicButton`; insertion via `insertContentAt`; source-mode handled.
- Both gate on enable + platform support; both keep `dir="auto"` so RTL transcripts render correctly.

---

## 7. UX flows

**First dictation (happy path):** click mic → explainer popup → "Download and enable" → progress → mic permission granted → recording starts (pulsing) → user speaks → click mic / Enter → "Transcribing…" → text inserted at caret with a trailing space → idle.

**Returning user:** click mic → recording immediately → speak → stop → insert. (No popup; model warm.)

**Mic denied:** click mic → permission prompt denied → troubleshooting popup with OS steps + "Open settings" + "Try again".

**Cancel:** during recording, press Esc → discard, nothing inserted, back to idle.

**Language override:** right-click mic → Language → Hebrew → next session transcribes Hebrew (RTL renders automatically).

## 8. Privacy & security (§10 anchor)

- **On-device only.** Audio is captured, resampled, transcribed locally, and the buffer is released immediately after transcription. **No audio is written to disk** (except behind an explicit debug flag) and **no audio or transcript is sent to any server.**
- **Only network call:** the one-time model download from Hugging Face (`huggingface.co/ggml-org/whisper.cpp`). Documented in the explainer and settings. After that, dictation works fully offline.
- **No telemetry of content.** If telemetry is added (see §12), events carry counts/durations/model/lang only, never audio or transcribed text, consistent with `docs/TELEMETRY.md`.
- Respects path-traversal and storage rules for the model directory (under `userData`, validated).

## 9. i18n

- All new strings go in a new **`dictation`** namespace in `src/i18n/locales/en.json`, wired with `t()`. `fallbackLng` covers the other 38 locales until `scripts/i18n-translate.mjs` runs (tracked as follow-up, consistent with prior incremental i18n passes).
- No em-dashes in any user-facing string (rule #17). Helper-menu, popups, settings, tooltips, and aria labels all localized.
- Dictation **default language** initializes from the active i18n locale.

## 10. Performance & quality targets

- A 10 s clip on `base` (Apple Silicon) transcribes in roughly 2 to 3 s; UI stays responsive throughout (utility process).
- Memory bounded by the recording cap; model auto-offloads on idle.
- Insertion preserves caret position and existing content; no layout jump beyond normal autosize.

## 11. Risks & mitigations

1. **Native addon ABI + macOS hardened-runtime signing/notarization** (same area as the v0.4.x DMG breakage). → De-risk in **Phase 0** with a packaged, signed build; use `utilityProcess` + `@electron/rebuild`/prebuilds + `asarUnpack`; keep the entitlements set complete.
2. **Microphone entitlement / Info.plist.** Missing `NSMicrophoneUsageDescription` or `com.apple.security.device.audio-input` => hard crash on first record in the packaged app. → Added and tested in Phase 0.
3. **Model size / first-run UX.** 142 MB download. → Out of installer, resumable, clear progress, smaller-model fallback.
4. **Accuracy for Hebrew / non-English on `base`.** → Offer `small` in settings and the helper menu; default language from locale.
5. **Linux/arm prebuild gaps.** → Graceful degrade (hide/disable with tooltip); the OS's own dictation still works in fields.
6. **utilityProcess RAM.** → Lazy spawn, idle offload, single warm model.

## 12. Telemetry (optional, privacy-safe)

Per `docs/TELEMETRY.md`, optional events: `dictation_model_downloaded` (id, sizeMs), `dictation_started` (model, lang), `dictation_completed` (durationMs, charCount, model, lang), `dictation_error` (code). **Never** audio or transcript text.

## 13. Phasing

1. **Phase 0 — Spike / de-risk (no UI).** `smart-whisper` in a `utilityProcess`, transcribe a fixed clip; **package a signed macOS build** and confirm it runs with the mic entitlement + hardened runtime. Go/no-go on the engine + packaging strategy.
2. **Phase 1 — Core dictation in the composer.** `use-dictation` hook + `MicButton` + audio capture + IPC + batch transcribe + `useComposer.insertAtCursor`. Toggle + recording/transcribing states.
3. **Phase 2 — Onboarding & permissions.** First-use explainer popup + model download with progress + mic-permission troubleshooting popup (F3, F5).
4. **Phase 3 — Settings.** Settings → Dictation (F6): model management, language, insertion options.
5. **Phase 4 — Markdown editor.** Tiptap toolbar integration (F7 editor half).
6. **Phase 5 — Helper menu.** Right-click / long-press menu (F4) + quick language switch.
7. **Phase 6 — Polish & i18n pass.** Accessibility audit, reduced-motion, telemetry (optional), and `i18n:translate` across all locales.

Each phase keeps `npm run lint` + `tsc --noEmit` green and appends to `PROGRESS.md`.

## 14. Acceptance criteria

- A user with no prior setup can click the mic, accept the one-time download + mic prompt, speak, and see accurate text inserted at the caret in chat, task composer, and the `.md` editor.
- Dictation works with the network disconnected after the model is installed.
- Denying the mic shows OS-specific guidance, not a silent failure.
- Esc cancels cleanly; click-toggle starts/stops reliably; only one session at a time.
- Right-click / long-press opens the helper menu; left-click never accidentally opens it.
- Hebrew dictation produces RTL text rendered correctly.
- A packaged, signed macOS build runs the engine without crashing (no entitlement/notarization regressions).
- No audio or transcript leaves the device; the only network call is the model download.

## 15. Future / open

- **Streaming partial text** (live transcription as you speak) via chunked audio + `dictation:partial` events.
- **Global push-to-talk hotkey** (`globalShortcut`) to dictate into the focused surface from anywhere.
- **Voice commands** ("new line", "send", "scratch that").
- **Transcribe existing audio attachments** in the KB.
- **Per-surface insert modes** (e.g., dictate into a quote block).
- **Translation mode** (whisper can translate to English).
- Translating the `dictation` namespace into all locales.
