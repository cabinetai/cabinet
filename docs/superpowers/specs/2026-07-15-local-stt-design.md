# Local Speech-to-Text (Voice Input) — Design

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Scope:** Phase 1 of local voice for Cabinet — speech-to-text only. TTS (Phase 2) and hands-free VAD (Phase 3) are out of scope but informed the engine choice.

## Goal

Let users dictate into any Cabinet composer via a mic button. Transcription runs 100% locally — no audio ever leaves the machine — consistent with Cabinet's local-first promise.

## Decisions

| Decision | Choice |
| --- | --- |
| Interaction | Click mic to start, click again (or Esc) to stop. Transcript inserted into composer at cursor for editing — no auto-submit. |
| Engine | `sherpa-onnx-node` (npm native addon) running in the Next.js server process. Prebuilt for darwin/linux/win × x64/arm64 — no binaries to build or host. Also provides TTS + Silero VAD for later phases. |
| Default model | Whisper **base.en** (ONNX, ~75 MB) from sherpa-onnx Hugging Face releases. tiny.en / small.en / large-v3-turbo (multilingual) installable from settings. |
| Install UX | Auto-install on first mic click: inline popover confirms the one-time model download with progress, then starts recording. Settings card manages models afterward. |
| Availability | Local tier only — hidden when `useIsCloud()` is true or `getUserMedia` is unavailable. |

### Alternatives rejected

- **whisper.cpp `whisper-server` sidecar** (CLIProxyRuntime pattern): official releases ship prebuilt binaries for Linux/Windows only (v1.9.1 assets verified) — macOS gets only an xcframework, so Cabinet would have to build and host darwin binaries indefinitely.
- **Browser-side transformers.js/WebGPU**: zero backend work, but per-origin model cache, variable performance, and not reusable by the daemon/Telegram surfaces later.

## Architecture & data flow

```
ComposerInput (mic button)
  └─ MediaRecorder → decode + resample to 16 kHz mono PCM (OfflineAudioContext, in browser)
       └─ POST /api/speech/transcribe  (WAV body)
            └─ SpeechRuntime (src/lib/speech/) — sherpa-onnx OfflineRecognizer,
               lazy-loaded singleton, model kept warm after first use
                 └─ JSON { text } → inserted into composer at the cursor position
```

- **Audio conversion in the browser.** sherpa-onnx consumes raw 16 kHz mono PCM; MediaRecorder produces webm/opus. The client decodes its own recording with `OfflineAudioContext` and posts a WAV — no ffmpeg or other server-side decoder.
- **Model storage:** `CABINET_INTERNAL_DIR/speech/models/<model-id>/` plus an `install.json` manifest — same convention as the CLI-proxy runtime.
- **Lazy engine:** nothing loads at boot. First transcribe request loads the active model and keeps it in memory; requests are serialized through the singleton.
- **API routes** (regenerate `server/http/route-manifest.ts` via `npm run api:manifest` after adding):
  - `POST /api/speech/transcribe` — WAV in, `{ text }` out. `409` if no model installed, `400` on malformed audio.
  - `GET /api/speech/status` — engine availability, installed models, active model, `engineError` if the native addon failed to load.
  - `POST /api/speech/install` — body `{ modelId }`, streams download progress (SSE pattern from `conversations/events`).
  - `POST /api/speech/uninstall` — body `{ modelId }`.

## Components

| File | Role |
| --- | --- |
| `src/components/composer/mic-button.tsx` | Mic toggle rendered inside `ComposerInput` next to `AttachmentPickerButton` (all composer surfaces get it for free); recording/transcribing visuals; first-use install popover |
| `src/hooks/use-voice-input.ts` | MediaRecorder lifecycle, decode/resample, POST; returns `{ state, start, stop, error }` |
| `src/lib/speech/speech-runtime.ts` | Model registry (id → HF URL, size, language), download with `.tmp`-then-rename, install manifest, sherpa-onnx recognizer singleton, transcribe queue |
| `src/app/api/speech/{transcribe,status,install,uninstall}/route.ts` | API surface |
| `src/components/settings/voice-card.tsx` | Settings card modeled on `cli-proxy-connector-card.tsx`: installed-models list with download/delete, active-model picker, test-mic row; registered in `settings-page.tsx` |

**Mic button states:** idle → recording (red/pulsing, Esc stops) → transcribing (spinner) → idle with transcript inserted at the cursor position and focus returned to the textarea.

**State management:** recording state local to the hook; install/model status fetched from `/api/speech/status`. No new Zustand store in Phase 1.

## Error handling

- **Mic permission denied** → toast pointing to browser/OS mic settings; button returns to idle.
- **Download failure/interruption** → `.tmp` download path renamed only on completion (no corrupt installs); retry in the popover. Uninstall deletes the model dir + manifest entry.
- **Native addon load failure** (library-path wrinkle in packaged Electron builds) → status reports `engineError`; mic button hides; VoiceCard shows the diagnostic. Implementation must set the addon's dynamic-library path env before first `require` and verify in the packaged app.
- **Silence/empty transcript** → toast ("Didn't catch anything"), nothing inserted.
- **Recording cap** → hard stop at 5 minutes, visible countdown in the last 30 s.
- **Concurrency** → transcriptions queue through the singleton; UI permits one recording at a time.

## Testing

- `test/speech-runtime.test.ts` (modeled on `test/cli-proxy-runtime.test.ts`): model registry URL resolution, install-manifest read/write, install/uninstall directory layout, WAV header parsing → PCM floats. Recognizer mocked — no model download in CI.
- Route test for `/api/speech/transcribe` with runtime mocked: happy path, `409` not-installed, `400` malformed audio.
- Manual end-to-end: dictation in dev **and** in the packaged Electron app (where native-addon and mic-permission risks actually live) before completion.

## Future phases (context only)

- **Phase 2 — TTS:** Kokoro-82M via the same sherpa-onnx runtime; speaker toggle on agent turns in `turn-block.tsx`; audio returned as binary `Response` (assets-route pattern).
- **Phase 3 — hands-free:** Silero VAD (also in sherpa-onnx) for auto-stop listening.
