# OpenNote: the whole project in one file

> A free, pen-first notebook for lectures and problem sets, on the web, Android and Windows.
> Write with a stylus, record the class, recognise handwriting and maths on the device, and paste an
> AI-made visualiser between your pages, where it runs.

| | |
|---|---|
| Live web app | https://opennote-neon-nine.vercel.app |
| Repository | https://github.com/Archemasachika7/opennote (folder on disk: `Projects/strata`, an old name) |
| Latest release | **v0.2.4** (2026-11-11): Android APK + Windows installer on GitHub Releases |
| Built | 2026-11-09 → 2026-11-12: 124 commits, 18 merged pull requests, 5 releases |
| Size | ~20,600 lines of TypeScript/TSX in `src/`, 73 unit test files, 9 end-to-end specs |
| Price | Free, no ads, account optional |

---

## 1. What OpenNote is

OpenNote is a local-first notebook app in the spirit of Goodnotes, Samsung Notes and reMarkable, built for
students who think with a pen. Three ideas set it apart:

1. **Ink first.** Pressure-sensitive pens, a palm gate tuned on a real tablet, lasso editing, and handwriting
   and maths recognition that run on the device.
2. **Live pages.** Copy an interactive HTML, SVG or React artifact from Claude, ChatGPT or Gemini, paste it into
   a notebook, and it runs between your handwritten pages, sandboxed and offline. You can still write on top.
3. **Private by default.** Everything is stored on the device. Sign-in is optional; sync is end-to-end
   encrypted before anything leaves the device, and you can store it in OpenNote's cloud, your own Telegram bot
   or IPFS.

---

## 2. How it was built: timeline

| Date | What happened |
|---|---|
| 2026-11-09 | Project started: React + Vite web core, Dexie storage, ink engine on perfect-freehand, notebooks and pages |
| 2026-11-10 | **PR #1–#5**: "Midnight Studio" UI, accessibility, PWA, shapes engine, free-tool upgrades, lecture audio ink sync, Sarvam AI speech-to-text, landing page, design refresh |
| 2026-11-10 | **PR #7–#8**: sync storage keys (Telegram, Pinata) shared across devices, encrypted in the account, with versioned saves |
| 2026-11-10 | **PR #9–#11**: landing glow-up, Amber Dark theme with flat design, "Get OpenNote" downloads, two launch films kept as rebuildable source |
| 2026-11-10 | **v0.2.0 → v0.2.3**: first releases; one version number everywhere; APKs signed with one key so they update in place (PR #12); sign-in shown in the native apps (PR #13); Windows app no longer goes blank after an update (PR #14) |
| 2026-11-10 | **PR #15**: Blot, the ink-drop companion, with an on/off switch |
| 2026-11-11 | **PR #16**: pinch zoom, live thumbnails, on-device handwriting recognition (TrOCR), Tidy, Beautify pen, move/copy/paste between pages, searchable handwriting. Based on a static analysis of the Samsung S Note 4.1 APK to see what a mature notes app offers |
| 2026-11-11 | Open-source ink engines actually cloned and benchmarked (ink-on/CoMER, Inklus, Quickdraw, Scribl). CoMER adopted for maths (10/10 vs pix2text ~6/10, 7.2 MB vs 118 MB) |
| 2026-11-11 | Palm rejection measured on a Xiaomi Redmi Pad with `adb getevent`: contact sizes for stylus, finger, palm, heel and knuckle, which led to a learned per-device contact width for passive styluses |
| 2026-11-11 | **PR #17 → v0.2.4**: palm gate, CoMER maths, transformers.js 4.3.2, new pens, crop to picture, password-locked notebooks, native Jetpack Ink layer (Ink Lab build), book view with page turns, Chart.js charts, video on pages, web clipping and Android share target, planning templates, Gemini summaries and flashcards, AI keys synced across devices |
| 2026-11-11 | **PR #18**: landing download buttons work from the first click |
| 2026-11-12 | Tablet testing done by the owner; deployed. Phone-width layout re-checked on the live site |

---

## 3. Features

### 3.1 Library (home screen)

- Notebooks, **Whiteboards** and **Study sets** in one library, with filter chips (All, Favourites,
  Whiteboards, Study sets) and grid or list view.
- Folders, favourites, sort (last modified and others), multi-select.
- **Search** across typed notes, live pages and (optionally) handwriting.
- **Trash** with 30-day restore.
- **Import**: `.opennote` backups, PDFs to write on.
- **Password-locked notebooks**: really encrypted (PBKDF2, 600,000 rounds + AES-GCM), not just hidden. Sync
  and backups carry the encrypted copy (`src/store/lock.ts`, `src/library/LockSheet.tsx`).
- Account button (optional sign-in), Settings, command palette (Ctrl+K).

### 3.2 Notebook pages

A notebook mixes three page types:

| Page type | What it does |
|---|---|
| **Ink page** | Handwriting on paper templates, with objects (images, text boxes, shapes, charts, video, tape) |
| **Text page** | TipTap rich text: headings, lists, checklists, tables, colour, highlight, `\alpha` → α maths symbols, outline |
| **Live page** | A pasted HTML / SVG / React artifact running in a sandbox, with a "Write on page" mode for annotating it |

**Paper templates (19)**: Blank, Ruled, College Ruled, Grid, Dot Grid; STEM: Cornell Notes, Isometric 3D, Hex
Chemistry, Engineering Pad, Two-Column Proof, Music Staff, Study Planner, Coordinate Plane; Planning: To-do
List, Meeting Notes, Weekly Planner, Monthly Calendar, Habit Tracker, Storyboard. Light or dark paper.

Other notebook features: bookmarks, outline, go to page, page thumbnails that update live, page options
(duplicate, move, delete), **book view** with a page-turn animation (reduced-motion safe), split screen with
a second notebook, export to PDF or JPG (whole notebook or a page range).

### 3.3 Ink

| Area | Details |
|---|---|
| Pens (10) | Ballpoint, Fountain, Brush, Pencil, Calligraphy, Marker, **Beautify** (smooth thick-and-thin, like Samsung's), Ink brush, Oblique nib, Rainbow |
| Other tools | Highlighter, eraser (partial or whole stroke), lasso, shapes, tape, laser pointer (red, fading trail), text box, image, hand (pan) |
| Saved pens | Save the current pen as a preset chip on the toolbar |
| Shapes | Hold still 0.4 s and a rough circle, line or polygon snaps clean |
| Lasso actions | Move, copy, cut, delete, recolour, **Text** (handwriting → text), **Maths** (handwriting → LaTeX), **Tidy**, Move to page, save or copy as a picture (crop by drawing) |
| Tidy | Straightens lines, evens word size and spacing, fixes slant, smooths wobble; strength slider with a live preview; one undo step |
| Placement | When it's unclear where recognised text or an image should go, a "Where should this go?" picker asks: this page, next page, a new page |
| Zoom | Pinch zoom that is palm-safe; zoom writing window for small handwriting |
| Hover | A stylus hovering shows a ring the size of the nib, in the ink colour |
| Palm rejection | `src/ink/palmGate.ts`: pen-hover and lift grace (350 / 400 ms), palm-sized contacts, "only the pen writes" setting, a hand landing mid-stroke no longer ruins the line, and for passive styluses / finger-only screens a learned contact width (median × 1.35 + 0.8), 3+ touches = palm, spreading contact = palm |
| Native Android ink | Jetpack Ink 1.0.0 layer with a native palm gate (on by default in the Ink Lab build; a setting in the main app) |
| Replay | Replay ink in time with recorded audio |
| Diagnostics | `?debug=palm` and `?debug=latency` overlays |

### 3.4 Objects on pages

Images, text boxes, **charts** (bar, line, pie, doughnut, scatter with Chart.js, edited from a table),
**video**, tape (hide a term; becomes a flashcard), STEM stamps and elements, layers on whiteboards.

### 3.5 Lectures and speech

- **Lecture audio**: record while writing; tap any stroke to jump to that moment in the audio.
- **Transcripts on the device** with Whisper tiny (transformers.js, WebGPU when available, else WebAssembly).
- **Speech-to-text note**: live dictation, plus optional **Sarvam AI** for 11 Indian languages (your own key).

### 3.6 Study

- **Study sets**: flashcards from Tape or the lasso, image occlusion, retention and stability stats.
- Scheduling with **ts-fsrs 6 (FSRS-6)**, with SM-2 as an option and our own minute-level learning steps.
- **AI flashcards** from a page (Gemini).

### 3.7 AI (all optional)

| Feature | Engine | Where it runs |
|---|---|---|
| Handwriting → text, searchable handwriting | TrOCR small handwritten (q8, ~64 MB) | Device (WebGPU encoder, WASM decoder) |
| Handwritten maths → LaTeX | CoMER via ink-on (7.2 MB, bundled) | Device, works offline from first use |
| Lecture transcription | Whisper tiny (~40 MB) | Device |
| Summarise page / notebook, make flashcards | Gemini: **Nano** in Chrome (free, offline) or **cloud Gemini** with your own key; "Auto" picks | Device or Google (only with your key) |
| Indian-language speech | Sarvam AI (your key) | Sarvam |

AI keys are stored encrypted in the account and reach every device you sign in on; they are never sent to
OpenNote's database in plain text. If a saved Gemini model is retired, the app picks the newest Flash model
the key can use.

### 3.8 Live pages

- Detects HTML, SVG or React/JSX from the clipboard ("smart paste").
- Each live page runs in a **sandboxed iframe** with its own origin and a strict Content-Security-Policy; it
  cannot read your notebooks or files.
- **No internet by default**; "Allow internet for this page" is a per-page switch, and pages imported from a
  backup start with it off.
- React is compiled inside the sandbox with a bundled Babel and React, so it works offline.
- "Use page" vs "Write on page" modes; a stylus always writes. A crash guard stops a broken artifact taking
  the app down.

### 3.9 Web clipping

Paste a link or use **Share → OpenNote** on Android and in the installed web app; the page's main text and
images are pulled into a notebook page (`src/clip/`).

### 3.10 Whiteboards

Infinite canvas with a minimap, layers and reusable STEM stamps.

### 3.11 Sync, backup and accounts

- **Backup**: one-file `.opennote` exports you can move between devices.
- **Sign-in (optional)**: Supabase Auth with a 6-digit email code (web, Android, Windows) and Google (web and
  Android).
- **Sync (optional)**: encrypted on the device with WebCrypto AES-GCM from your passphrase, then stored in one
  of: OpenNote cloud (Supabase Storage), **your own Telegram bot**, or **IPFS via Pinata**. The Supabase
  database only keeps an index. Row-level security on every table.
- Shared storage settings use versioned writes so two devices can't overwrite each other.

### 3.12 Companion, look and feel

- **Blot**: a pixel ink-drop mascot that waves, flies and can be dragged; ducks out of the way while you write
  on a phone. Can be turned off.
- **Amber Dark** theme (plus Light and System), flat surfaces, no gradients or glow, amber accent `#f5a524`,
  no purple anywhere (a unit test enforces it).
- Motion with motion/react and shared tokens, respecting reduced motion.
- Keyboard: single-key tools (P pen, H highlighter, L lasso, S shapes, B tape…) and a Ctrl+K command palette.

### 3.13 Landing page

`/#/welcome` ("Overview" in the library): hero with a live handwriting canvas, bento demos, a live artifact
demo, the launch films, and **Get OpenNote** download buttons for Android and Windows.

---

## 4. Screen layouts

### Library

```
┌──────────────────────────────────────────┐
│ OpenNote   Overview                       │
│ [⌘] [👤] [⚙]  [Import]  [New folder]       │
│ [+ New notebook ▾]                         │
│ [🔍 Search notes and live pages        ]   │
│ (All) (Favourites) (Whiteboards) (Study…) →│  ← scrolls sideways on phones
│ [Last modified ▾] [▦][☰]   [☑ Select]      │
│ ┌────────┐ ┌────────┐                      │
│ │ cover  │ │ cover  │   notebook cards     │
│ └────────┘ └────────┘                      │
└──────────────────────────────────── Blot ─┘
```

### Notebook editor

```
Desktop / tablet
┌──────────────────────────────────────────────────────────────────────┐
│ ← ☰ Notebook name │ pen hl eraser lasso shapes tape laser T img hand │
│                   │ pen type · saved pens · colours · widths ·       │
│                   │ ruler chart elements zoom audio speech split book│ ↶ ↷ ⋯
├──────────┬───────────────────────────────────────────────────────────┤
│ sidebar  │                    page 1                                 │
│ thumbs / │                    page 2   (continuous scroll)           │
│ outline  │                    + Add page                             │
└──────────┴──────────────────────────────────────────────── 1 / 2 ────┘

Phone (one fixed row + one scrolling tools row)
┌──────────────────────────────┐
│ ← ☰ Notebook name   ↶ ↷ ⋯    │  fixed: name never shrinks to one letter
│ ✎ ▱ ⌫ ◯ △ ▭ ◎ T 🖼 ✋ → …   │  scrolls sideways
├──────────────────────────────┤
│ 1                        ⋯   │
│ ┌──────────────────────────┐ │
│ │          page            │ │
│ └──────────────────────────┘ │
│        + Add page            │
│ 1 / 1                   Blot │
└──────────────────────────────┘
```

Lasso toolbar: **Text**, **Maths**, **Tidy** with labels; Move / Copy / Cut / Delete icons; everything else
in a labelled **More** menu.

### Other screens

- **Whiteboard**: full-screen canvas, minimap in a corner, layers sheet.
- **Study set**: card stack with reveal and grade buttons, stats.
- **Sheets** (bottom sheets on phones, dialogs on desktop): Account, Settings & Shortcuts, Export, Templates,
  Charts, Clip, AI, Recognise, Lock, Delete.

### Phone-width check (2026-11-12, live site, 390 × 844)

| Screen | Result |
|---|---|
| Landing (`/#/welcome`) | No sideways overflow (page width = viewport width) |
| Library | Fits; filter chips scroll sideways as intended |
| Notebook editor | Fixed top row with name, Undo, Redo and options; tools row scrolls; page fills the width |

---

## 5. Architecture

```
            ┌────────────── React 18 + TypeScript (Vite 8) ──────────────┐
            │ library/  notebook/  ink/  text/  live/  board/  study/     │
            │ charts/   clip/      ai/   io/    landing/  ui/             │
            └───────┬───────────────────┬─────────────────────┬──────────┘
                    │                   │                     │
            store/ (Dexie 4,      ai/*.worker.ts        platform/
            IndexedDB, local      (transformers.js,     web · Capacitor · Tauri
            first)                ONNX in Web Workers)  native ink, share, files
                    │
            sync/ ── crypto (AES-GCM) ── stores: Supabase Storage | Telegram | Pinata
                    └── Supabase Auth + index tables (RLS)
```

### Folder map (`src/`)

| Folder | Holds |
|---|---|
| `ink/` | Stroke model, rendering (`render.ts`: smoothing, pen styles), input and palm gate, lasso and selection, tape, objects, video, ruler, laser, history (undo/redo), replay, Tidy, rasterising strokes for recognition |
| `notebook/` | Notebook view, toolbar, page list and thumbnails, book view, pinch zoom, zoom box, templates, export, insert menu, placement picker, recognise sheet, audio bar, speech note |
| `text/` | TipTap text pages, maths symbol formatting, outline |
| `live/` | Live page runtime: detection, sandbox `srcdoc`, crash guard, vendored React/Babel |
| `board/` | Whiteboard view, viewport, minimap |
| `study/` | Study sets, FSRS and SM-2 scheduling, image occlusion |
| `charts/` | Chart spec, Chart.js rendering, chart sheet |
| `clip/` | Web clipping and the shared-content host |
| `ai/` | Gemini (Nano + cloud), Whisper, TrOCR/CoMER worker, Sarvam, page text extraction |
| `io/` | Backup, PDF import/export, image export, page ranges |
| `store/` | Dexie schema, notebooks, pages, strokes, cards, folders, templates, search, handwriting index, lock |
| `sync/` | Supabase client, auth, encryption, sync engine, storage back ends |
| `platform/` | Web / Capacitor / Tauri adapters, service worker, install prompt, native ink bridge, `crypto.randomUUID` fallback |
| `landing/` | Landing page and demos |
| `ui/` | Design tokens, sheets, menus, toasts, settings, account, command palette, Blot |
| `dev/` | Latency and palm diagnostics overlays |

### Platforms

| Platform | How | Notes |
|---|---|---|
| Web | Vercel, PWA with a service worker | Install from the address bar; Share target in the installed app |
| Android | Capacitor 8, app id `app.opennote.notes` | Native Jetpack Ink layer (Kotlin plugin), share target, Google sign-in deep link `app.opennote.notes://auth-callback` |
| Windows | Tauri 2, NSIS installer | Email-code sign-in (Google redirect can't return to a Tauri origin) |

### Key libraries

React 18, Vite 8, TypeScript 5.9, Dexie 4, perfect-freehand, TipTap 2, motion, lucide-react, pdf.js, pdf-lib,
Chart.js, transformers.js 4.3.2 (one shared ONNX runtime), ink-on (CoMER), ts-fsrs 6, Supabase JS 2,
fflate, qrcode, Capacitor 8, Tauri 2. All runtime dependencies are MIT, Apache-2.0, ISC or OFL (fonts).

---

## 6. Quality and release

| Area | How |
|---|---|
| Unit tests | Vitest + jsdom + fake-indexeddb, 73 files (including "no purple in `src/`" and "no `service_role` in `src/`") |
| End-to-end | Playwright in Chrome, 9 specs |
| Type check | `tsc -b` as part of `npm run build` |
| CI | GitHub Actions **Build apps**: builds the web app, the Android APK (Temurin 21, Gradle) and the Windows installer on every push; a `v*` tag publishes a Release |
| Versioning | One version (`package.json`) drives web, APK `versionName`/`versionCode` and Tauri |
| Real device | Xiaomi Redmi Pad (Android 14) over adb: screenshots, logcat and raw touch capture used for palm tuning |

---

## 7. Decisions worth remembering

| Decision | Why |
|---|---|
| Keep our own ink model and web renderer | No SDK did everything; a comparison of engines confirmed it |
| CoMER for maths, pix2text removed | 10/10 vs ~6/10 on test formulas; 7.2 MB vs 118 MB |
| One ONNX runtime | Vite alias `onnxruntime-web` → transformers' copy; build 92 MB → 64 MB |
| Palm thresholds from Inklus, values only | Inklus is GPL-3.0, so no code was copied |
| Learned contact width on touch-only screens | A fixed 56 px palm size never fired on the Redmi Pad |
| Local-first, account optional | Works offline and signed out; sync is opt-in and encrypted |
| Flat design, amber accent, no purple | Owner's design rule; enforced by a test |

---

## 8. Known limits and ideas for later

- Handwriting recognition reads English only (TrOCR); Hindi and other scripts need another model.
- Native Jetpack Ink not yet tried with a real active stylus (the test tablet has none).
- WebGPU recognition speed-up not measured.
- Not built: quick memo, "ask my notes" chat, Evernote export, rewriting handwriting in your own style.
- Windows installer is not code-signed; the APK is not on the Play Store.
