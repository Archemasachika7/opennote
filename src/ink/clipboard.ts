import { useSyncExternalStore } from "react";
import type { PageObject } from "../store/schema";
import { db } from "../store/schema";
import { replaceStrokes } from "../store/strokes";
import type { Stroke } from "./model";
import { translate } from "./geometry";
import { historyFor } from "./history";
import { putObjects, removeObjectRows } from "./objects";
import { notifyPageChanged } from "./pageEvents";

/** Text put on the system clipboard so a Ctrl+V elsewhere in the app knows to paste the in-app selection. */
export const CLIP_MARKER = "opennote-clip:v1";
const OFFSET = 24;

type Clip = { origin: string; strokes: Stroke[]; objects: PageObject[]; pastes: Map<string, number> };
let clip: Clip | null = null;

export const hasClipboard = (): boolean => !!clip && (clip.strokes.length > 0 || clip.objects.length > 0);

/** Lets the notebook show a Paste bar as soon as something is copied or cut. */
const subs = new Set<() => void>();
let version = 0;
const changed = () => { version++; subs.forEach((f) => f()); };
export const useClipboardVersion = (): number =>
  useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version, () => version);
/** How many strokes/objects are waiting to be pasted. */
export const clipboardSize = (): number => (clip ? clip.strokes.length + clip.objects.length : 0);
export function clearClipboard(): void { clip = null; changed(); }

export function copyToClipboard(origin: string, strokes: Stroke[], objects: PageObject[]): void {
  clip = { origin, strokes: strokes.map((s) => ({ ...s })), objects: objects.map((o) => ({ ...o })), pastes: new Map() };
  void navigator.clipboard?.writeText?.(CLIP_MARKER).catch(() => {});
  changed();
}

export async function cutToClipboard(origin: string, strokes: Stroke[], objects: PageObject[]): Promise<void> {
  copyToClipboard(origin, strokes, objects);
  historyFor(origin).push({ remove: strokes, add: [], objects: { before: objects, after: [] } });
  await removeObjectRows(objects.map((o) => o.id)); // blobs stay: the paste (or undo) still needs them
  await replaceStrokes(origin, strokes.map((s) => s.id), []);
  notifyPageChanged(origin);
}

/** Keep a layer id only if the target page has that layer (layer ids only mean something on their own page). */
async function layerFixer(pageId: string) {
  const target = await db.pages.get(pageId);
  const known = new Set(target?.kind === "ink" ? (target.layers ?? []).map((l) => l.id) : []);
  return <T extends { layerId?: string }>(x: T): T => {
    if (!x.layerId || known.has(x.layerId)) return x;
    const copy = { ...x };
    delete copy.layerId;
    return copy;
  };
}

/**
 * Move a selection to another page, at the same place on the page. The clipboard is left alone.
 * Each page gets its own undo step (undo on the old page brings it back there).
 */
export async function moveSelection(from: string, to: string, strokes: Stroke[], objects: PageObject[]): Promise<{ strokes: Stroke[]; objects: PageObject[] }> {
  if (from === to) return { strokes, objects };
  const fix = await layerFixer(to);
  const moved = strokes.map((st) => fix({ ...st, id: crypto.randomUUID() }));
  const maxZ = (await db.objects.where("pageId").equals(to).toArray()).reduce((m, o) => Math.max(m, o.z), 0);
  const movedObjs = objects.map((o, i) => fix({ ...o, id: crypto.randomUUID(), pageId: to, z: maxZ + 1 + i }));
  await replaceStrokes(from, strokes.map((st) => st.id), []);
  await removeObjectRows(objects.map((o) => o.id));
  await replaceStrokes(to, [], moved);
  await putObjects(movedObjs);
  historyFor(from).push({ remove: strokes, add: [], objects: { before: objects, after: [] } });
  historyFor(to).push({ remove: [], add: moved, objects: { before: [], after: movedObjs } });
  notifyPageChanged(from);
  notifyPageChanged(to);
  return { strokes: moved, objects: movedObjs };
}

/** Paste the in-app clipboard onto a page as new strokes/objects (offset when it would land on itself). */
export async function pasteClipboard(pageId: string): Promise<{ strokes: Stroke[]; objects: PageObject[] }> {
  if (!clip) return { strokes: [], objects: [] };
  const n = (clip.pastes.get(pageId) ?? 0) + (pageId === clip.origin ? 1 : 0);
  clip.pastes.set(pageId, (clip.pastes.get(pageId) ?? 0) + 1);
  const d = n * OFFSET;
  // a layer id only means something on its own page: elsewhere, content lands on the base layer
  const fixLayer = await layerFixer(pageId);
  const strokes = clip.strokes.map((s) => fixLayer({ ...translate(s, d, d), id: crypto.randomUUID() }));
  const maxZ = (await db.objects.where("pageId").equals(pageId).toArray()).reduce((m, o) => Math.max(m, o.z), 0);
  const objects = clip.objects.map((o, i) => fixLayer({ ...o, id: crypto.randomUUID(), pageId, x: o.x + d, y: o.y + d, z: maxZ + 1 + i }));
  await replaceStrokes(pageId, [], strokes);
  await putObjects(objects);
  historyFor(pageId).push({ remove: [], add: strokes, objects: { before: [], after: objects } });
  notifyPageChanged(pageId);
  return { strokes, objects };
}
