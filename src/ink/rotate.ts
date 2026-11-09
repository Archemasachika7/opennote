import { db, PAGE_SIZE, type InkPage } from "../store/schema";
import { getPage, updatePage } from "../store/pages";
import { getStrokes, replaceStrokes } from "../store/strokes";
import { getObjects, putObjects } from "./objects";
import { STRIDE } from "./model";
import { notifyPageChanged } from "./pageEvents";

/**
 * Rotate an ink page 90 degrees clockwise. Pages keep the app's fixed logical width, so the turned
 * content is scaled by k = width / height to fit (portrait <-> landscape).
 */
export async function rotatePage(pageId: string): Promise<void> {
  const p = await getPage(pageId);
  if (!p || p.kind !== "ink") return;
  const W = PAGE_SIZE.w;
  const H = p.size?.h ?? PAGE_SIZE.h;
  const k = W / H;
  const map = (x: number, y: number): [number, number] => [(H - y) * k, x * k];

  const strokes = await getStrokes(pageId);
  const turned = strokes.map((s) => {
    const pts = new Float32Array(s.points);
    for (let i = 0; i < pts.length; i += STRIDE) [pts[i], pts[i + 1]] = map(pts[i], pts[i + 1]);
    return { ...s, points: pts, width: s.width * k };
  });
  const objects = (await getObjects(pageId)).map((o) => {
    const [cx, cy] = map(o.x + o.w / 2, o.y + o.h / 2);
    const w = o.w * k;
    const h = o.h * k;
    return { ...o, x: cx - w / 2, y: cy - h / 2, w, h, rotation: (o.rotation + 90) % 360 };
  });
  const background: InkPage["background"] = p.background ? { ...p.background, rotation: ((p.background.rotation ?? 0) + 90) % 360 } : undefined;

  await db.transaction("rw", [db.strokes, db.objects, db.pages, db.notebooks], async () => {
    await replaceStrokes(pageId, strokes.map((s) => s.id), turned);
    await putObjects(objects);
    await updatePage(pageId, { size: { w: W, h: Math.round(W * k) }, ...(background ? { background } : {}) });
  });
  notifyPageChanged(pageId);
}
