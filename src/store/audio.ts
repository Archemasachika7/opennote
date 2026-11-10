import { useSyncExternalStore } from "react";
import { db, newId, now } from "../store/schema";
import { getStrokes } from "./strokes";

export interface AudioTranscriptSegment {
  offsetMs: number;
  endMs: number;
  text: string;
}

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

const indexKey = (notebookId: string) => `opennote:audio-index:${notebookId}`;
const clipBlobKey = (clipId: string) => `opennote:audio-clip:${clipId}`;

export async function listAudioClips(notebookId: string): Promise<AudioClipMeta[]> {
  try {
    const row = await db.blobs.get(indexKey(notebookId));
    if (!row) return [];
    const raw = typeof row.data?.text === "function"
      ? await row.data.text()
      : (row as unknown as { json?: string }).json ?? "";
    if (!raw) return [];
    const list = JSON.parse(raw) as AudioClipMeta[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeAudioIndex(notebookId: string, list: AudioClipMeta[]): Promise<void> {
  const json = JSON.stringify(list);
  await db.blobs.put({
    id: indexKey(notebookId),
    data: new Blob([json], { type: "application/json" }),
    json,
  } as { id: string; data: Blob });
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
  const prev = await listAudioClips(notebookId);
  const clip: AudioClipMeta = {
    id: opts.id ?? newId(),
    notebookId,
    title: opts.title?.trim() || `Recording ${prev.length + 1}`,
    durationMs: Math.max(0, Math.round(opts.durationMs)),
    mimeType: blob.type || "audio/webm",
    createdAt: now(),
    ...(opts.transcript ? { transcript: opts.transcript } : {}),
    ...(opts.languageCode ? { languageCode: opts.languageCode } : {}),
    ...(opts.transcriptSegments ? { transcriptSegments: opts.transcriptSegments } : {}),
  };
  const bytes = typeof blob.arrayBuffer === "function" ? await blob.arrayBuffer().catch(() => undefined) : undefined;
  await db.blobs.put({
    id: clipBlobKey(clip.id),
    data: blob,
    ...(bytes ? { bytes, mimeType: clip.mimeType } : {}),
  } as { id: string; data: Blob });
  await writeAudioIndex(notebookId, [...prev, clip]);
  return clip;
}

export async function updateAudioClipMeta(
  notebookId: string,
  clipId: string,
  patch: Partial<Omit<AudioClipMeta, "id" | "notebookId">>,
): Promise<AudioClipMeta | null> {
  const prev = await listAudioClips(notebookId);
  let updated: AudioClipMeta | null = null;
  const next = prev.map((c) => {
    if (c.id !== clipId) return c;
    updated = { ...c, ...patch };
    return updated;
  });
  if (!updated) return null;
  await writeAudioIndex(notebookId, next);
  return updated;
}

export async function getAudioClipBlob(clipId: string): Promise<Blob | null> {
  const row = await db.blobs.get(clipBlobKey(clipId)) as { data?: Blob; bytes?: ArrayBuffer; mimeType?: string } | undefined;
  if (!row) return null;
  if (row.data instanceof Blob) return row.data;
  if (row.bytes) return new Blob([row.bytes], { type: row.mimeType || "audio/wav" });
  return row.data ?? null;
}

export async function deleteAudioClip(notebookId: string, clipId: string): Promise<void> {
  const prev = await listAudioClips(notebookId);
  await db.blobs.delete(clipBlobKey(clipId));
  await writeAudioIndex(notebookId, prev.filter((c) => c.id !== clipId));
  if (liveState.playback?.clipId === clipId) {
    setAudioLiveState({ playback: null });
  }
}
