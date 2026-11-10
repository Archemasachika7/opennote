# active-memory handoff: OpenNote (Goodnotes-style notebook with live AI-artifact pages)

**Handoff #1** · 2026-11-10 · Lineage: #1 (2026-11-10): brainstorm → spec → M1 web core → styling → Android/Windows shells + CI → Batch A → pushed to GitHub

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: None active. If the user types /amcodeword, start every reply with the phrase they choose (default "Yes Boss!").
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** OpenNote — a free (no charges, no ads, no account in v1) Goodnotes-style notebook for web, Android (APK, phone + tablet), Windows (EXE). Unique feature: save AI artifacts (HTML, SVG, React/JSX copied from Claude/ChatGPT) as live, runnable pages between normal pages (copy → paste → Save → runs).
- **Done looks like:** the user's Goodnotes feature checklist (`C:\Users\begin\Downloads\feature-check.md`) covered by Batches A, B, C, then F + E; apps downloadable from GitHub.
- **Why it matters / context:** the user wants a free app that keeps AI visualisers (e.g. Gemini/Claude HTML) inside notes and lets him write on them with a pen, tablet or pen tablet.

## 2. About the user (as relevant to this work)
- Student (IITM BS Data Science; studies algorithms, e.g. a "Kahn's Topological Sort" visualiser in Downloads). Windows 11 PC, Chrome.
- Writes informal, often all-caps, short messages; tests the app himself and reports bugs with screenshots.
- GitHub account: **Archemasachika7**; `gh` signed in with scopes gist, read:org, repo, workflow.

## 3. Style & communication
- **Language:** English.
- **Tone:** direct, plain, friendly; no hype.
- **Reply length:** short to medium; lead with what changed / what to do next.
- **Formatting:** markdown headings, bullets, tables for status; code blocks for commands to paste. Emojis only inside checkpoint blocks.
- **Working style:** show design in chat → user says yes → build with TDD (failing test first) → full suite (unit + e2e on real Chrome) + build, check exit codes → independent review (subagent) → fix Critical/Important with tests → merge to master → push to GitHub.
- **Avoid:** building before design approval; any purple; many questions at once (one at a time); claiming done without running the suite.

## 4. Hard rules (word for word)
1. "in app design strictly do not use purple" (enforced by `tests/unit/no-purple.test.ts`; even comments must not contain the words purple/violet/indigo/magenta).
2. "use /ecc:motion-advanced and /ecc:motion-patterns" (motion/react; tokens in `src/ui/motion.ts`; reduced motion respected).
3. "styling first priotiyy , second is to push to github , 3rd to work on apk and exe and then invoke auth supabase and web3 storage planning" (all done except the Supabase/web3 planning).
4. "build A B C THEN F AND E WE WOULD THINK" (Batch A done → B → C → then plan F + E together).
5. "their will be no payment" / "without any charges" (free services only).
6. "HTML INSERT WILL BE LIKE COPY PASTE and save will make it runnable".

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | Interact/Annotate button showed the current mode; clicking it made Live pages draw | "I WOULD OBVIOUSLY INTERACT WITH IT" → explicit "Use page / Write on page" switch, shown only on Text/Live pages |
| 2 | New images all placed at the same centred spot (looked like replacing) | several pictures per page, added to the CURRENT page (not page 1) |
| 3 | No way to move content between pages | select, copy, cut and paste to another page |
| 4 | Shapes only via draw-and-hold snapping | predefined shape picker |
| 5 | No PDF export | PDF export (notebook and single page) |
| 6 | Image tool silently switched the tool to Lasso (mouse ink "vanished") | tool returns to the previous one; hover labels on tools |
| 7 | `desynchronized` canvas → pages turned solid black on the user's GPU | removed desynchronized canvas |
| 8 | Violet accent | no purple anywhere → amber |
| 9 | Planned without inspecting the Goodnotes APKs | user asked for /reverse-engineer-anything on the APKs; done: Goodnotes Android is a Trusted Web Activity (web app wrapper) |

## 6. Decisions
| Decision | Why |
|---|---|
| Name **OpenNote** (folder still `strata`) | user's choice |
| Direction B "Midnight Studio" dark UI; amber accent `#F5A524`; mint `#3DDC97` only for Live pages | user chose B; no-purple rule |
| One web codebase: React 18.3.1 + TypeScript + Vite 8 + Dexie (IndexedDB), offline-first | spec |
| Android: Capacitor 8; Windows: Tauri 2 (NSIS installer) | offline, small |
| Live artifacts v1: HTML, SVG, React/JSX ("option 2") | user chose option 2 |
| Live pages run in `<iframe sandbox="allow-scripts" srcdoc>` with CSP; React via bundled UMD + Babel in `public/vendor` (copied by `scripts/copy-vendor.mjs`) | security + offline |
| Public repo github.com/Archemasachika7/opennote | user chose Public |
| Builds via GitHub Actions `.github/workflows/build-apps.yml`; tag `v*` → GitHub Release with APK + EXE | no local Rust/Android Studio |
| Delete = move to Trash (30-day purge) | Batch A design approved |
| Imported `.opennote` backups set Live pages' internet OFF | review: sharing must not grant network |

## 7. Changed / rejected
- Strata (working name) → OpenNote.
- Violet `#7C5CFF` accent → amber `#F5A524`.
- Interact/Annotate toggle → "Use page / Write on page" switch (Text/Live pages only).
- Trusted Web Activity (Goodnotes' approach) → Capacitor.
- Floating BubbleMenu (tippy.js) → sticky format bar while editing.
- Vite `?raw` vendor aliases → copy script + runtime fetch.
- ❌ AI features in v1 (deferred to E planning).
- ❌ Desynchronized canvas (black pages).
- D (handwriting recognition) → research only (no good free offline engine).

## 8. Data & facts (exact)
- Repo: https://github.com/Archemasachika7/opennote (branch master). Latest commit `7c48cff` "fix: image URLs never throw (shared useBlobUrl); unhandled rejection failed CI".
- CI run `42749952807` was in_progress at handoff. Previous run `42749528017` failed only because of an unhandled rejection in tests (fixed in `7c48cff`); APK/EXE jobs had been skipped.
- Tests at handoff: 182 unit (vitest exit 0), 9 e2e (Playwright, `channel: 'chrome'`), build OK.
- Tokens: `--bg #121318`, `--surface #1a1c23`, `--page-dark #1e2028`, `--page-light #f3f1ec`, `--line #2a2d37`, `--text #e8e9ee`, `--accent #f5a524` (light theme `#b45309`), `--live #3ddc97`. Fonts: Space Grotesk, Inter, JetBrains Mono.
- Page logical size 1404 × 1872; max HTML 5 MB; max 2 live iframes; undo depth 100; Trash purge 30 days.
- App ID `app.opennote.notes`. Local debug APK: `C:\Users\begin\projects\strata\android\app\build\outputs\apk\debug\app-debug.apk` (6.6 MB).
- Portable JDK 21: `C:\Users\begin\.tools\jdk21` (system Java 25 too new for Gradle; Android Studio's jbr is broken). Android SDK: `C:\Users\begin\AppData\Local\Android\Sdk`.
- gh: `C:\Program Files\GitHub CLI\gh.exe` (use full path in bash).
- Dev server: `npm run dev -- --port 5173` → http://localhost:5173 (e2e uses port 5199).
- Web3 storage idea (suggested, NOT decided): IPFS via Storacha or Filebase free tier + client-side encryption; Supabase for auth + CID index; Arweave less suitable (permanent, can't delete).

## 9. People, terms & names
- **People:** the user only.
- **Terms & nicknames:** "Live page" = HTML/SVG/React artifact page; "Batch A/B/C" = feature batches; "F" = sharing/sync/collaboration/Supabase/web3; "E" = AI tools; "D" = handwriting recognition; "ledger" = `.superpowers/sdd/2026-11-09-opennote-m1-web-core/progress.md` (git-ignored, holds all rulings and deferred minors).
- **Names in use:** spec `docs/superpowers/specs/2026-11-09-opennote-design.md`; plans `docs/superpowers/plans/2026-11-09-opennote-m1-web-core.md`, `docs/superpowers/plans/2026-11-10-batch-a.md`; backup extension `.opennote`.

## 10. Work state
| Item | Status | Version / location | Notes |
|---|---|---|---|
| M1 web core | final | master | ink, text, live pages, library, lasso, images, shapes, PDF export, copy/paste |
| Styling (amber, motion) | final | master | |
| Android (Capacitor) | built locally | `android/` | CI should produce `OpenNote-android.apk` |
| Windows (Tauri) | configured, never built | `src-tauri/` | first build happens in CI; may need fixes |
| Batch A | final, merged, pushed | master | favourites, Trash, grid/list, select mode, sorting; text underline/colour/highlight/tables; Outline tab; `.opennote` backup; Export dialog (PDF/JPG, page ranges); PDF import; rotate page; go to page |
| Batch B | not started | — | design must be shown and approved first |
| Batch C | not started | — | |
| F + E planning | not started | — | |
| Deferred minors | open | ledger | PDF table cells clip; rotation rounding drift; orphan blobs from deleted objects; paste preview is a 3rd iframe; failed live save loses code; 5 MB limit counts chars; live pages never shrink; artifact can navigate its own frame |

Commands (bash, in `C:\Users\begin\projects\strata`): `npx vitest run` (check the exit code, not only the pass count), `npx playwright test`, `npx tsc -p .`, `npm run build`.
Local APK: `cd android && JAVA_HOME=/c/Users/begin/.tools/jdk21 ANDROID_HOME=/c/Users/begin/AppData/Local/Android/Sdk ./gradlew assembleDebug`.
Tooling gotchas: bash heredocs collapse `\\` to `\` (use Write/Edit for code containing backslashes); very long bash commands fail (split them); a "GateGuard" hook asks for facts before the first edit of each file.

## 11. Next steps
1. **Next action:** check CI run `42749952807` with `"C:\Program Files\GitHub CLI\gh.exe" run view 42749952807`; if the android or windows job failed, fix and push; then tell the user where to download the APK/EXE (Actions artifacts, or tag `v0.2.0` for a Release).
2. Present the Batch B design (ruler, laser pointer, tape hide/reveal, layers, Study Sets with flashcards + spaced repetition, whiteboard infinite canvas) and wait for "yes".
3. Build Batch B on a branch with TDD, review, merge, push.
4. Batch C (audio recording linked to the notes timeline + transcription).
5. Plan F + E together (Supabase auth, sync, sharing, comments, collaboration, encrypted web3 storage; AI source).

## 12. Open questions ⚠️
- Batch C transcription: browser speech recognition (free, online, Chrome/Edge) or offline model (~40 MB)?
- E (AI) free source: the user's own Gemini key or an in-browser model (1 GB+)?
- Rename the project folder `strata` → `opennote`?

## 13. Re-attach checklist
- [ ] `C:\Users\begin\Downloads\feature-check.md`: the Goodnotes feature checklist the batches are based on.

---
<sub>Audit: 13/13 sections · 6 rules · 9 corrections · 30 data points · secrets removed: none found · generated by active-memory</sub>
