# OpenNote M1 — Web Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working offline web notebook: library with folders, notebooks of interleaved Ink / Text / Live (HTML·SVG·React) pages, full pen toolset, images, annotate-over-everything, persisted in IndexedDB.

**Architecture:** Single-page React + TypeScript app built with Vite. Domain logic (store, ink geometry, artifact building) lives in framework-free modules with unit tests; React components are thin views over them. Live pages run in `sandbox="allow-scripts"` iframes built from `srcdoc`.

**Tech Stack:** Vite 6, React 18.3.1, TypeScript 5 (strict), Dexie 4, perfect-freehand 1, TipTap 2, lucide-react, @babel/standalone 7, Vitest 3 + @testing-library/react + fake-indexeddb + jsdom + vitest-canvas-mock, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-11-09-opennote-design.md` (read §1.1, §4–§9 before starting).

## Global Constraints

- Node 24, npm 11. All commands run from the project root.
- React pinned to **18.3.1** for both the app and the sandbox runtime (React 19 ships no UMD builds; the sandbox needs `umd/react.production.min.js`).
- TypeScript `strict: true`; no `any` in `src/` except the Babel global typing.
- App code never imports `@capacitor/*` or `@tauri-apps/*` (M3/M4). Platform calls go through `src/platform/port.ts` (web implementation only in M1).
- Page logical size `{ w: 1404, h: 1872 }`. Max HTML source **5 MB**. **Max 2 live iframes** mounted at once. Undo depth **100** per page. Mount only visible ±1 pages.
- Sandbox attribute is exactly `allow-scripts`: never add `allow-same-origin`, `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`.
- Height messages clamped to **200–20,000** logical units.
- Design tokens exactly as spec §9 (Midnight Studio). Fonts: Space Grotesk, Inter, JetBrains Mono, self-hosted via `@fontsource/*` (no Google Fonts request; the app must work offline). Icons: lucide-react, `strokeWidth={1.5}`. Radius 6 px. No gradients, glassmorphism, or emoji in UI.
- `--live` (`#3DDC97`) is used only to mark Live pages.
- No payments, accounts, analytics, or network calls from the app itself.
- Commit after every task with a Conventional Commit message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Pasting a huge artifact** (e.g. 8 MB) → Paste sheet shows "Too large (max 5 MB)", nothing saved. Tests in Task 2 and Task 10.
2. **Reload / tab killed right after drawing** → every committed stroke survives; only an in-progress stroke is lost. Tests in Task 6 (persist on pointerup) and Task 12 (reload journey).
3. **Palm touching the screen while using the pen** → never draws; after a pen has been seen, touch only scrolls/zooms. Test in Task 6.
4. **Artifact that loops forever or throws on load** → app UI stays responsive; Stop unmounts it. Test in Task 10 (e2e `while(true){}`).
5. **Scrolling a notebook with many Live pages** → never more than 2 iframes in the DOM. Tests in Task 10 (registry) and Task 12 (e2e, 6 Live pages).

---

## File Structure

```
index.html
vite.config.ts · tsconfig.json · playwright.config.ts · vitest.setup.ts
src/
  main.tsx · App.tsx                       routing: #/ (library) · #/nb/:id
  ui/tokens.css · ui/global.css            spec §9 tokens, light theme override
  ui/Button.tsx · ui/Menu.tsx · ui/Toast.tsx · ui/Sheet.tsx
  platform/port.ts · platform/web.ts       saveFile/openFile/persist
  store/schema.ts                          Dexie db + types (spec §4)
  store/notebooks.ts · pages.ts · strokes.ts · folders.ts · search.ts
  library/LibraryView.tsx · NotebookCard.tsx
  notebook/NotebookView.tsx · PageList.tsx · Thumbnails.tsx
  notebook/InsertMenu.tsx · useVisiblePages.ts · Toolbar.tsx
  ink/model.ts                             Stroke encode/decode, types
  ink/geometry.ts                          hitTest, splitByEraser, lassoContains, snapShape
  ink/render.ts                            perfect-freehand → Path2D, pen variants
  ink/input.ts                             pointer routing (pen/touch/mouse, eraser button)
  ink/history.ts                           undo/redo stack
  ink/InkLayer.tsx                         wet+dry canvases, binds input→store
  ink/objects.ts · ink/ObjectLayer.tsx     images + text boxes, transforms
  text/TextPage.tsx
  live/detect.ts                           detectArtifactType, stripFence, bareImports
  live/srcdoc.ts                           buildCsp, buildSrcdoc
  live/runtime/react-boot.ts               in-sandbox bootstrap (string-built)
  live/registry.ts                         LiveFrameRegistry (max 2)
  live/LivePage.tsx · PasteSheet.tsx · useSmartPaste.ts
  dev/LatencyOverlay.tsx
tests/unit/**  ·  tests/e2e/**
```

---

### Task 1: Scaffold, design tokens, app shell

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.setup.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/ui/tokens.css`, `src/ui/global.css`, `src/ui/Button.tsx`, `src/ui/Menu.tsx`, `src/ui/Toast.tsx`, `src/ui/Sheet.tsx`, `src/platform/port.ts`, `src/platform/web.ts`
- Test: `tests/unit/app.test.tsx`

**Interfaces:**
- Produces: `useRoute(): { name: 'library' } | { name: 'notebook'; id: string }` and `navigate(path: string): void` in `src/App.tsx`; `toast(msg: string, action?: { label: string; run(): void }): void` from `ui/Toast.tsx`; `<Sheet open onClose title>`; `PlatformPort { saveFile(name: string, data: Blob): Promise<void>; openFile(accept: string[]): Promise<File | null>; requestPersistentStorage(): Promise<boolean> }` and `export const platform: PlatformPort`.

- [ ] **Step 1:** Scaffold with `npm create vite@latest . -- --template react-ts` (into the existing repo; keep `docs/`). Install: `react@18.3.1 react-dom@18.3.1 dexie@4 perfect-freehand@1 @tiptap/react@2 @tiptap/pm@2 @tiptap/starter-kit@2 @tiptap/extension-task-list@2 @tiptap/extension-task-item@2 lucide-react @babel/standalone@7 @fontsource/inter @fontsource/space-grotesk @fontsource/jetbrains-mono`; dev: `vitest@3 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom fake-indexeddb vitest-canvas-mock @playwright/test @types/babel__standalone @types/react@18 @types/react-dom@18`. Run `npx playwright install chromium`.
- [ ] **Step 2: Write failing test** `tests/unit/app.test.tsx`: renders `<App/>` at `#/` → `getByRole('heading', { name: 'OpenNote' })`; at `#/nb/abc` → `useRoute()` returns `{ name: 'notebook', id: 'abc' }`.
- [ ] **Step 3:** Run `npx vitest run tests/unit/app.test.tsx` → FAIL.
- [ ] **Step 4:** Implement the hash router, `tokens.css` (all spec §9 tokens on `:root`; light theme under `:root[data-theme="light"]`), `global.css` (body `background: var(--bg)`, Inter 14px), the four UI primitives, and `platform/web.ts` (anchor download for save, hidden `<input type=file>` for open, `navigator.storage.persist()`).
- [ ] **Step 5:** Run tests → PASS; `npm run build` → exits 0.
- [ ] **Step 6:** Commit `chore: scaffold OpenNote web app with Midnight Studio tokens`.

### Task 2: Store — schema, notebooks, pages, folders, strokes

**Files:**
- Create: `src/store/schema.ts`, `src/store/notebooks.ts`, `src/store/pages.ts`, `src/store/folders.ts`, `src/store/strokes.ts`
- Test: `tests/unit/store.test.ts` (starts with `import 'fake-indexeddb/auto'`)

**Interfaces:**
- Produces (types in `schema.ts`, exactly spec §4 plus): `Folder { id; name; parentId: string | null }`, `Notebook.folderId: string | null`, `Notebook.bookmarks: string[]`, `HtmlPage.artifactType: 'html'|'svg'|'react'`.
- `db` (Dexie) with tables `notebooks, pages, strokes, objects, blobs, folders`.
- `createNotebook(input: { title: string; folderId?: string | null; paper?: 'dark'|'light' }): Promise<Notebook>` (creates one blank Ink page).
- `renameNotebook(id, title)`, `deleteNotebook(id)` (cascades pages/strokes/objects/blobs), `listNotebooks(opts?: { folderId?: string | null; sort?: 'updated'|'title' }): Promise<Notebook[]>`.
- `insertPage(notebookId: string, index: number, init: NewPage): Promise<Page>` where `NewPage = { kind:'ink'; template } | { kind:'text' } | { kind:'html'; title; source; artifactType; allowNetwork }`.
- `movePage(notebookId, from: number, to: number)`, `duplicatePage(pageId): Promise<Page>`, `deletePage(pageId)`, `getPages(notebookId): Promise<Page[]>` (in `pageIds` order), `updatePage(id, patch)`, `toggleBookmark(notebookId, pageId)`.
- `strokes.ts`: `getStrokes(pageId): Promise<Stroke[]>`, `putStroke(pageId, s: Stroke)`, `replaceStrokes(pageId, remove: string[], add: Stroke[])` (one transaction).
- `folders.ts`: `createFolder(name, parentId?)`, `renameFolder(id, name)`, `deleteFolder(id)` (moves its notebooks to the parent).

- [ ] **Step 1: Failing tests:**
  - `createNotebook` → `getPages` returns 1 page, `kind: 'ink'`, `template: 'blank'`.
  - `insertPage(nb, 1, {kind:'html', …})` between two ink pages → kinds `['ink','html','ink']`.
  - `movePage(nb, 2, 0)` → kinds `['ink','ink','html']` with the expected ids.
  - `deletePage` removes the page and its strokes; `pageIds` no longer contains it.
  - `deleteNotebook` leaves zero rows in `pages`/`strokes`/`objects` for it.
  - `insertPage` html with `source.length > 5 * 1024 * 1024` → rejects with `Error('Too large (max 5 MB)')`.
  - notebook `updatedAt` increases on any page mutation.
- [ ] **Step 2:** Run `npx vitest run tests/unit/store.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Every multi-table mutation inside `db.transaction('rw', …)`. Ids via `crypto.randomUUID()`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(store): notebooks, pages, folders, strokes in IndexedDB`.

### Task 3: Library view

**Files:**
- Create: `src/library/LibraryView.tsx`, `src/library/NotebookCard.tsx`, `src/store/search.ts`
- Test: `tests/unit/library.test.tsx`

**Interfaces:**
- Consumes: Task 2 store functions, `navigate`.
- Produces: `searchAll(q: string): Promise<SearchHit[]>`, `SearchHit = { notebookId; pageId?: string; title: string; snippet: string }`. Matches notebook titles, Text page plain text (`textOf` from Task 8; until Task 8 lands, search over `JSON.stringify(doc)` text nodes), Html page titles and tag-stripped source. Case-insensitive substring, no index in M1.

- [ ] **Step 1: Failing tests:** "New notebook" creates a card and navigates to `#/nb/<id>`; rename via card menu updates the title; delete opens a confirm `<Sheet>` (no `window.confirm`) then removes the card; a folder chip filters cards; Updated/Title sort toggle reorders; search shows a hit from an Html page title.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Card = `coverColor` swatch, title, page count, mint mono "LIVE n" tag if it has Html pages. Header: "OpenNote" wordmark (Space Grotesk), search field, New notebook, New folder.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(library): notebook grid, folders, sort, search`.

### Task 4: Notebook shell — page list, thumbnails, insert-between, zoom

**Files:**
- Create: `src/notebook/NotebookView.tsx`, `src/notebook/PageList.tsx`, `src/notebook/Thumbnails.tsx`, `src/notebook/InsertMenu.tsx`, `src/notebook/useVisiblePages.ts`, `src/notebook/Toolbar.tsx`
- Test: `tests/unit/notebook.test.tsx`, `tests/unit/useVisiblePages.test.ts`

**Interfaces:**
- Consumes: Task 2 page functions.
- Produces:
  - `useVisiblePages(container: RefObject<HTMLElement>, count: number): { mounted: Set<number>; current: number }` (IntersectionObserver; `mounted` = visible ±1).
  - `<PageFrame page index mounted>` renders by `kind` (placeholder components for kinds built later).
  - `useTool(): [ToolState, (p: Partial<ToolState>) => void]`, `ToolState = { tool: 'pen'|'highlighter'|'eraser'|'lasso'|'shape'|'text'|'image'|'hand'; variant: 'ball'|'fountain'|'brush'; color: string; width: number; eraseMode: 'stroke'|'partial'; mode: 'annotate'|'interact'; penSeen: boolean }`.
  - Zoom: CSS `transform: scale(z)` on the page column, `z ∈ [0.5, 4]`, ctrl+wheel and two-finger pinch.

- [ ] **Step 1: Failing tests:**
  - `useVisiblePages` with mocked IntersectionObserver reporting index 5 → `mounted` `{4,5,6}`, `current` 5.
  - The "+" gap between thumbnails 1 and 2 → InsertMenu lists "Ink page", "Text page", "Live page"; choosing Text → store has `text` at index 1.
  - `onReorder(3, 0)` → `movePage(nb, 3, 0)` called.
  - Page menu offers Duplicate, Delete, Bookmark, and (ink only) Template: blank/ruled/grid/dot.
  - Live page thumbnails have `data-live="true"` and show a mono `LIVE` tag.
  - Sidebar tabs Pages / Bookmarks: Bookmarks lists only bookmarked pages; clicking one scrolls it into view (`scrollIntoView` called on that page).
  - Notebook menu Paper: dark/light → `notebook.paper` updated and page background uses `--page-dark` / `--page-light`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Pages are fixed-aspect cards (`1404×1872` logical, scaled to column width); templates as CSS backgrounds using `--line`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(notebook): page scroll, thumbnails, insert-between, reorder, zoom`.

### Task 5: Ink model & geometry (pure)

**Files:**
- Create: `src/ink/model.ts`, `src/ink/geometry.ts`
- Test: `tests/unit/ink-geometry.test.ts`

**Interfaces:**
- Produces:
  - `Stroke` (spec §4) with `points: Float32Array` stride 4 (`x,y,pressure,t`), `tool: 'pen'|'highlighter'`, `variant: 'ball'|'fountain'|'brush'`.
  - `encodeStroke(s): ArrayBuffer`, `decodeStroke(buf): Stroke`.
  - `bbox(points): { x; y; w; h }`, `translate(s, dx, dy): Stroke`, `scale(s, sx, sy, ox, oy): Stroke`.
  - `hitTest(s, x, y, radius): boolean` (segment distance ≤ `radius + s.width/2`).
  - `splitByEraser(s, path: number[], radius): Stroke[]` (removes covered points; returns remaining fragments with new ids; fragments < 2 points dropped).
  - `lassoContains(polygon: number[], s): boolean` (≥ 80% of points inside, even-odd rule).
  - `snapShape(points: Float32Array): { kind: 'line'|'rect'|'ellipse'|'arrow'; points: Float32Array } | null`.

- [ ] **Step 1: Failing tests:** encode/decode round-trip equality; `hitTest` true at 1 px from a horizontal stroke, false at 50 px; `splitByEraser` across the middle of a 100-point line → 2 fragments whose counts sum < 100; lasso square around a stroke → true, half-overlap → false; `snapShape`: noisy straight line → `line` with 2 points; closed 4-corner path → `rect`; noisy circle → `ellipse`; scribble → `null`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `snapShape`: line if max deviation from the chord < 4% of its length; closed if end-to-start distance < 15% of perimeter; then rect if Ramer–Douglas–Peucker (ε = 6% of bbox diagonal) yields 4 corners at 90° ± 20°, else ellipse if radial deviation from centroid < 18%; arrow = line whose last 15% turns > 120°.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(ink): stroke model and geometry`.

### Task 6: Ink layer — input, rendering, tools, undo

**Files:**
- Create: `src/ink/render.ts`, `src/ink/input.ts`, `src/ink/history.ts`, `src/ink/InkLayer.tsx`, `src/dev/LatencyOverlay.tsx`
- Test: `tests/unit/ink-input.test.ts`, `tests/unit/ink-history.test.ts`, `tests/unit/ink-layer.test.tsx`

**Interfaces:**
- Consumes: Task 5, `strokes.ts`, `useTool`.
- Produces:
  - `strokePath(s: Stroke): Path2D` with perfect-freehand options: ball `{ thinning: 0.1, smoothing: 0.5 }`, fountain `{ thinning: 0.7, smoothing: 0.6 }`, brush `{ thinning: 0.9, streamline: 0.4 }`; real pressure when recorded from a pen, `simulatePressure: true` otherwise. Highlighter: constant width, `globalAlpha 0.35`, drawn beneath pen strokes.
  - `classifyPointer(e: PointerEvent, s: { penSeen: boolean; tool: ToolState['tool'] }): 'draw'|'erase'|'navigate'` — pen with `buttons & 32` → `erase`; pen → `draw`; touch with `penSeen` → `navigate`; touch without → `draw`; mouse button 1 or `tool === 'hand'` → `navigate`; mouse button 0 → `draw`.
  - `History { push(op: Op): void; undo(): Op | null; redo(): Op | null }`, `Op = { remove: Stroke[]; add: Stroke[] }`, capacity 100.
  - `<InkLayer pageId width height inputFilter?: (e: PointerEvent) => boolean />`.
- Rendering: two stacked DPR-scaled canvases; wet uses `getContext('2d', { desynchronized: true })`; points from `getCoalescedEvents()`; predicted tail from `getPredictedEvents()` on wet only. On `pointerup`: `await putStroke` then draw to dry and clear wet. Dry caches `Path2D` per stroke id. Undo/redo: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, two-finger tap.

- [ ] **Step 1: Failing tests:**
  - `classifyPointer`: every rule above, including touch while `penSeen` → `navigate`.
  - `History`: 101 pushes keep 100; undo then redo returns the same op; push after undo clears redo.
  - `InkLayer` (jsdom + vitest-canvas-mock): synthetic pen down / 10 moves / up → `putStroke` called once with ≥ 11 points; remount → `getStrokes` returns it.
  - Eraser `partial` across a stroke → `replaceStrokes` with 1 removed, 2 added; `stroke` mode → 1 removed, 0 added.
  - Shape tool: 500 ms pause at the end of a straight line → stored stroke has exactly 2 points.
  - `inkPalette(paper: 'dark'|'light'): string[]` (in `render.ts`) returns 8 colours, each with contrast ≥ 4.5:1 against `#1E2028` (dark) or `#F3F1EC` (light); strokes store a palette index when picked from the palette so switching paper swaps them (`resolveColor(stroke, paper)`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `LatencyOverlay` (visible with `?debug=latency`) shows rolling p50/p95 of `performance.now() - e.timeStamp` at paint.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(ink): pressure pens, highlighter, eraser, shapes, undo`.

### Task 7: Objects on ink pages — images, text boxes, lasso transforms

**Files:**
- Create: `src/ink/objects.ts`, `src/ink/ObjectLayer.tsx`
- Modify: `src/store/schema.ts` (add `PageObject`), `src/ink/InkLayer.tsx` (lasso includes objects), `src/ink/history.ts` (`Op` gains `objects?: { before: PageObject[]; after: PageObject[] }`)
- Test: `tests/unit/objects.test.tsx`

**Interfaces:**
- Produces: `PageObject = { id; pageId; kind: 'image'|'textbox'; x; y; w; h; rotation: number; crop?: { x; y; w; h }; blobId?: string; text?: string; z: number }`; `addImage(pageId, file: Blob, at?: { x; y }): Promise<PageObject>` (downscale to ≤ 2048 px longest side, store WebP blob, fit width ≤ 1404); `addTextBox(pageId, at): Promise<PageObject>`; `updateObject(id, patch)`; `deleteObjects(ids)`.
- `Selection = { strokeIds: string[]; objectIds: string[] }`; actions: move, uniform scale (corner handles), rotate (top handle), recolor (strokes), delete, duplicate, copy/cut/paste.

- [ ] **Step 1: Failing tests:** dropping a PNG on an ink page creates one `image` object with `w ≤ 1404`; pasting a clipboard `image/png` creates one at viewport centre; crop sets `crop` and keeps `blobId`; lasso around a stroke + image then drag 50 px moves both (stroke x +50, object `x` +50) and a single undo restores both; a text box accepts typing and persists `text`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Image picker via `platform.openFile(['image/*'])`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(ink): images, text boxes, lasso transforms`.

### Task 8: Text page

**Files:**
- Create: `src/text/TextPage.tsx`
- Modify: `src/store/search.ts` (use `textOf`)
- Test: `tests/unit/text-page.test.tsx`

**Interfaces:**
- Consumes: `updatePage`.
- Produces: `<TextPage page />` (TipTap StarterKit: headings 1–3, bullet/ordered lists, code block, blockquote, bold/italic/strike, rule, plus TaskList/TaskItem; floating format bar; saves `doc` debounced **400 ms** and on blur); `textOf(doc): string`.

- [ ] **Step 1: Failing tests:** typing "# Hi " yields an `h1`; after 400 ms (fake timers) `page.doc` is persisted; `textOf` returns plain text with newlines between blocks; `searchAll` finds a word typed in a Text page.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; JetBrains Mono for code blocks.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(text): rich text pages`.

### Task 9: Artifact detection and sandbox document builder (pure)

**Files:**
- Create: `src/live/detect.ts`, `src/live/srcdoc.ts`, `src/live/runtime/react-boot.ts`
- Test: `tests/unit/live-build.test.ts`

**Interfaces:**
- Produces:
  - `stripFence(src): string` (removes one surrounding ```` ```lang ```` fence).
  - `detectArtifactType(src): 'html'|'svg'|'react'|null`, applied after `stripFence`, rules exactly spec §6.1.
  - `bareImports(src): string[]`: specifiers that aren't `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, relative paths, or URLs.
  - `buildCsp(opts: { allowNetwork: boolean }): string`:
    - offline: `default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:`
    - network: each of those sources plus `https:`, plus `connect-src https:`.
  - `buildSrcdoc(opts: { source: string; type: 'html'|'svg'|'react'; allowNetwork: boolean; vendor?: { react: string; reactDom: string; babel: string } }): string`: the CSP `<meta http-equiv="Content-Security-Policy">` is the first child of `<head>` (create `<head>` if absent), plus a height reporter (`ResizeObserver` on `documentElement` → `parent.postMessage({ type: 'opennote:height', h }, '*')`). SVG is wrapped in a minimal document with `body{margin:0}`.
  - `reactBootScript(userCode: string, importMap: Record<string, string>): string`. Runs inside the sandbox:
    1. `Babel.transform(code, { presets: [['react', { runtime: 'classic' }], 'typescript'], filename: 'artifact.tsx' })`.
    2. Create blob-URL shim modules re-exporting `window.React` / `window.ReactDOM` for `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`.
    3. Insert `<script type="importmap">` with the shims, plus each bare import → `https://esm.sh/<pkg>?external=react,react-dom` (network only).
    4. `import()` the transformed code as a blob module and `createRoot(#root).render(createElement(mod.default))`.
    5. Errors render into `#root` as a mono box (`#FF6B6B` text) with the message and line.
  - With network on and `className=` present, add `<script src="https://cdn.tailwindcss.com/3.4.17"></script>`.

- [ ] **Step 1: Failing tests:**
  - detection: `<!DOCTYPE html>…` → html; fenced ```` ```jsx\nexport default function A(){return <div/>}\n``` ```` → react; `<svg …>` → svg; `hello` → null.
  - `bareImports("import {LineChart} from 'recharts'; import React from 'react'")` → `['recharts']`.
  - html `buildSrcdoc`: the CSP meta is the first element in `<head>`; offline CSP contains no `https:`.
  - react `buildSrcdoc`: vendor scripts inline (substring asserts), `<div id="root">`, and an import map mapping `recharts` → `https://esm.sh/recharts?external=react,react-dom` only when network is on.
  - Source containing `</script>` inside a string is embedded safely (`<\/script>` in the payload) and the builder output parses with exactly the expected number of `<script>` elements (DOMParser).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Vendor strings are loaded lazily by the app with `import('react/umd/react.production.min.js?raw')`, `import('react-dom/umd/react-dom.production.min.js?raw')`, `import('@babel/standalone/babel.min.js?raw')`, only when a React page mounts.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(live): artifact detection and sandbox document builder`.

### Task 10: Live pages, Paste → Save sheet, smart paste

**Files:**
- Create: `src/live/registry.ts`, `src/live/LivePage.tsx`, `src/live/PasteSheet.tsx`, `src/live/useSmartPaste.ts`
- Test: `tests/unit/live-registry.test.ts`, `tests/unit/paste-sheet.test.tsx`, `tests/e2e/sandbox.spec.ts`, `tests/e2e/fixtures/{hostile.html,loop.html,counter.jsx}`

**Interfaces:**
- Consumes: Task 9, `insertPage`, `updatePage`, `toast`, `Sheet`, `useVisiblePages().current`.
- Produces:
  - `createLiveFrameRegistry(capacity = 2): { request(pageId: string, priority: number): boolean; release(pageId: string): void; subscribe(fn: () => void): () => void; active(): string[] }`. Higher priority (closer to the viewport centre) evicts the lowest.
  - `<LivePage page mounted />`: when granted, `<iframe sandbox="allow-scripts" srcdoc={…} title={page.title}>`; height from `opennote:height` messages where `e.source === iframe.contentWindow`, clamped 200–20,000. When not granted, a placeholder card with title, type badge, mono `LIVE` tag and a "Run" button (requests max priority). Header: title, type, network toggle (Globe icon), Stop, Reload, Edit source (reopens PasteSheet). Left edge `2px solid var(--live)`.
  - `<PasteSheet open initial? onSave(p: { title; source; artifactType; allowNetwork }) onClose />`: left, a mono textarea (autofocus); right, a live preview built with the same builder; type selector Auto/HTML/SVG/React; title defaults to `<title>`, else the first `<h1>`/component name, else "Live page". When `bareImports()` is non-empty, network turns on automatically with the note "Needs internet for: recharts". Save is disabled when empty or > 5 MB (shows "Too large (max 5 MB)").
  - `useSmartPaste(notebookId, currentIndex)`: on a document `paste` outside editable elements, if `detectArtifactType(text)` is non-null → `toast('Create live page here?', { label: 'Create', run })`, which opens PasteSheet pre-filled and inserts after the current page. Image clipboard items on an ink page go through `addImage`.

- [ ] **Step 1: Failing tests:**
  - registry: request A, B → true, true; request C at higher priority → true and A is evicted; `active().length` never > 2.
  - PasteSheet: React source importing `recharts` → network checked and note visible; 6 MB input → Save disabled with "Too large (max 5 MB)"; Save calls `onSave` with `artifactType: 'react'`.
  - e2e `hostile.html` tries `parent.document.body.innerHTML='x'`, `indexedDB.open('x')`, `top.location='https://example.com'`, `document.cookie='a=b'`, and writes each outcome into its own body → all four report blocked/error; app URL unchanged; app library still renders after navigating back.
  - e2e `loop.html` (`while(true){}` on load) → the app's Stop button responds within 2 s and the iframe is removed.
  - e2e `counter.jsx` (a Claude-style `export default function Counter()` using `useState`), offline → clicking its button inside the iframe increments the count.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. If the `loop.html` e2e shows Chromium keeps the opaque-origin frame in-process and the parent freezes, move the Live iframe content to a separate origin in a follow-up (M2: serve the sandbox from a distinct port/subdomain). Record the observed result in the commit message.
- [ ] **Step 4:** Run `npx vitest run` and `npx playwright test tests/e2e/sandbox.spec.ts` → PASS.
- [ ] **Step 5:** Commit `feat(live): sandboxed live pages, paste-to-save, smart paste`.

### Task 11: Annotate over Text and Live pages

**Files:**
- Modify: `src/live/LivePage.tsx`, `src/text/TextPage.tsx`, `src/notebook/Toolbar.tsx`
- Test: `tests/unit/annotate.test.tsx`

**Interfaces:**
- Consumes: `<InkLayer inputFilter>` (Task 6), `useTool()` `mode`/`penSeen`.
- Behaviour: every Text and Live page has an `InkLayer` overlay with `pointer-events: none` by default. A capture-phase `pointerdown` listener on the page wrapper switches the overlay to `pointer-events: auto` and calls `setPointerCapture` when `e.pointerType === 'pen'`, or when `mode === 'annotate'` for mouse; otherwise the event reaches the iframe/editor. The toolbar shows the *Interact ⇄ Annotate* toggle only while `penSeen` is false.

- [ ] **Step 1: Failing tests:** pen pointerdown on a Live page → stroke stored for that page id and the overlay captured the pointer; touch pointerdown → overlay `pointer-events` stays `none`; mouse in `annotate` mode → stroke stored; strokes re-render after remount; toggle hidden once a pen event has occurred.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: pen annotation over text and live pages`.

### Task 12: End-to-end journey and performance budgets

**Files:**
- Create: `tests/e2e/journey.spec.ts`, `tests/e2e/perf.spec.ts`
- Modify: `src/library/LibraryView.tsx` (call `platform.requestPersistentStorage()` on first notebook creation)

- [ ] **Step 1: Write e2e tests:**
  - journey: create notebook → draw a stroke (dispatch `PointerEvent` with `pointerType: 'pen'`, `pressure: 0.5` via `page.evaluate`) → insert Text page between → type → paste `counter.jsx` with Ctrl+V → toast → Create → Save → reload → pages are [ink, live, text] or the inserted order exactly, the stroke exists, the text exists, and the Live page runs.
  - perf: notebook with 6 Live pages; scroll top → bottom in 10 steps; at every step the count of `iframe[sandbox]` outside the PasteSheet is ≤ 2.
  - perf: page with 2,000 synthetic strokes → dry redraw time from `performance.measure('dry-redraw')`; log the number; fail only above 300 ms (headless variance), target ≤ 100 ms.
- [ ] **Step 2:** Run `npx playwright test` → fix until PASS.
- [ ] **Step 3:** Run `npx vitest run && npx playwright test && npm run build` → all green.
- [ ] **Step 4:** Commit `test: e2e journey and performance budgets for M1`.

---

## Out of this plan (later plans)

M2: service worker/offline install, `.opennote` export/import, PDF import & export, HTML snapshots for PDF, Vercel deploy. M3: Capacitor Android, stylus tuning on device, camera. M4: Tauri Windows, `.opennote` file association, installer.
