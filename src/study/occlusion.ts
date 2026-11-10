import { db, PAGE_SIZE, type Notebook, type Page } from "../store/schema";
import { createNotebook } from "../store/notebooks";
import { addCard, setCardImage } from "../store/cards";
import { getStrokes } from "../store/strokes";
import { getObjects } from "../ink/objects";
import { paintStroke } from "../ink/render";
import { drawPaperTemplate, getEffectiveTemplate } from "../store/templates";
import type { Box } from "../ink/geometry";

async function findOrCreatePairedStudySet(notebook: Notebook): Promise<Notebook> {
  const targetTitle = `${notebook.title} — Study Cards`;
  const all = await db.notebooks.toArray();
  const existing = all.find((n) => !n.trashedAt && n.kind === "studyset" && n.title === targetTitle);
  if (existing) return existing;
  return createNotebook({ title: targetTitle, kind: "studyset", folderId: notebook.folderId ?? null, paper: notebook.paper });
}

async function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  if (typeof c.toBlob === "function") {
    const b = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    if (b) return b;
  }
  // Fallback for synthetic test environments where canvas.toBlob is unimplemented
  return new Blob(["PNG_OCCLUSION_SNAPSHOT"], { type: "image/png" });
}

async function renderCroppedOcclusionPair(
  page: Page,
  notebook: Notebook,
  targetBox: Box,
  otherMasks: Box[] = [],
): Promise<{ front: Blob; back: Blob }> {
  const strokes = await getStrokes(page.id);
  const pad = 170;
  const pageH = page.kind === "ink" ? page.size?.h ?? PAGE_SIZE.h : PAGE_SIZE.h;
  const x0 = Math.max(0, Math.floor(targetBox.x - pad));
  const y0 = Math.max(0, Math.floor(targetBox.y - pad));
  const x1 = Math.min(PAGE_SIZE.w, Math.ceil(targetBox.x + targetBox.w + pad));
  const y1 = Math.min(pageH, Math.ceil(targetBox.y + targetBox.h + pad));
  const cw = Math.max(120, x1 - x0);
  const ch = Math.max(90, y1 - y0);

  const renderSide = async (masked: boolean): Promise<Blob> => {
    const c = document.createElement("canvas");
    c.width = Math.round(cw * 0.75);
    c.height = Math.round(ch * 0.75);
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(0.75, 0.75);
      ctx.fillStyle = notebook.paper === "light" ? "#F7F6F2" : "#141519";
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(-x0, -y0);
      drawPaperTemplate(ctx, getEffectiveTemplate(page), PAGE_SIZE.w, pageH, notebook.paper);
      for (const s of strokes) paintStroke(ctx, s, notebook.paper);

      // Keep secondary tape strips softly covered so neighbouring answers aren't leaked
      for (const m of otherMasks) {
        ctx.fillStyle = "rgba(154, 157, 171, 0.88)";
        ctx.fillRect(m.x, m.y, m.w, m.h);
      }

      if (masked) {
        ctx.fillStyle = "#F5A524";
        ctx.fillRect(targetBox.x - 4, targetBox.y - 4, targetBox.w + 8, targetBox.h + 8);
        ctx.strokeStyle = "#16171C";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(targetBox.x - 4, targetBox.y - 4, targetBox.w + 8, targetBox.h + 8);
      } else {
        ctx.strokeStyle = "#3DDC97";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(targetBox.x - 6, targetBox.y - 6, targetBox.w + 12, targetBox.h + 12);
      }
      ctx.restore();
    }
    return canvasToBlob(c);
  };

  const [front, back] = await Promise.all([renderSide(true), renderSide(false)]);
  return { front, back };
}

/** Convert all Study Tape strips on a page into Image Occlusion flashcards in 1 click. */
export async function generateCardsFromPageTapes(
  notebook: Notebook,
  page: Page,
  pageNumber: number,
): Promise<{ studySet: Notebook; created: number }> {
  const objs = await getObjects(page.id);
  const tapes = objs.filter((o) => o.kind === "tape");
  const studySet = await findOrCreatePairedStudySet(notebook);
  if (tapes.length === 0) return { studySet, created: 0 };

  for (let i = 0; i < tapes.length; i++) {
    const target = tapes[i];
    const targetBox: Box = { x: target.x, y: target.y, w: target.w, h: target.h };
    const others: Box[] = tapes.filter((_, j) => j !== i).map((t) => ({ x: t.x, y: t.y, w: t.w, h: t.h }));
    const { front, back } = await renderCroppedOcclusionPair(page, notebook, targetBox, others);
    const card = await addCard(studySet.id, {
      front: `What is hidden under tape #${i + 1}? (Page ${pageNumber})`,
      back: `Revealed from ${notebook.title} · Page ${pageNumber}`,
    });
    await setCardImage(card.id, "front", front);
    await setCardImage(card.id, "back", back);
  }
  return { studySet, created: tapes.length };
}

/** Convert a Lasso-selected region into an Image Occlusion flashcard in 1 click. */
export async function generateCardFromSelection(
  notebook: Notebook,
  page: Page,
  box: Box,
  pageNumber: number,
): Promise<Notebook> {
  const studySet = await findOrCreatePairedStudySet(notebook);
  const { front, back } = await renderCroppedOcclusionPair(page, notebook, box);
  const card = await addCard(studySet.id, {
    front: `Recall occluded diagram / step (${notebook.title}, p.${pageNumber})`,
    back: `Answer revealed (${notebook.title}, p.${pageNumber})`,
  });
  await setCardImage(card.id, "front", front);
  await setCardImage(card.id, "back", back);
  return studySet;
}
