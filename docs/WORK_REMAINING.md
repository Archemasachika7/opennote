# OpenNote: work remaining

Last updated 2026-11-11 (second pass), on branch `feat/palm-zoom-thumbs-sync`.

This file tracks what is still to do after the S Note comparison and the on-device ink engine work, plus the
open-source libraries worth testing. "Applied" means it is in the app today.

---

## 1. Handwriting beautify: the options

Three ways to do it, simplest first.

### Option A: "Tidy" a lasso selection. **Done** (`src/ink/tidy.ts`)

Keeps the person's own handwriting and fixes how it sits on the page. Reuses the line and word grouping
already written for recognition (`src/ink/rasterize.ts`: `groupLines`, `chunkLine`). No model, no download,
instant, offline.

- **Straighten**: rotate each line so its baseline is level (lines drift uphill or downhill).
- **Even size**: scale each word in a line to the line's median x-height.
- **Fix slant**: measure the average angle of the down-strokes, shear the line upright (or to one
  consistent angle).
- **Even spacing**: make the gaps between words in a line equal.
- **Smooth wobble**: a stronger pass of `smoothInput` (in `src/ink/render.ts`) to remove tremor, keeping
  sharp corners.

UI: a **Tidy** button (sparkles) on the lasso toolbar, a light-to-strong slider with live preview, Apply
or Cancel (Enter / Esc), applied as one undo step. A line that drifts a long way uphill is joined back
into one line before levelling (`joinDriftingLines`), so it doesn't end up as two level halves with a step.

### Option B: a "Beautify" pen (what S Note had). **Done** (Pen type → Beautify; `beautifyInput` in `src/ink/render.ts`)

The S Note 4.1 APK shows Samsung's Beautify is a drawing style, not recognition. Its settings are
`cursive`, `modulation`, `sustenance` and `dummy` (found as `BEAUTIFY_ADVANCE_*` strings in its code).
It redraws each stroke with a nicer thick-and-thin flow as you write.

We can add a pen type that uses heavier smoothing plus the angled-nib width variation already used by the
Calligraphy pen (`calligraphyPath`). Cheap, but it only changes how ink looks; it doesn't fix lines,
size or spacing.

### Option C: recognize, then rewrite in "your" handwriting (research project, not now)

Read the words (TrOCR, already in the app), then regenerate them neatly with a handwriting-synthesis model
primed on a few of the person's samples (Graves-style RNN or a diffusion model).

Downsides: another large model download, slow on phones, recognition mistakes become wrong words, and the
result no longer feels like the person's own writing. Rewriting in a handwriting *font* looks fake.

**Status:** A and B are built. C is still parked.

---

## 2. S Note comparison: what is done and what is left

Source: static analysis of `com.samsung.android.snote_4.1.apk` (sha256 `9c2140c0…`). It ships the Samsung
Pen SDK classes; its pen engine is in Galaxy firmware, not in the APK. "Samsung Notes Installer.exe" turned
out to be Microsoft's signed Store Installer stub (nothing to analyse).

| S Note feature | Status | Where / notes |
|---|---|---|
| Handwriting → text | Done | Lasso **T** button → `RecognizeSheet`; result is placed on the page as a text box |
| Searchable handwriting | Done | Settings → *Search handwriting*, or page menu → *Make handwriting searchable* (`store/inkIndex.ts`) |
| Handwritten maths → LaTeX | Done | Lasso **Σ** button |
| Pen types | Partly | Added Pencil, Calligraphy, Marker, Beautify. Missing: Chinese brush, rainbow ("magic") pen, oblique nib |
| Saved pen presets | Done | Toolbar chips (`notebook/PenPresets.tsx`) |
| Pinch / smart-scale zoom | Done | `notebook/usePinchZoom.ts` |
| Move content between pages | Done | Lasso **Move to page**, Paste bar, "Where should this go?" picker, or drag a selection onto another page (below the last page makes a new one). Recognized text boxes select by looping round the words or tapping them |
| Handwriting beautify | Done | Lasso **Tidy** and the **Beautify** pen (section 1) |
| Pen hover preview (nib size before touching) | Done | A stylus hovering above the page shows a ring the size of the nib, in the ink colour (pen, highlighter, eraser) |
| Crop by drawing around something | To do | Lasso a region and save the pixels as an image object |
| Password-locked notes | To do | Encrypt the notebook locally with a key from a passphrase (the sync code already has the crypto helpers in `sync/crypto.ts`) |
| Page-turn animation | To do (low value) | |
| Charts, video, web clipping, quick memo | To do | Live pages already cover charts and video; built-in tools are missing |
| Evernote export | To do (low value) | |
| Signature verification | Skip | Not useful for a notes app |

---

## 3. Open-source libraries and models

### Applied (in the app today)

| Library / model | Used for | Notes |
|---|---|---|
| [transformers.js](https://github.com/huggingface/transformers.js) 3.8 (`@huggingface/transformers`) | Running all on-device models in Web Workers | |
| Whisper tiny (`onnx-community/whisper-tiny`) | Lecture transcription | ~40 MB, WebGPU when available, else WASM |
| TrOCR small handwritten (`Xenova/trocr-small-handwritten`, q8) | Handwriting → text, handwriting search | ~64 MB. Read 4/4 IAM-style test lines correctly. Quality depends on the rasterizer (tight crop, ~64 px tall, ~3 px dark pen) |
| pix2text MFR (`breezedeus/pix2text-mfr`) | Handwritten maths → LaTeX | ~118 MB. Needs a custom greedy decoding loop and file-name mapping in `ai/inkOcr.worker.ts` because it ships no merged decoder |
| [perfect-freehand](https://github.com/steveruizok/perfect-freehand) | Stroke outlines | Tuned this branch, plus our own input smoothing (`smoothInput`) |
| [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs) 6.0.0 (MIT) | Flashcard scheduling (FSRS-6 model) | **Applied 2026-11-11.** Replaces our own FSRS-4.5 copy in `src/study/fsrs.ts`; same functions, so callers didn't change. Our minute-level learning steps stay ours. FSRS-6 starts cards a bit shorter (first Good ≈ 2 days instead of ≈ 4). Not yet used: its parameter optimizer (needs `@open-spaced-repetition/binding`, a separate install) |
| [Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu) | Running recognition on the graphics chip | **Applied 2026-11-11** in `src/ai/inkOcr.worker.ts`. The image encoder runs on WebGPU; decoders stay 8-bit on WebAssembly. Handwriting fetches the fp16 encoder once (~44 MB more; fp32 ~88 MB if the GPU lacks fp16); maths reuses its existing file. Falls back to WebAssembly if WebGPU is missing, fails to load, or fails on the first run. **Speed-up not yet measured on a real device** |

### Should test or apply next (from the links found)

| Library / model | What it is | Recommendation |
|---|---|---|
| [ink-on](https://www.pkgstats.com/pkg:ink-on) 0.1.0 (Apache-2.0) | Handwritten maths recognition in the browser (CoMER, ECCV 2022) | **Test.** Trained on handwritten maths (CROHME), which pix2text mostly isn't, so it may read real pen maths better. Young library: compare against pix2text on real tablet writing before switching |
| [Moonshine](https://huggingface.co/spaces/webml-community/moonshine-web) | Fast on-device English speech recognition | **Test** as a fast English path; keep Whisper for Hindi and other Indian languages |
| [WebLLM](https://arxiv.org/html/2412.15803v2) / small LLMs on WebGPU ([guide](https://pinggy.io/blog/run_llm_in_browser_webgpu/)) | On-device chat model | **Later, opt-in.** For "ask my notes", summaries and quiz generation. 1–2 GB download; phones are borderline, so detect WebGPU and memory first |
| [PageLM](https://github.com/developGPT/PageLM), [Open Notebook](https://dev.to/andrew-ooo/open-notebook-review-self-hosted-notebooklm-alternative-1210), [Open-NotebookLM](https://gh.r-mj.com/Anecdote-Q/Open-NotebookLM), [KnowNote](https://awesome.ecosyste.ms/projects/github.com%2Fmrsibe%2Fknownote), [more alternatives](https://www.scriptbyai.com/best-open-source-notebooklm-alternatives/) | NotebookLM-style apps | **Ideas, not code.** Chat with sources, auto quizzes, audio overviews. All need an LLM, so they come after the WebLLM decision |
| [RapidLatexOCR ONNX](https://huggingface.co/inYourOwnBrowser/rapid-latex-ocr-onnx) | Formula OCR for the browser | **Skip.** ~179 MB (encoder 89 + decoder 51 + resizer 39) and aimed at printed formulas; pix2text is smaller |
| texify / texify2 ([LiaScript plugin](https://liascript.github.io/blog/lia-canvas-ocr-handwriting-recognition-in-liascript)) | Formula OCR | **Skip.** The ONNX builds are 250–600 MB |

---

## 4. Other open items

- **Real-device testing.** Recognition was tested on handwriting-font ink turned into strokes, not real pen
  writing. Check accuracy, pinch zoom, Move to page and the Paste bar on a tablet with a stylus.
- **Recognition speed.** WebGPU is wired in; measure the before/after on a laptop and a tablet.
- **Tidy and Beautify on real writing.** Tested on generated zigzag "words", not real handwriting. Try them
  on a few pages of real notes, especially cursive and maths (Tidy treats a formula as a line of words).
- **Languages.** TrOCR handwritten is English only. Hindi and other scripts need a different model.
- **Flaky tests.** Mostly fixed 2026-11-11: the whiteboard / study set / demo tests waited only 3 s for lazily
  loaded screens, which a full run on a busy machine can exceed. The shared wait is now 8 s (`vitest.setup.ts`).
  Watch for any that still time out.
- **Commit and release.** Everything on `feat/palm-zoom-thumbs-sync` is uncommitted: pinch zoom, live
  thumbnails, stroke smoothing, SVG/HTML upload, add-page picker, sync delete scopes, Blot animations, new
  pens, presets, ink recognition, move/paste/placement, laser, Tidy, Beautify pen, pen hover ring, ts-fsrs,
  WebGPU recognition.
- **Still to build from section 2:** crop by drawing around something, password-locked notes, Chinese
  brush / rainbow / oblique-nib pens, page-turn animation, charts/web clipping/quick memo, Evernote export.
