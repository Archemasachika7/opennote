import { db, newId, now, PAGE_SIZE, type PageObject } from "../store/schema";

/** Largest video kept on a page (backups refuse single files over 256 MB). */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const POSTER_MAX_W = 1280;
const PAGE_W = Math.min(800, PAGE_SIZE.w * 0.8);

export class VideoTooLargeError extends Error {
  constructor(bytes: number) { super(`That video is ${Math.round(bytes / 1048576)} MB. Videos up to ${MAX_VIDEO_BYTES / 1048576} MB can go on a page.`); }
}

/** Fits a video of w x h on the page: 800 units wide, keeping its shape. */
export function videoBox(w: number, h: number): { w: number; h: number } {
  const vw = w > 0 ? w : 16, vh = h > 0 ? h : 9;
  return { w: PAGE_W, h: Math.round((PAGE_W / vw) * vh) };
}

/** "1:05" style length. */
export function formatDuration(s: number | undefined): string {
  if (!s || !Number.isFinite(s) || s <= 0) return "";
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** A frame from early in the video as the poster picture. When the browser can't decode the video, a plain flat card. */
async function makePoster(file: Blob): Promise<{ poster: Blob; w: number; h: number; duration?: number }> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), 8000);
      v.onloadeddata = () => { clearTimeout(t); res(); };
      v.onerror = () => { clearTimeout(t); rej(new Error("decode")); };
    });
    const duration = Number.isFinite(v.duration) ? v.duration : undefined;
    const at = Math.min(0.5, (duration ?? 1) / 10);
    if (at > 0) await new Promise<void>((res) => { const t = setTimeout(res, 3000); v.onseeked = () => { clearTimeout(t); res(); }; v.currentTime = at; });
    if (!v.videoWidth || !v.videoHeight) throw new Error("no picture");
    const k = Math.min(1, POSTER_MAX_W / v.videoWidth);
    const w = Math.max(1, Math.round(v.videoWidth * k)), h = Math.max(1, Math.round(v.videoHeight * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")?.drawImage(v, 0, 0, w, h);
    const poster = await new Promise<Blob | null>((res) => c.toBlob(res, "image/webp", 0.85));
    if (!poster) throw new Error("poster");
    return { poster, w, h, duration };
  } catch {
    return { poster: await plainPoster(), w: 1280, h: 720 };
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute("src");
  }
}

async function plainPoster(): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 720;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = "#1c1d23"; g.fillRect(0, 0, 1280, 720);
    g.fillStyle = "#9A9DAB"; g.font = "600 56px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("Video", 640, 380);
  }
  return (await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"))) ?? new Blob([], { type: "image/png" });
}

/**
 * Puts a video on an ink page. It is stored as a picture (its poster frame), so moving, the lasso, copy and PDF export
 * treat it like one, plus the video file, which plays in place.
 */
export async function addVideo(pageId: string, file: File | Blob, at?: { x: number; y: number }): Promise<PageObject> {
  if (file.size > MAX_VIDEO_BYTES) throw new VideoTooLargeError(file.size);
  const { poster, w: pw, h: ph, duration } = await makePoster(file);
  const box = videoBox(pw, ph);
  const objs = await db.objects.where("pageId").equals(pageId).toArray();
  const step = (objs.filter((o) => o.kind === "image").length % 12) * 36;
  const posterId = newId(), videoId = newId();
  const o: PageObject = {
    id: newId(), pageId, kind: "image", rotation: 0, ...box, blobId: posterId,
    video: { blobId: videoId, mime: file.type || "video/mp4", ...(duration ? { duration } : {}) },
    z: objs.reduce((m, x) => Math.max(m, x.z), 0) + 1,
    x: at && Number.isFinite(at.x) ? Math.max(0, Math.min(at.x, PAGE_SIZE.w - box.w)) : Math.min((PAGE_SIZE.w - box.w) / 2 + step, PAGE_SIZE.w - box.w),
    y: at && Number.isFinite(at.y) ? Math.max(0, at.y) : Math.max(0, Math.min(160 + step, PAGE_SIZE.h - box.h)),
  };
  await db.transaction("rw", [db.blobs, db.objects, db.pages, db.notebooks], async () => {
    await db.blobs.bulkAdd([{ id: posterId, data: poster }, { id: videoId, data: file }]);
    await db.objects.add(o);
    const p = await db.pages.get(pageId);
    if (p) { const t = now(); await db.pages.update(pageId, { updatedAt: t }); await db.notebooks.update(p.notebookId, { updatedAt: t }); }
  });
  return o;
}
