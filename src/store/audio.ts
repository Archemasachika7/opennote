import { useSyncExternalStore } from "react";
import { db, newId, now, type Recording, type TranscriptSegment } from "../store/schema";
import { getStrokes } from "./strokes";

export type AudioTranscriptSegment = TranscriptSegment;

/** What the UI sees of a recording (the row minus storage details). */
export interface AudioClipMeta {
  id: string;
  notebookId: string;
  title: string;
  durationMs: number;
  mimeType: string;
  createdAt: number;
  transcript?: string;
  languageCode?: string;
  transcriptSegments?: AudioTranscriptSegment[];
}

export interface AudioLiveState {
  /** Currently recording clip */
  recording: { notebookId: string; clipId: string; startedAt: number; accumulatedMs: number; paused: boolean } | null;
  /** Currently playing clip (for Ink Replay sync) */
  playback: {
    notebookId: string;
    clipId: string;
    currentMs: number;
    durationMs?: number;
    playing: boolean;
    inkReplay: boolean;
    tapToSeek: boolean;
  } | null;
}

let liveState: AudioLiveState = { recording: null, playback: null };
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function getAudioLiveState(): AudioLiveState { return liveState; }
export function setAudioLiveState(patch: Partial<AudioLiveState>): void {
  liveState = { ...liveState, ...patch };
  notify();
}
export function useAudioLiveState(): AudioLiveState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getAudioLiveState);
}

/** Called when a user taps an audio-synced stroke in Tap-to-Seek mode. */
const seekSubs = new Set<(clipId: string, offsetMs: number) => void>();
export function requestAudioSeek(clipId: string, offsetMs: number): void {
  seekSubs.forEach((fn) => fn(clipId, offsetMs));
}
export function onAudioSeekRequest(fn: (clipId: string, offsetMs: number) => void): () => void {
  seekSubs.add(fn);
  return () => { seekSubs.delete(fn); };
}

/** Current recording offset in ms if recording is active for this notebook (or any active recording). */
export function currentRecordingStamp(perfNow = Date.now()): { clipId: string; offsetMs: number } | undefined {
  const rec = liveState.recording;
  if (!rec) return undefined;
  const extra = rec.paused ? 0 : Math.max(0, perfNow - rec.startedAt);
  return { clipId: rec.clipId, offsetMs: Math.round(rec.accumulatedMs + extra) };
}

/** Count how many ink strokes in `notebookId` are timestamp-synced to `clipId`. */
export async function countSyncedStrokesForClip(notebookId: string, clipId: string): Promise<number> {
  if (!notebookId || !clipId) return 0;
  try {
    const pages = await db.pages.where("notebookId").equals(notebookId).toArray();
    let total = 0;
    for (const p of pages) {
      if (p.kind !== "ink") continue;
      const strokes = await getStrokes(p.id);
      for (const s of strokes) {
        if (s.audioSync?.clipId === clipId) total++;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

let lastCreatedAt = 0;

function toMeta(r: Recording): AudioClipMeta {
  const { blobId: _b, updatedAt: _u, ...meta } = r;
  return meta;
}

export async function listAudioClips(notebookId: string): Promise<AudioClipMeta[]> {
  const rows = await db.recordings.where("notebookId").equals(notebookId).toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt).map(toMeta);
}

export async function saveAudioClip(
  notebookId: string,
  blob: Blob,
  opts: {
    id?: string;
    title?: string;
    durationMs: number;
    transcript?: string;
    languageCode?: string;
    transcriptSegments?: AudioTranscriptSegment[];
  },
): Promise<AudioClipMeta> {
  const id = opts.id ?? newId();
  const blobId = newId();
  // one transaction: the audio and its row land together, and parallel saves can't overwrite each other
  return db.transaction("rw", [db.recordings, db.blobs], async () => {
    const count = await db.recordings.where("notebookId").equals(notebookId).count();
    // strictly increasing, so two saves in the same millisecond still list in order
    const t = (lastCreatedAt = Math.max(now(), lastCreatedAt + 1));
    const row: Recording = {
      id,
      notebookId,
      blobId,
      title: opts.title?.trim() || `Recording ${count + 1}`,
      durationMs: Math.max(0, Math.round(opts.durationMs)),
      mimeType: blob.type || "audio/webm",
      createdAt: t,
      updatedAt: t,
      ...(opts.transcript ? { transcript: opts.transcript } : {}),
      ...(opts.languageCode ? { languageCode: opts.languageCode } : {}),
      ...(opts.transcriptSegments ? { transcriptSegments: opts.transcriptSegments } : {}),
    };
    await db.blobs.put({ id: blobId, data: blob });
    await db.recordings.put(row);
    return toMeta(row);
  });
}

export async function updateAudioClipMeta(
  _notebookId: string,
  clipId: string,
  patch: Partial<Omit<AudioClipMeta, "id" | "notebookId">>,
): Promise<AudioClipMeta | null> {
  return db.transaction("rw", db.recordings, async () => {
    const row = await db.recordings.get(clipId);
    if (!row) return null;
    const next: Recording = { ...row, ...patch, id: row.id, notebookId: row.notebookId, blobId: row.blobId, updatedAt: now() };
    await db.recordings.put(next);
    return toMeta(next);
  });
}

export async function getAudioClipBlob(clipId: string): Promise<Blob | null> {
  const row = await db.recordings.get(clipId);
  if (!row) return null;
  const blob = await db.blobs.get(row.blobId);
  return blob?.data ?? null;
}

export async function deleteAudioClip(_notebookId: string, clipId: string): Promise<void> {
  await db.transaction("rw", [db.recordings, db.blobs], async () => {
    const row = await db.recordings.get(clipId);
    if (!row) return;
    await db.blobs.delete(row.blobId);
    await db.recordings.delete(clipId);
  });
  if (liveState.playback?.clipId === clipId) {
    setAudioLiveState({ playback: null });
  }
}
