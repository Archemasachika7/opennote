# OpenNote: tech stack and methods

A pen-first, local-first study notebook that runs on the web, Android and Windows
from one TypeScript codebase. This file lists what it is built with and the main
techniques behind each feature.

## Stack at a glance

| Layer | Choice |
| --- | --- |
| Language | TypeScript 5.9 (strict), plus Kotlin/Java on Android and Rust on Windows |
| UI | React 18, Motion 12 for animation, lucide-react icons |
| Build | Vite 8 with `@vitejs/plugin-react` |
| Fonts | Fontsource: Inter, Space Grotesk, JetBrains Mono, Kalam (bundled, no CDN) |
| Ink | perfect-freehand on Canvas 2D, Pointer Events; native `androidx.ink` 1.0 on Android |
| Rich text | TipTap 2 (ProseMirror) with tables, task lists, colour, highlight, underline |
| Storage | Dexie 4 over IndexedDB, local-first |
| PDF | pdf.js 4 (render and import), pdf-lib (export) |
| Charts | Chart.js 4 |
| Spaced repetition | ts-fsrs 6 (FSRS algorithm) |
| On-device AI | `@huggingface/transformers` 4 (ONNX Runtime Web, WebGPU with WASM fallback) |
| Cloud AI (optional) | Google Gemini API, Sarvam AI speech-to-text |
| Sync (optional) | WebCrypto AES-GCM; Supabase, Telegram bot or IPFS via Pinata as storage |
| Backend | Supabase (Postgres, Auth, Storage, versioned SQL migrations), one Vercel function |
| Android | Capacitor 8 (App, Browser, Filesystem, Share) with custom native plugins |
| Windows | Tauri 2, NSIS installer |
| Hosting | Vercel (web app and `api/` serverless function) |
| CI/CD | GitHub Actions: signed APK and Windows installer built on tag |
| Testing | Vitest 5, Testing Library, jsdom, fake-indexeddb, vitest-canvas-mock, Playwright |
| Utilities | fflate (zip for `.opennote` backups), qrcode, html2canvas, Babel Standalone |

## Methods by feature

### Handwriting engine (`src/ink`)

- **Stroke capture:** Pointer Events with pressure and tilt. Points are smoothed
  and turned into variable-width outlines with perfect-freehand, then filled on a
  Canvas 2D layer.
- **Pen types:** ballpoint, fountain, pencil (grain texture), calligraphy and
  marker (chisel nib), highlighter. Saved pen presets recall variant, colour and size.
- **Palm rejection** (`palmGate.ts`): a separate gate runs before any stroke is
  made. It uses pointer type, pen hover, contact size and timing: while a pen is
  near, single-finger touches count as a resting hand; large contacts are always
  palms; cancelled pointers never commit a line. Two-finger pinch still zooms.
- **Native ink on Android:** a Kotlin Capacitor plugin (`NativeInkPlugin.kt`)
  uses Jetpack `androidx.ink` (authoring, brush, strokes) for low-latency stylus input.
- **Editing:** lasso selection, move, rotate, resize, undo/redo history, layers,
  shape recognition and a "tidy" pass, tape (hide and reveal), ruler, laser pointer
  with fading trail, stroke replay.
- **Rasterising:** ink regions are rendered to images for OCR, export and thumbnails.

### Text, live pages and PDF

- **Text pages:** TipTap editor with tables, checklists, colour and LaTeX-style
  symbol input (`\alpha` becomes α).
- **Live pages** (`src/live`): paste HTML, SVG or React code from an AI chat and
  it runs inside a `sandbox="allow-scripts"` iframe via `srcdoc`. JSX is compiled
  in the browser with Babel Standalone; vendored runtimes are copied at build time
  (`scripts/copy-vendor.mjs`) so it works offline. A crash guard catches runaway pages.
- **PDF:** pdf.js renders pages you can write on; pdf-lib writes notebooks or page
  ranges back out to PDF; html2canvas handles JPG export.

### Study tools (`src/study`)

- Flashcards made from tape or lasso selections, plus image occlusion.
- Scheduling with **FSRS** (ts-fsrs): retention and stability stats per card.

### On-device AI (`src/ai`)

- **Transcription:** Whisper (`onnx-community/whisper-tiny`) in a Web Worker
  through transformers.js, WebGPU first, WASM fallback. No audio leaves the device.
- **Handwriting OCR:** TrOCR (`Xenova/trocr-small-handwritten`) in a worker; maths
  OCR with pix2text-mfr using a manual greedy decoding loop.
- **Optional cloud:** Gemini (`gemini-flash-latest`) with the user's own key;
  Sarvam AI for 11 Indian languages via the `api/sarvam-stt.js` Vercel function.

### Storage, backup and sync (`src/store`, `src/io`, `src/sync`)

- **Local-first:** everything is stored in IndexedDB through Dexie; the app works
  fully offline and needs no account. A service worker caches the app shell.
- **Backups:** one-file `.opennote` archives zipped with fflate.
- **End-to-end encryption** (`crypto.ts`):
  - passphrase to master key with PBKDF2-SHA256, 600,000 iterations, random salt;
    the master key is never stored or sent;
  - each blob gets a random AES-GCM-256 data key, wrapped by the master key;
  - each chunk is sealed with its own 12-byte IV and AES-GCM, with
    `opennote:<index>/<count>` as additional data so chunks cannot be reordered.
- **Pluggable stores** (`src/sync/stores`): Supabase Storage, a personal Telegram
  bot, or IPFS through Pinata, behind one router interface. The server only ever
  sees ciphertext. Deletions sync across devices.
- **Supabase:** Postgres tables for profiles, storage index and per-user storage
  settings, with versioned SQL migrations in `supabase/migrations`.

### Platforms and delivery

- **Web:** installable PWA, deployed on Vercel.
- **Android:** Capacitor wraps the web build; native plugins for ink and share
  intents (`ShareIntentPlugin.kt`); signed APK built in CI.
- **Windows:** Tauri 2 shell (Rust) with an NSIS installer.
- **CI** (`.github/workflows/build-apps.yml`): Node, Java and Rust toolchains on
  Ubuntu and Windows runners; the signing key is written for the build and removed
  right after; artefacts are attached to GitHub releases.

### Quality

- Unit and component tests with Vitest and Testing Library on jsdom, with
  fake-indexeddb and a canvas mock.
- End-to-end tests in Chrome with Playwright.
- `npm run build` runs `tsc -b` (type check) before the Vite build.
- Guard tests keep design rules (for example, no decorative gradients) in place.

## Licence

OpenNote is dual-licensed: AGPL-3.0-only for everyone, and a separate commercial
licence from the copyright holder for closed-source or proprietary use. See [LICENSE](../LICENSE) and [LICENSE-COMMERCIAL.md](../LICENSE-COMMERCIAL.md).
