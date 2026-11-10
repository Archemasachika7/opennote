# OpenNote storage design: Supabase index + bring-your-own Telegram storage

Status: design, waiting for approval. Written 2026-11-10. Replaces sections 3, 5–8 of `docs/storage-and-stack.md`.

## 1. Requirements

**Functional**
- Optional sign-in (`docs/auth.md`, unchanged). Signed out = today's app, fully offline.
- Signed in: notebooks sync across web, Android and Windows, including images, PDFs and lecture audio.
- Encrypted backups. Deleting works (Trash, 30 days), so nothing permanent like Arweave.

**Non-functional**
- Free for everyone, forever: no paid plan, no server we pay for.
- Local-first: Dexie stays the source of truth, sync runs in the background, and the app never blocks on the network.
- Private: the storage provider sees only encrypted bytes.

**Facts checked on 2026-11-10**

| Fact | Source | Effect |
|---|---|---|
| Supabase free: ~500 MB DB, ~1 GB files, ~5 GB egress, pauses after 1 week idle, **per project = shared by all users** | third-party pricing guides (supabase.com/pricing not reachable) | Supabase can hold only small index rows, never note content |
| `api.telegram.org` (methods and `/file/`) sends `Access-Control-Allow-Origin: *` | `curl -X OPTIONS` probe | the browser can call the Bot API directly, no relay |
| Bot API: upload ≤ 50 MB, `getFile` download ≤ 20 MB, no total cap | Telegram Bot API docs | chunks of 19 MB |
| Storacha now redirects to Fil One: $5.99/month minimum, 30-day trial | fil.one/pricing | ❌ dropped (not free) |
| Pinata free 1 GB / 500 files; Filebase free ~5 GB / 1000 files | vendor blog + FAQ | optional second provider, user's own key |

## 2. The key decision

```
            control plane (shared, tiny)                 data plane (per user, big)
 ┌────────┐   auth, index rows, versions   ┌──────────┐   encrypted chunks    ┌──────────────────────┐
 │ Dexie  │ ─────────────────────────────▶ │ Supabase │                       │ the user's own        │
 │ (truth)│ ◀───────────────────────────── │  (free)  │                       │ Telegram bot + chat   │
 └───┬────┘                                └──────────┘                       │ (no total limit)      │
     │            encrypt (AES-GCM) → 19 MB chunks → sendDocument             │                       │
     └──────────────────────────────────────────────────────────────────────▶ │ or Pinata / Filebase  │
     ◀────────────── getFile → /file/bot…/path → decrypt ──────────────────── └──────────────────────┘
```

- **Supabase = control plane.** Auth plus about 1 KB per notebook and about 200 B per blob. With 500 MB shared, that's room for roughly 100k notebooks across all users.
- **Telegram = data plane.** Each user creates **their own bot** with @BotFather, so their storage limit is Telegram's, not ours. Nobody else's key or quota is involved, so it stays free.
- Without a storage provider connected, signing in still works (account, profile) and sync shows "Connect storage to sync". It never fails silently.

## 3. What gets uploaded

The sync unit is the **notebook**, reusing the existing `.opennote` format (`src/io/backup.ts`, which now carries recordings too), split in two:

| Part | Content | Upload when | Size |
|---|---|---|---|
| **Manifest** | notebook, pages, strokes, objects, cards, recording metadata (no blob bytes) | 20 s after the last edit, and on app hide/close | KB to a few MB |
| **Blobs** | images, PDFs, page backgrounds, audio | once, keyed by SHA-256 (content-addressed dedup) | any size, 19 MB chunks |

Re-saving a notebook re-uploads only the small manifest. A 2-hour lecture (~20 MB) uploads once.

## 4. Encryption

- **Master key:** PBKDF2-SHA256 (600,000 iterations, the current OWASP figure) from the user's **sync passphrase** + a random 16 B salt → AES-GCM-256 key. It never leaves the device. The salt is stored in `profiles.kdf_salt`.
- **Per object:** a random AES-GCM-256 data key encrypts the bytes (12 B random IV per chunk). The master key wraps the data key, and the wrapped key is stored in the index row.
- **Verifier:** `profiles.key_check` = AES-GCM(master, "opennote") lets a new device tell a wrong passphrase from corrupt data.
- Losing the passphrase means the data can't be recovered. The UI says so plainly, and there is no reset.
- The Telegram bot token and Pinata/Filebase keys stay on the device (like the AI keys) and are **never** sent to Supabase. A leaked token exposes only ciphertext.

## 5. Supabase schema (RLS on every table; `owner_id = (select auth.uid())`)

```sql
profiles      (id uuid pk → auth.users, display_name, kdf_salt bytea, key_check bytea, created_at)
notebooks_idx (id uuid pk, owner_id, title text, kind text, version int, manifest_object uuid,
               updated_at timestamptz, deleted_at timestamptz null)
objects       (id uuid pk, owner_id, sha256 text, bytes bigint, provider text  -- 'telegram' | 'pinata' | 'filebase'
               , wrapped_key bytea, chunks jsonb  -- [{ ref, size }]: Telegram file_id+message_id, or IPFS CID
               , created_at, unique(owner_id, sha256))
```

The title is plaintext so the library lists before decrypting. **Open choice:** encrypt it too (more private, slower library).

## 6. Sync algorithm

- **Push:** a Dexie hook marks a notebook dirty → debounce 20 s → upload missing blobs (dedup by `objects.sha256`) → upload the manifest → `update notebooks_idx set version = version + 1 … where id = $1 and version = $base`. Exactly one writer wins.
- **Lost race (0 rows updated):** pull the remote copy and import it as "‹title› (conflict copy)", then push ours. Nothing is ever overwritten silently. A conflict copy is the simple, safe choice over merging ink.
- **Pull:** on start, on focus, and every 5 min: `select … where updated_at > lastPulledAt`. Newer remote and clean local → replace locally. `deleted_at` set → move to local Trash.
- **Queue:** one upload at a time, ≥ 1 s apart (Telegram allows ~1 msg/s per chat). Honour `429 retry_after`, retry 5xx with backoff, and resume after a restart (queue lives in Dexie `outbox`).

## 7. Telegram setup flow (Settings → Storage)

1. "Open @BotFather" → `/newbot` → paste the token. The app checks it with `getMe`.
2. "Now send /start to your bot" → the app polls `getUpdates` and saves `chat.id`.
3. The user picks a sync passphrase (asked twice) → profile salt + verifier written.

To restore on a new device: sign in → paste the same token → enter the passphrase.

## 8. Code layout

```
src/sync/supabase.ts       client (null when env vars are missing)         [F1 auth brief]
src/sync/auth.ts           OTP + Google                                    [F1 auth brief]
src/sync/crypto.ts         deriveKey, wrap/unwrap, encrypt/decryptChunks   pure, unit-tested
src/sync/stores/types.ts   interface BlobStore { put(bytes): Ref[]; get(refs): bytes; remove(refs) }
src/sync/stores/telegram.ts
src/sync/stores/pinata.ts  (later; same interface)
src/sync/engine.ts         outbox, debounce, push/pull, conflict copy
src/ui/StorageSheet.tsx    setup flow + status ("Synced 2 min ago", "Sync paused")
```

Dexie v4 adds `outbox: "++seq, notebookId"` and `syncMeta: "key"`.

## 9. Trade-offs

| Choice | Gain | Cost |
|---|---|---|
| Per-user Telegram | no total limit, free, no server | setup takes ~2 min; Telegram's rules don't promise "storage" use, so it could change |
| Notebook-level manifest | reuses tested backup code, simple | edits re-upload the whole manifest (KB to MB) instead of a row diff |
| Conflict copy, not merge | can never lose ink | two copies to tidy by hand (rare: one person, several devices) |
| No live collaboration (F4) yet | far simpler | Yjs + Realtime later, on text pages only |

## 10. Build order (each: TDD → full suite → review → branch)

1. F1 auth (`docs/auth.md`)
2. `crypto.ts` + `telegram.ts` BlobStore
3. Sync engine + StorageSheet
4. Pinata/Filebase BlobStore (optional)
5. F2 share links (needs a decision: shared notebooks are re-encrypted with a share key in the link fragment `#k=…`)

## 11. Revisit when

- Supabase index rows near 400 MB, or the project hits pauses → move the index onto Telegram too (Supabase becomes auth only).
- Telegram changes Bot API file rules → switch the default to Pinata/Filebase through `BlobStore`.
- People share notebooks often → per-page sync and Yjs.
