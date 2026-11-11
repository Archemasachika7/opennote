/**
 * "Crop by drawing around it" (S Note's stroke frame): turn a lasso selection (ink, pictures, text
 * boxes, tape) into one PNG, cropped to the selection with a small margin, at 3x for sharpness.
 */
import type { PageObject, Paper } from "../store/schema";
import type { Stroke } from "./model";
import type { Box } from "./geometry";
import { paintStroke } from "./render";
import { getBlob } from "./objects";

const SCALE = 3;
const MARGIN = 12;
const PAPER: Record<Paper, string> = { dark: "#141519", light: "#F7F6F2" };

export async function selectionToPng(strokes: Stroke[], objects: PageObject[], box: Box, paper: Paper, opts: { transparent?: boolean } = {}): Promise<Blob> {
  const x0 = box.x - MARGIN, y0 = box.y - MARGIN, w = box.w + MARGIN * 2, h = box.h + MARGIN * 2;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * SCALE));
  c.height = Math.max(1, Math.round(h * SCALE));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the picture on this device.");
  if (!opts.transparent) { ctx.fillStyle = PAPER[paper]; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.setTransform(SCALE, 0, 0, SCALE, -x0 * SCALE, -y0 * SCALE);

  // objects under the ink, in their stacking order (as on the page)
  for (const o of [...objects].sort((a, b) => a.z - b.z)) {
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate(((o.rotation ?? 0) * Math.PI) / 180);
    if (o.kind === "image" && o.blobId) {
      const blob = await getBlob(o.blobId);
      if (blob) {
        const bmp = await createImageBitmap(blob);
        const cr = o.crop; // fractions of the original picture
        if (cr) ctx.drawImage(bmp, cr.x * bmp.width, cr.y * bmp.height, cr.w * bmp.width, cr.h * bmp.height, -o.w / 2, -o.h / 2, o.w, o.h);
        else ctx.drawImage(bmp, -o.w / 2, -o.h / 2, o.w, o.h);
        bmp.close?.();
      }
    } else if (o.kind === "textbox" && o.text) {
      ctx.fillStyle = paper === "light" ? "#16171C" : "#E8E9EE";
      ctx.font = "28px Inter, system-ui, sans-serif";
      ctx.textBaseline = "top";
      o.text.split(/\r?\n/).forEach((line, i) => ctx.fillText(line, -o.w / 2 + 8, -o.h / 2 + 8 + i * 36));
    } else if (o.kind === "tape") {
      ctx.globalAlpha = o.revealed ? 0.25 : 0.7;
      ctx.fillStyle = o.color ?? "#F5A524";
      ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
    }
    ctx.restore();
  }
  for (const s of strokes) if (s.tool === "highlighter") paintStroke(ctx, s, paper);
  for (const s of strokes) if (s.tool !== "highlighter") paintStroke(ctx, s, paper);

  return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture."))), "image/png"));
}
