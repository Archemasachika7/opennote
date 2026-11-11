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
  | "planner"
  | "college"
  | "todo"
  | "meeting"
  | "weekly"
  | "monthly"
  | "habit"
  | "coordinate"
  | "storyboard";

export const ALL_TEMPLATES: { id: StemTemplate; label: string; group: "basic" | "stem" | "planning" }[] = [
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
  { id: "college", label: "College Ruled", group: "basic" },
  { id: "coordinate", label: "Coordinate Plane", group: "stem" },
  { id: "todo", label: "To-do List", group: "planning" },
  { id: "meeting", label: "Meeting Notes", group: "planning" },
  { id: "weekly", label: "Weekly Planner", group: "planning" },
  { id: "monthly", label: "Monthly Calendar", group: "planning" },
  { id: "habit", label: "Habit Tracker", group: "planning" },
  { id: "storyboard", label: "Storyboard", group: "planning" },
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

  if (drawPlanningTemplate(ctx, tpl, w, h, { minor, major, accentLine, label: paper === "light" ? "rgba(22, 23, 28, 0.42)" : "rgba(232, 233, 238, 0.38)" })) {
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

type Ink = { minor: string; major: string; accentLine: string; label: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function label(ctx: CanvasRenderingContext2D, ink: Ink, text: string, x: number, y: number, size = 24, align: CanvasTextAlign = "left"): void {
  ctx.save();
  ctx.fillStyle = ink.label; ctx.font = `500 ${size}px Inter, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
  ctx.restore();
}
function rules(ctx: CanvasRenderingContext2D, x1: number, x2: number, y1: number, y2: number, gap: number): void {
  for (let y = y1; y < y2; y += gap) line(ctx, x1, y, x2, y);
}

/**
 * Planning and study pages (to-do, meeting, weekly, monthly, habits, coordinate plane, storyboard, college ruled).
 * Flat lines and faint printed labels only; the caller saves/restores the context. Returns false for other templates.
 */
export function drawPlanningTemplate(ctx: CanvasRenderingContext2D, tpl: StemTemplate, w: number, h: number, ink: Ink): boolean {
  const pad = 56;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ink.minor;

  if (tpl === "college") {
    rules(ctx, 0, w, 150, h, 54);
    ctx.strokeStyle = ink.accentLine; ctx.lineWidth = 2;
    line(ctx, 150, 0, 150, h);
    return true;
  }

  if (tpl === "todo") {
    label(ctx, ink, "To do", pad, 96, 34);
    ctx.strokeStyle = ink.accentLine; ctx.lineWidth = 2.2; line(ctx, pad, 124, w - pad, 124);
    ctx.lineWidth = 1.5;
    for (let y = 124 + 76; y < h - pad; y += 76) {
      ctx.strokeStyle = ink.major; ctx.strokeRect(pad, y - 44, 32, 32);
      ctx.strokeStyle = ink.minor; line(ctx, pad + 52, y, w - pad, y);
    }
    return true;
  }

  if (tpl === "meeting") {
    const fields = ["Meeting", "Date", "People"];
    fields.forEach((f, i) => { const y = 96 + i * 64; label(ctx, ink, f, pad, y); line(ctx, pad + 130, y + 6, w - pad, y + 6); });
    const agendaY = 300, actionsY = Math.round(h * 0.68);
    ctx.strokeStyle = ink.accentLine; ctx.lineWidth = 2.2;
    line(ctx, pad, agendaY, w - pad, agendaY); line(ctx, pad, actionsY, w - pad, actionsY);
    label(ctx, ink, "Notes", pad, agendaY - 14);
    label(ctx, ink, "Action items", pad, actionsY - 14);
    ctx.strokeStyle = ink.minor; ctx.lineWidth = 1.5;
    rules(ctx, pad, w - pad, agendaY + 58, actionsY - 20, 58);
    for (let y = actionsY + 70; y < h - pad; y += 70) {
      ctx.strokeStyle = ink.major; ctx.strokeRect(pad, y - 40, 28, 28);
      ctx.strokeStyle = ink.minor; line(ctx, pad + 46, y, w - pad - 220, y); line(ctx, w - pad - 190, y, w - pad, y);
    }
    label(ctx, ink, "Who", w - pad - 190, actionsY + 32, 20);
    return true;
  }

  if (tpl === "weekly") {
    label(ctx, ink, "Week of", pad, 90, 28);
    line(ctx, pad + 120, 96, pad + 520, 96);
    const top = 130, rows = 4, cols = 2;
    const cellW = (w - pad * 2) / cols, cellH = (h - top - pad) / rows;
    ctx.strokeStyle = ink.major;
    for (let i = 0; i < rows * cols; i++) {
      const x = pad + (i % cols) * cellW, y = top + Math.floor(i / cols) * cellH;
      ctx.strokeRect(x, y, cellW, cellH);
      label(ctx, ink, i < 7 ? DAYS[i] : "Notes", x + 18, y + 38, 24);
      ctx.strokeStyle = ink.minor; rules(ctx, x + 18, x + cellW - 18, y + 100, y + cellH - 10, 50); ctx.strokeStyle = ink.major;
    }
    return true;
  }

  if (tpl === "monthly") {
    label(ctx, ink, "Month", pad, 92, 28);
    line(ctx, pad + 100, 98, pad + 520, 98);
    const top = 150, cols = 7, rows = 6;
    const cw = (w - pad * 2) / cols, ch = (h - top - 60 - pad) / rows;
    DAYS.forEach((d, i) => label(ctx, ink, d, pad + i * cw + cw / 2, top + 36, 22, "center"));
    ctx.strokeStyle = ink.major;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.strokeRect(pad + c * cw, top + 60 + r * ch, cw, ch);
    return true;
  }

  if (tpl === "habit") {
    label(ctx, ink, "Habits", pad, 92, 30);
    const top = 140, nameW = 300, days = 31;
    const cell = (w - pad * 2 - nameW) / days;
    for (let d = 0; d < days; d++) label(ctx, ink, String(d + 1), pad + nameW + d * cell + cell / 2, top - 12, 15, "center");
    ctx.strokeStyle = ink.major;
    for (let y = top, r = 0; y + 56 < h - pad && r < 26; y += 56, r++) {
      ctx.strokeRect(pad, y, nameW, 56);
      for (let d = 0; d < days; d++) ctx.strokeRect(pad + nameW + d * cell, y, cell, 56);
    }
    return true;
  }

  if (tpl === "coordinate") {
    const cell = 36, cx = Math.round(w / 2 / cell) * cell, cy = Math.round(h / 2 / cell) * cell;
    for (let x = cx % cell; x < w; x += cell) { ctx.strokeStyle = Math.abs(x - cx) % (cell * 5) === 0 ? ink.major : ink.minor; line(ctx, x, 0, x, h); }
    for (let y = cy % cell; y < h; y += cell) { ctx.strokeStyle = Math.abs(y - cy) % (cell * 5) === 0 ? ink.major : ink.minor; line(ctx, 0, y, w, y); }
    // axes with arrowheads, numbered every 5 squares
    ctx.strokeStyle = ink.accentLine; ctx.fillStyle = ink.accentLine; ctx.lineWidth = 3;
    line(ctx, 16, cy, w - 16, cy); line(ctx, cx, 16, cx, h - 16);
    const arrow = (x: number, y: number, dx: number, dy: number) => {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 18 - dy * 9, y - dy * 18 - dx * 9); ctx.lineTo(x - dx * 18 + dy * 9, y - dy * 18 + dx * 9); ctx.closePath(); ctx.fill();
    };
    arrow(w - 12, cy, 1, 0); arrow(cx, 12, 0, -1);
    label(ctx, ink, "x", w - 40, cy - 16, 26); label(ctx, ink, "y", cx + 16, 40, 26);
    for (let k = -5; k * cell * 5 + cx > 0 && k < 20; k++) {
      if (k === 0) continue;
      const x = cx + k * cell * 5; if (x < w - 40) label(ctx, ink, String(k * 5), x, cy + 30, 18, "center");
    }
    for (let k = -8; k < 12; k++) {
      if (k === 0) continue;
      const y = cy - k * cell * 5; if (y > 40 && y < h - 20) label(ctx, ink, String(k * 5), cx - 10, y + 6, 18, "right");
    }
    return true;
  }

  if (tpl === "storyboard") {
    const cols = 2, rows = 3, gap = 40, top = 90;
    const fw = (w - pad * 2 - gap) / cols;
    const fh = (h - top - pad - gap * (rows - 1)) / rows - 120;
    label(ctx, ink, "Storyboard", pad, 64, 28);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = pad + c * (fw + gap), y = top + r * (fh + 120 + gap);
      ctx.strokeStyle = ink.major; ctx.lineWidth = 2; ctx.strokeRect(x, y, fw, fh);
      label(ctx, ink, String(r * cols + c + 1), x + 12, y + 32, 22);
      ctx.strokeStyle = ink.minor; ctx.lineWidth = 1.5; rules(ctx, x, x + fw, y + fh + 50, y + fh + 120, 40);
    }
    return true;
  }

  return false;
}
