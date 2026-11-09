# Strata — Design Spec (v1)

**Date:** 2026-11-09 · **Status:** Draft for review · **Working name:** Strata (rename freely)

## 1. Intent

A digital notebook in the spirit of Goodnotes where a notebook is an ordered
stack of pages, and any page can be one of three kinds:

| Kind | What it is |
|---|---|
| **Ink** | Handwriting/drawing on a paper template (blank, ruled, grid, dot) |
| **Text** | Typed rich-text page (headings, lists, code, checklists) |
| **HTML** | A live, interactive HTML visualiser (single `.html` file) running inside the page |

HTML pages sit **between** normal pages, in the same scroll, same thumbnails,
same export. Ink, Text and HTML pages can all be annotated with the pen.

**Who:** the user (student/STEM) first; architecture must allow public release.

**Success criteria (v1):**
1. Create a notebook, insert Ink / Text / HTML pages at any position, reorder, delete.
2. Pen ink feels immediate: input-to-pixel latency target ≤ 25 ms on a mid-range Android tablet.
3. An HTML visualiser pasted or imported as a file runs, is interactive, and cannot read or modify app data.
4. Everything works offline; nothing is lost on reload or app kill.
5. Same codebase ships as: web PWA, Android APK (phone + tablet), Windows installer.
6. Export a notebook to a portable `.strata` file and to PDF; import `.strata` back.

**Explicit non-goals (v1):** payments, accounts, cloud sync, collaboration,
AI features, handwriting recognition, shape auto-correct, iOS build,
multi-file HTML bundles, PDF import/annotation. (Each is a later spec.)

## 2. Evidence that informed the architecture

Static inspection of Goodnotes Android packages in `Downloads` (v1.0.32 APK,
v2.0.12 APKM; no code decompiled or reused):

- Manifest declares a **Trusted Web Activity** shell (`twa.GoodnotesLauncherActivity`,
  `DelegationService`, `WebViewFallbackActivity`, `web_manifest_url`).
- Native arm64 split is **40 KB**: the editor is a web app, not native Android.
- Conclusion (inference): one web codebase + thin platform shells is a proven
  path for this product category. We adopt the same shape.

## 3. Architecture

```
                 ┌───────────────────────────────────────────┐
                 │          Strata web app (one codebase)     │
                 │  React + TypeScript + Vite                 │
                 │                                            │
                 │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
                 │  │ Library │ │ Notebook │ │ Page views  │  │
                 │  │  view   │ │  shell   │ │ Ink│Text│HTML│  │
                 │  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
                 │       └───────────┼──────────────┘         │
                 │           ┌───────▼────────┐               │
                 │           │  Store (Dexie) │──► IndexedDB  │
                 │           └───────┬────────┘   (+ blobs)   │
                 │           ┌───────▼────────┐               │
                 │           │ Platform port  │ save/open file│
                 │           └───────┬────────┘ share, persist│
                 └───────────────────┼────────────────────────┘
              ┌──────────────────────┼─────────────────────────┐
              ▼                      ▼                         ▼
        Web / PWA            Android (Capacitor)      Windows (Tauri v2, WebView2)
        Vercel static        APK, offline,            NSIS/MSIX installer,
        service worker       bundled assets           .strata file association
```

### 3.1 Platform shells: decisions & trade-offs

| Target | Choice | Why | Rejected alternative |
|---|---|---|---|
| Web | Static PWA (Vite + `vite-plugin-pwa`), hosted on Vercel | Free, offline via service worker, installable | none |
| Android phone/tablet | **Capacitor 8** | Assets bundled in APK → fully offline, works without owning a domain, native file save/share plugins | **TWA** (Goodnotes' route): needs a hosted domain + Digital Asset Links, depends on Chrome being installed, weaker file access |
| Windows | **Tauri v2** | ~10 MB installer, uses system WebView2 (Chromium, same engine as Android), native file dialogs, file associations | Electron (150 MB+); plain PWA install (no file association, weaker file access) |

All three run Chromium-family engines → one rendering/input behaviour to tune.
A **Platform port** interface (`saveFile`, `openFile`, `share`, `requestPersistentStorage`)
has one implementation per shell; app code never imports Capacitor/Tauri directly.

### 3.2 Units (each independently testable)

| Unit | Responsibility | Depends on |
|---|---|---|
| `store/` | Dexie schema, CRUD, page ordering, migrations | IndexedDB |
| `ink/` | Pointer capture, stroke model, rendering, tools, undo | Canvas 2D, `perfect-freehand` |
| `text/` | Rich-text page editor | TipTap (ProseMirror) |
| `htmlpage/` | Sandboxed iframe host, snapshotting, lifecycle | DOM only |
| `notebook/` | Scroll of pages, virtualization, thumbnail sidebar, insert-between | above |
| `library/` | Notebook grid, create/rename/delete, search | `store/` |
| `io/` | `.strata` export/import, PDF export | `store/`, `jszip`, `pdf-lib` |
| `platform/` | Web / Capacitor / Tauri adapters | shells |
| `ui/` | Design tokens + primitives (Direction B) | none |

## 4. Data model

```ts
Notebook { id, title, coverColor, paper: 'dark'|'light', createdAt, updatedAt,
           pageIds: string[] }            // order lives here; insert-between = splice

Page     { id, notebookId, kind: 'ink'|'text'|'html', createdAt, updatedAt,
           size: { w: 1404, h: 1872 } }   // logical units, A4-ish portrait

InkPage  extends Page { template: 'blank'|'ruled'|'grid'|'dot' }
TextPage extends Page { doc: ProseMirrorJSON }
HtmlPage extends Page { title, source: string /* ≤ 5 MB */, height: number,
                        allowNetwork: boolean, snapshotBlobId?: string }

StrokeSet { pageId, strokes: Stroke[] }   // separate table: ink loads lazily
Stroke    { id, tool: 'pen'|'highlighter', color, width,
            points: Float32Array /* x,y,pressure,t interleaved */ }
Blob      { id, data: Blob }              // snapshots, thumbnails
```

Any page kind may have a `StrokeSet` → annotation layer on Text and HTML pages too.

## 5. Key flows

**Insert page between pages:** hover/long-press the gap between two thumbnails
(or a page's "+" menu) → choose Ink / Text / HTML → `pageIds.splice(i, 0, newId)`.
The HTML choice offers: *Paste code* · *Import .html file* · *Drag & drop*.

**Ink input:** `pointerdown` on canvas → `setPointerCapture` → read
`getCoalescedEvents()` for full-rate points and `getPredictedEvents()` for the
live tail → draw on a **wet** canvas (`desynchronized: true`) → on `pointerup`
commit the stroke to the **dry** canvas and the store. Palm rejection: once a `pen`
pointer is seen, `touch` pointers never draw; touch = scroll / pinch-zoom.

**HTML page interaction (signature feature):**
- Pen → annotates over the visualiser (ink layer on top captures `pen` only).
- Finger / mouse → passes through to the visualiser.
- Desktop without a pen: toolbar toggle *Interact ⇄ Annotate*.

## 6. HTML sandbox (security boundary)

- Rendered via `<iframe sandbox="allow-scripts" srcdoc=…>` with **no `allow-same-origin`**:
  the page gets an opaque origin, so it cannot read IndexedDB, cookies, or the parent DOM.
- No `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`.
- An injected CSP `<meta>`:
  - `allowNetwork=false` (default): `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:`
  - `allowNetwork=true` (per-page toggle, needed for CDN libraries like d3/three):
    adds `https:` to script/style/img/font/connect sources.
- Parent ↔ iframe communication: one message only in v1 (the frame reports its
  content height via `postMessage`, validated by `event.source`).
- Known, accepted limit: a network-enabled visualiser can make outbound
  requests; it still cannot access notebook data.

## 7. Load & performance budget

**Assumed heavy user:** 100 notebooks × 150 pages = 15,000 pages; 10% HTML.

| Item | Estimate | Total |
|---|---|---|
| Ink page (avg 150 KB; dense page 2,000 strokes × 80 pts × 16 B ≈ 2.5 MB) | 13,500 pages | **~2 GB** realistic |
| HTML page source | avg 50 KB, cap 5 MB | ~75 MB |
| Snapshots/thumbnails (WebP) | ~40 KB each | ~600 MB |

Mitigations: `navigator.storage.persist()` on first save; storage meter in Settings;
strokes stored per page and loaded lazily; thumbnails generated once and cached.

**Runtime budgets:**
- Ink latency ≤ 25 ms (dev overlay compares event timestamp to frame time).
- Page virtualization: only visible ±1 pages mounted. **Max 2 live HTML iframes**;
  others show their snapshot image with a "Run" affordance (each iframe ≈ 20–80 MB on tablets).
- Dry-canvas redraw of a 2,000-stroke page ≤ 100 ms (Path2D cache per stroke).
- Cold start to library ≤ 1.5 s on mid-range Android.

**Server load:** none. Static hosting only; no backend in v1.

## 8. Error handling

- Writes are IndexedDB transactions; a stroke commits on `pointerup` (max loss: one in-progress stroke).
- Quota exceeded → blocking banner with storage meter + "Export & free space".
- An HTML page that throws or hangs stays isolated in its iframe; the page shows "Stop / Reload visualiser". Height messages clamped to 200–20,000 units.
- Malformed `.strata` import → validated against schema version; rejected with a readable reason, nothing partially written.
- Schema migrations via Dexie versioning; export format carries `formatVersion`.

## 9. Visual design: Direction B "Midnight Studio"

Principles (no "AI slop"): no decorative gradients, no glassmorphism, no emoji
icons, no stock illustrations, no centered hero blobs. Dense and calm, like a pro tool.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#121318` | App chrome |
| `--surface` | `#1A1C23` | Sidebars, toolbars |
| `--page-dark` | `#1E2028` | Default dark paper |
| `--page-light` | `#F3F1EC` | Optional light paper |
| `--line` | `#2A2D37` | Hairlines, template rules |
| `--text` / `--text-dim` | `#E8E9EE` / `#9A9DAB` | Type |
| `--accent` | `#7C5CFF` | Selection, primary actions (sparingly) |
| `--live` | `#3DDC97` | HTML-page indicator only: the brand signature |

- Type: **Space Grotesk** (titles), **Inter** (UI), **JetBrains Mono** (code/HTML).
- Icons: Lucide, 1.5 px stroke. Radius 6 px. 4/8 px spacing grid.
- Live HTML pages: 2 px `--live` left edge + mono "LIVE" tag on the thumbnail.
- Ink palette tuned for dark paper (contrast ≥ 4.5:1 on `--page-dark`); switching paper swaps the palette.
- A light UI theme exists (tokens redefined); dark is default.

## 10. Testing

- **Unit (Vitest):** store ordering/insert-between, stroke encode/decode, CSP builder, `.strata` round-trip, migrations.
- **E2E (Playwright, Chromium):** create notebook → insert each page kind between pages → reload → still there. Sandbox test: a hostile HTML page tries `parent.document`, `indexedDB`, `top.location` → all fail. Pen vs touch routing with synthetic pointer events.
- **Device checks (manual checklist):** Android tablet with stylus (latency overlay, palm rejection); Windows with pen and mouse.

## 11. Milestones (each gets its own implementation plan)

1. **M1 Web core:** tokens/UI, library, notebook shell, Ink/Text/HTML pages, persistence, insert-between, annotate-over-HTML.
2. **M2 PWA & IO:** offline service worker, `.strata` export/import, PDF export (HTML pages as snapshots), deploy to Vercel.
3. **M3 Android:** Capacitor shell, file save/share, stylus tuning, APK build.
4. **M4 Windows:** Tauri v2 shell, file association, installer build.

## 12. Revisit as it grows

- Sync: stable ids + `updatedAt` already in the model; a CRDT (Yjs) layer is the likely path.
- Multi-file HTML visualisers (zip → service-worker-served virtual origin).
- Handwriting search (on-device recognition).
- Optional AI: generate a visualiser from a prompt (Vercel AI SDK), only if wanted.
