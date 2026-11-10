import { useEffect, useSyncExternalStore } from "react";
import { db, PAGE_SIZE, type Page, type Paper, type Template } from "./schema";

export type StemTemplate =
  | Template
  | "cornell"
  | "isometric"
  | "hex"
  | "engineering"
  | "columns"
  | "staff"
  | "planner";

export const ALL_TEMPLATES: { id: StemTemplate; label: string; group: "basic" | "stem" }[] = [
  { id: "blank", label: "Blank", group: "basic" },
  { id: "ruled", label: "Ruled", group: "basic" },
  { id: "grid", label: "Grid", group: "basic" },
  { id: "dot", label: "Dot Grid", group: "basic" },
  { id: "cornell", label: "Cornell Notes", group: "stem" },
  { id: "isometric", label: "Isometric 3D", group: "stem" },
  { id: "hex", label: "Hex Chemistry", group: "stem" },
  { id: "engineering", label: "Engineering Pad", group: "stem" },
  { id: "columns", label: "Two-Column Proof", group: "stem" },
  { id: "staff", label: "Music Staff", group: "stem" },
  { id: "planner", label: "Study Planner", group: "stem" },
];

export function isBasicTemplate(t: StemTemplate): t is Template {
  return t === "blank" || t === "ruled" || t === "grid" || t === "dot";
}

const BLOB_ID = "opennote:page-templates:v1";
let cache: Record<string, StemTemplate> = {};
let hydrated = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export async function hydratePageTemplates(): Promise<void> {
  try {
    const row = await db.blobs.get(BLOB_ID);
    if (row) {
      const raw = typeof row.data?.text === "function"
        ? await row.data.text()
        : (row as unknown as { json?: string }).json ?? "";
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, StemTemplate>;
        if (parsed && typeof parsed === "object") cache = parsed;
      }
    }
  } catch { /* ignore */ }
  hydrated = true;
  notify();
}

export function getEffectiveTemplate(page: Page): StemTemplate {
  if (page.kind !== "ink") return "blank";
  return cache[page.id] ?? page.template;
}

export function usePageTemplate(page: Page): StemTemplate {
  useEffect(() => {
    if (!hydrated) void hydratePageTemplates();
  }, []);
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => getEffectiveTemplate(page),
  );
}

export async function setStemTemplateForPage(
  pageId: string,
  tpl: StemTemplate,
  updateBase: (id: string, patch: { template: Template }) => Promise<unknown>,
): Promise<void> {
  if (isBasicTemplate(tpl)) {
    const next = { ...cache };
    delete next[pageId];
    cache = next;
    const json = JSON.stringify(cache);
    await db.blobs.put({ id: BLOB_ID, data: new Blob([json], { type: "application/json" }), json } as { id: string; data: Blob });
    await updateBase(pageId, { template: tpl });
    notify();
    return;
  }
  cache = { ...cache, [pageId]: tpl };
  const json = JSON.stringify(cache);
  await db.blobs.put({ id: BLOB_ID, data: new Blob([json], { type: "application/json" }), json } as { id: string; data: Blob });
  // Set base template to "blank" so CSS background patterns do not clash underneath the STEM canvas
  await updateBase(pageId, { template: "blank" });
  notify();
}

/**
 * Draw any template (basic or STEM) onto a logical-coordinate 2D canvas `(0..w, 0..h)`.
 * Default logical page size is `PAGE_SIZE` (`1404 x 1872`).
 */
export function drawPaperTemplate(
  ctx: CanvasRenderingContext2D,
  tpl: StemTemplate,
  w: number = PAGE_SIZE.w,
  h: number = PAGE_SIZE.h,
  paper: Paper = "dark",
): void {
  if (tpl === "blank") return;
  const minor = paper === "light" ? "rgba(22, 23, 28, 0.10)" : "rgba(232, 233, 238, 0.085)";
  const major = paper === "light" ? "rgba(22, 23, 28, 0.22)" : "rgba(232, 233, 238, 0.19)";
  const accentLine = paper === "light" ? "rgba(181, 67, 15, 0.34)" : "rgba(245, 166, 35, 0.32)";

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = minor;
  ctx.fillStyle = minor;

  if (tpl === "ruled") {
    for (let y = 62; y < h; y += 62) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (tpl === "grid") {
    for (let x = 52; x < w; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 52; y < h; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();
    return;
  }

  if (tpl === "dot") {
    ctx.fillStyle = major;
    for (let y = 26; y < h; y += 52) {
      for (let x = 26; x < w; x += 52) {
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    return;
  }

  if (tpl === "cornell") {
    const headerY = 148;
    const summaryY = h - 310;
    const cueX = Math.round(w * 0.29);
    // Ruled lines in main & cue area
    for (let y = headerY + 58; y < summaryY; y += 58) {
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 40, y); ctx.stroke();
    }
    // Ruled lines in summary area
    for (let y = summaryY + 58; y < h - 40; y += 58) {
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 40, y); ctx.stroke();
    }
    // Structural dividers
    ctx.strokeStyle = accentLine;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(40, headerY); ctx.lineTo(w - 40, headerY);
    ctx.moveTo(40, summaryY); ctx.lineTo(w - 40, summaryY);
    ctx.moveTo(cueX, headerY); ctx.lineTo(cueX, summaryY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (tpl === "isometric") {
    // 30-degree isometric axes + vertical lines
    const step = 64;
    const tan30 = Math.tan(Math.PI / 6);
    // Vertical guides
    for (let x = step; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    const diagSpan = w * tan30;
    const rowStep = step * tan30 * 2;
    for (let y0 = -diagSpan; y0 < h + diagSpan; y0 += rowStep) {
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(w, y0 + diagSpan); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y0 + diagSpan); ctx.lineTo(w, y0); ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (tpl === "hex") {
    // Flat-top organic chemistry hexagons
    const R = 36;
    const H = Math.sqrt(3) * R;
    const dx = 1.5 * R;
    ctx.strokeStyle = major;
    ctx.lineWidth = 1.4;
    for (let col = 0, cx = 64; cx < w - 36; col++, cx += dx) {
      const yOffset = (col % 2) * (H / 2);
      for (let cy = 68 + yOffset; cy < h - 36; cy += H) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          const px = cx + R * Math.cos(a);
          const py = cy + R * Math.sin(a);
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (tpl === "engineering") {
    const pad = 64;
    const topY = 136;
    const cell = 32;
    // Fine minor grid inside frame
    for (let idx = 1, x = pad + cell; x < w - pad; idx++, x += cell) {
      ctx.strokeStyle = idx % 5 === 0 ? major : minor;
      ctx.lineWidth = idx % 5 === 0 ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, h - pad); ctx.stroke();
    }
    for (let idx = 1, y = topY + cell; y < h - pad; idx++, y += cell) {
      ctx.strokeStyle = idx % 5 === 0 ? major : minor;
      ctx.lineWidth = idx % 5 === 0 ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    }
    // Outer engineering border + header block
    ctx.strokeStyle = accentLine;
    ctx.lineWidth = 2.4;
    ctx.strokeRect(pad, 52, w - pad * 2, h - 52 - pad);
    ctx.beginPath();
    ctx.moveTo(pad, topY); ctx.lineTo(w - pad, topY);
    ctx.moveTo(pad + (w - pad * 2) * 0.25, 52); ctx.lineTo(pad + (w - pad * 2) * 0.25, topY);
    ctx.moveTo(pad + (w - pad * 2) * 0.75, 52); ctx.lineTo(pad + (w - pad * 2) * 0.75, topY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (tpl === "columns") {
    const headerY = 140;
    const midX = Math.round(w / 2);
    for (let y = headerY + 58; y < h - 48; y += 58) {
      ctx.beginPath(); ctx.moveTo(48, y); ctx.lineTo(w - 48, y); ctx.stroke();
    }
    ctx.strokeStyle = accentLine;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(48, headerY); ctx.lineTo(w - 48, headerY);
    ctx.moveTo(midX, headerY - 48); ctx.lineTo(midX, h - 48);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (tpl === "staff") {
    // 10 five-line musical staves
    ctx.strokeStyle = major;
    ctx.lineWidth = 1.5;
    const left = 76, right = w - 76;
    const lineGap = 15;
    const staffGap = 166;
    for (let s = 0; s < 10; s++) {
      const y0 = 120 + s * staffGap;
      if (y0 + lineGap * 4 > h - 60) break;
      for (let l = 0; l < 5; l++) {
        const y = y0 + l * lineGap;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(left, y0); ctx.lineTo(left, y0 + lineGap * 4);
      ctx.moveTo(right, y0); ctx.lineTo(right, y0 + lineGap * 4);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (tpl === "planner") {
    const headerY = 142;
    const splitX = Math.round(w * 0.54);
    // Left column: hourly schedule slots
    for (let y = headerY + 64; y < h - 64; y += 64) {
      ctx.beginPath(); ctx.moveTo(56, y); ctx.lineTo(splitX - 28, y); ctx.stroke();
      // Time-gutter tick
      ctx.beginPath(); ctx.moveTo(148, y - 48); ctx.lineTo(148, y); ctx.stroke();
    }
    // Right column: top priorities checkboxes + notes grid
    const midRightY = Math.round(h * 0.48);
    for (let y = headerY + 64; y < midRightY; y += 64) {
      ctx.strokeRect(splitX + 28, y - 34, 24, 24);
      ctx.beginPath(); ctx.moveTo(splitX + 68, y); ctx.lineTo(w - 56, y); ctx.stroke();
    }
    for (let y = midRightY + 56; y < h - 64; y += 56) {
      ctx.beginPath(); ctx.moveTo(splitX + 28, y); ctx.lineTo(w - 56, y); ctx.stroke();
    }
    ctx.strokeStyle = accentLine;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(56, headerY); ctx.lineTo(w - 56, headerY);
    ctx.moveTo(splitX, headerY); ctx.lineTo(splitX, h - 64);
    ctx.moveTo(splitX + 28, midRightY); ctx.lineTo(w - 56, midRightY);
    ctx.stroke();
    ctx.restore();
  }
}
