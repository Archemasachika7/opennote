# OpenNote: Storage plan + stack (Batches C and F)

Status: plan, not built. Written 2026-11-10. Free services only. The C + F design still needs approval before any build.

## 1. Current stack (built)

| Layer | Choice |
|---|---|
| UI | React 18.3.1 + TypeScript + Vite 8, motion/react (tokens in `src/ui/motion.ts`) |
| Editor | TipTap 2 (text pages), perfect-freehand (ink), pdf.js + pdf-lib (PDF) |
| Local DB | Dexie 4 (IndexedDB), DB name `opennote`, schema v2 (`src/store/schema.ts`) |
| Live pages | sandboxed iframe + CSP; React/Babel UMD in `public/vendor` |
| Android | Capacitor 8 (`app.opennote.notes`) |
| Windows | Tauri 2 (NSIS) |
| CI | GitHub Actions `build-apps.yml` → APK + EXE |
| Tests | Vitest (234 unit) + Playwright on Chrome (12 e2e) |

## 2. Stack to add

| Need | Choice | Batch |
|---|---|---|
| Audio recording | `MediaRecorder` (webm/opus, about 24 kbps) | C |
| Transcription | Web Speech API first; Sarvam `saaras:v3` as fallback (₹30/hour, user's key) | C |
| Summaries | Gemini Flash (user's key) | C / E |
| Handwriting OCR | Gemini | E |
| Indian-language / scanned OCR | Sarvam Vision | E |
| Auth, DB, files | Supabase free tier (`@supabase/supabase-js` v2) | F1 |
| Live collaboration | Supabase Realtime + Yjs (text pages) | F4 |
| Encrypted backups | WebCrypto AES-GCM + IPFS (Storacha or Filebase free tier) | F5 |

Sarvam and Gemini both accept browser calls, so there's no relay server.

## 3. Where data lives

| Data | Local (Dexie) | Supabase Postgres | Supabase Storage | IPFS |
|---|---|---|---|---|
| Notebooks, folders, pages, cards | ✅ source of truth | ✅ synced copy (F1) | | |
| Strokes, page objects | ✅ | ✅ one jsonb row per page | | |
| Images, PDFs (blobs) | ✅ | metadata row only | ✅ private bucket `blobs` | |
| Audio recordings (C) | ✅ | metadata row only | opt-in, off by default (size) | |
| Transcripts | ✅ | ✅ text | | |
| AI keys | ✅ device only | ❌ never | ❌ | ❌ |
| Encrypted backup (`.opennote`) | | CID index row | | ✅ (F5) |

The app stays **local-first**. It writes to Dexie first, and sync runs in the background when the user is signed in.

## 4. Local schema changes (Dexie v3)

```ts
this.version(3).stores({
  recordings: "id, notebookId, createdAt",  // Batch C: blobId, durationMs, pageMarks[], transcriptId
  transcripts: "id, recordingId",           // segments: { startMs, endMs, text }[]
  outbox: "++seq, table, rowId",            // F1: pending changes to push
  syncMeta: "key",                          // F1: lastPulledAt, deviceId, userId
});
```

Batch C links each recording to the notes timeline through `pageMarks: { pageId, atMs }[]` and per-stroke `t` timestamps. Tapping a stroke then seeks the audio to that moment.

## 5. Supabase tables (F1–F3)

Every table has `owner_id uuid references auth.users`, `updated_at timestamptz`, `deleted_at timestamptz null` (matches Trash, 30-day purge), RLS on, and an index on `owner_id`.

| Table | Key columns |
|---|---|
| `folders` | id, name, parent_id |
| `notebooks` | id, folder_id, title, kind, cover, paper, template, favorite |
| `pages` | id, notebook_id, position, kind, data jsonb |
| `page_content` | page_id, strokes jsonb, objects jsonb (gzip via fflate → base64 if large) |
| `cards` | id, notebook_id, front, back, srs jsonb |
| `blobs` | id, storage_path, mime, bytes, sha256 |
| `recordings` | id, notebook_id, blob_id, duration_ms, page_marks jsonb |
| `shares` (F2) | id, notebook_id, token, role (`view`/`comment`/`edit`), expires_at |
| `comments` (F3) | id, page_id, author_id, x, y, body, resolved |
| `backups` (F5) | id, cid, bytes, created_at, provider |

Storage bucket `blobs` is private, with the path `{owner_id}/{blob_id}`. Policy: `(storage.foldername(name))[1] = auth.uid()::text`. Share links read files through signed URLs.

## 6. Sync rules (F1)

- **Push:** every Dexie write also appends to `outbox`. When online, upsert in batches, then clear the sent rows.
- **Pull:** `select ... where updated_at > lastPulledAt`, then apply locally.
- **Conflicts:** last write wins per row (`updated_at`). Ink is safe because strokes only get added; merge them by stroke id.
- Deletes are soft (`deleted_at`), so Trash works across devices.
- Blobs upload once, keyed by content hash (`sha256`), which skips duplicates.

## 7. Free-tier budget (verify on supabase.com before F1)

| Limit (free plan, from third-party sources, not confirmed) | Effect |
|---|---|
| About 500 MB database | strokes are the biggest item, so compress `page_content` |
| About 1 GB file storage | images and PDFs only; audio stays local unless opted in |
| About 5 GB egress/month | cache blobs locally and never re-download |
| Project pauses after about 1 week of inactivity | the app must stay fully usable offline; show "sync paused" instead of an error |

Audio at 24 kbps is about 10 MB per hour. Sarvam fallback costs ₹30 per hour of audio, so ask the user before sending.

## 8. F5: encrypted IPFS backups

1. Export `.opennote` (existing code in `src/io`).
2. Encrypt in the browser with AES-GCM 256. The key comes from the user's passphrase via PBKDF2 (≥ 310k iterations) and a random salt, stored in the file header.
3. Upload to IPFS (Storacha / Filebase free tier). Save the CID in the `backups` table.
4. Restore: fetch the file by CID, decrypt with the passphrase, then import. Imported Live pages keep internet OFF (existing rule).

Arweave is not used because its files are permanent and can't be deleted.

## 9. Build order

1. **Batch C:** Dexie v3 → recorder UI → timeline links → Web Speech transcription → Sarvam fallback → Settings sheet for AI keys.
2. **F1:** auth (`docs/auth.md`) → Supabase tables + RLS → outbox sync → blob upload.
3. **F2** share links → **F3** comments → **F4** live collaboration → **F5** IPFS backups.

Each step: design approval → TDD → full suite + build → review → merge → push.

## 10. Open questions

- Does Web Speech work inside the Android WebView and the Tauri WebView2? If not, use Sarvam there.
- Check the Sarvam credit balance in its dashboard.
- Confirm the current Gemini / Gemma free-tier limits.
- Confirm the current Storacha and Filebase free tiers.
