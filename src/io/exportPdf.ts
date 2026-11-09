import { PDFDocument } from "pdf-lib";

export type PageImage = { bytes: Uint8Array; type: "png" | "jpeg"; w: number; h: number };
const A4_WIDTH = 595.28;

/** One PDF page per image, A4 width, height following each image's aspect ratio. */
export async function assemblePdf(images: PageImage[], meta: { title: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title);
  pdf.setCreator("OpenNote");
  for (const im of images) {
    const embedded = im.type === "png" ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes);
    const h = A4_WIDTH * (im.h / im.w);
    pdf.addPage([A4_WIDTH, h]).drawImage(embedded, { x: 0, y: 0, width: A4_WIDTH, height: h });
  }
  return pdf.save();
}

/** Render pages in order and build the PDF. Returns bytes plus how many live pages were captured vs. shown as cards. */
export async function exportPagesPdf(pages: import("../store/schema").Page[], nb: import("../store/schema").Notebook,
  onProgress?: (done: number, total: number) => void): Promise<{ bytes: Uint8Array; pdfPages: number; livesCaptured: number; livesAsCards: number }> {
  const { renderPage } = await import("./renderPages");
  const images: PageImage[] = [];
  let livesCaptured = 0;
  let livesAsCards = 0;
  for (const [i, p] of pages.entries()) {
    const r = await renderPage(p, nb);
    if (p.kind === "html") { if (r.captured) livesCaptured++; else livesAsCards++; }
    images.push(...r.images);
    onProgress?.(i + 1, pages.length);
  }
  return { bytes: await assemblePdf(images, { title: nb.title }), pdfPages: images.length, livesCaptured, livesAsCards };
}
