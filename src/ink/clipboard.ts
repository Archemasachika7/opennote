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

export function copyToClipboard(origin: string, strokes: Stroke[], objects: PageObject[]): void {
  clip = { origin, strokes: strokes.map((s) => ({ ...s })), objects: objects.map((o) => ({ ...o })), pastes: new Map() };
  void navigator.clipboard?.writeText?.(CLIP_MARKER).catch(() => {});
}

export async function cutToClipboard(origin: string, strokes: Stroke[], objects: PageObject[]): Promise<void> {
  copyToClipboard(origin, strokes, objects);
  historyFor(origin).push({ remove: strokes, add: [], objects: { before: objects, after: [] } });
  await removeObjectRows(objects.map((o) => o.id)); // blobs stay: the paste (or undo) still needs them
  await replaceStrokes(origin, strokes.map((s) => s.id), []);
  notifyPageChanged(origin);
}

/** Paste the in-app clipboard onto a page as new strokes/objects (offset when it would land on itself). */
export async function pasteClipboard(pageId: string): Promise<{ strokes: Stroke[]; objects: PageObject[] }> {
  if (!clip) return { strokes: [], objects: [] };
  const n = (clip.pastes.get(pageId) ?? 0) + (pageId === clip.origin ? 1 : 0);
  clip.pastes.set(pageId, (clip.pastes.get(pageId) ?? 0) + 1);
  const d = n * OFFSET;
  // a layer id only means something on its own page: elsewhere, content lands on the base layer
  const target = await db.pages.get(pageId);
  const known = new Set(target?.kind === "ink" ? (target.layers ?? []).map((l) => l.id) : []);
  const fixLayer = <T extends { layerId?: string }>(x: T): T => {
    if (!x.layerId || known.has(x.layerId)) return x;
    const copy = { ...x };
    delete copy.layerId;
    return copy;
  };
  const strokes = clip.strokes.map((s) => fixLayer({ ...translate(s, d, d), id: crypto.randomUUID() }));
  const maxZ = (await db.objects.where("pageId").equals(pageId).toArray()).reduce((m, o) => Math.max(m, o.z), 0);
  const objects = clip.objects.map((o, i) => fixLayer({ ...o, id: crypto.randomUUID(), pageId, x: o.x + d, y: o.y + d, z: maxZ + 1 + i }));
  await replaceStrokes(pageId, [], strokes);
  await putObjects(objects);
  historyFor(pageId).push({ remove: [], add: strokes, objects: { before: [], after: objects } });
  notifyPageChanged(pageId);
  return { strokes, objects };
}
