import { db, newId, PAGE_SIZE, type Notebook } from "../store/schema";
import { createNotebook, getNotebook } from "../store/notebooks";
import { deletePage, insertPage } from "../store/pages";

/** What the importer needs from a PDF (pdf.js in the app, a fake in tests). */
export type PdfSource = {
  numPages: number;
  page(i: number): Promise<{ width: number; height: number; render(targetWidth: number): Promise<Blob>; text(): Promise<string> }>;
};
type Loader = (file: Blob) => Promise<PdfSource>;
const RENDER_WIDTH = PAGE_SIZE.w * 2; // crisp at 2x zoom

/** pdf.js loader (offline: the worker is bundled with the app). */
export const loadWithPdfjs: Loader = async (file) => {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return {
    numPages: doc.numPages,
    async page(i) {
      const p = await doc.getPage(i + 1);
      const vp = p.getViewport({ scale: 1 });
      return {
        width: vp.width, height: vp.height,
        async render(targetWidth) {
          const v = p.getViewport({ scale: targetWidth / vp.width });
          const c = document.createElement("canvas");
          c.width = Math.round(v.width); c.height = Math.round(v.height);
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
          await p.render({ canvasContext: ctx, viewport: v }).promise;
          return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/jpeg", 0.9));
        },
        async text() {
          const tc = await p.getTextContent();
          return tc.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/ +/g, " ").trim();
        },
      };
    },
  };
};

/**
 * Import a PDF: each page becomes an ink page whose background is the rendered PDF page (never
 * erasable), sized to the PDF page's aspect ratio, with its text kept for search.
 * Without opts.notebookId a new notebook named after the file is created.
 */
export async function importPdf(file: File, opts: { notebookId?: string; at?: number; onProgress?: (done: number, total: number) => void },
  load: Loader = loadWithPdfjs): Promise<{ notebook: Notebook; pageIds: string[] }> {
  let pdf: PdfSource;
  try { pdf = await load(file); } catch { throw new Error("This file could not be opened as a PDF."); }
  const fresh = !opts.notebookId;
  const nb = fresh ? await createNotebook({ title: file.name.replace(/\.pdf$/i, "") || "Imported PDF" }) : (await getNotebook(opts.notebookId!))!;
  const placeholder = fresh ? nb.pageIds[0] : null;
  let at = fresh ? 0 : opts.at ?? nb.pageIds.length;
  const pageIds: string[] = [];
  for (let i = 0; i < pdf.numPages; i++) {
    const pg = await pdf.page(i);
    const [image, text] = await Promise.all([pg.render(RENDER_WIDTH), pg.text().catch(() => "")]);
    const blobId = newId();
    await db.blobs.add({ id: blobId, data: image });
    const size = { w: PAGE_SIZE.w, h: Math.round((PAGE_SIZE.w * pg.height) / pg.width) };
    const page = await insertPage(nb.id, at++, { kind: "ink", template: "blank", size, background: { blobId, ...(text ? { pdfText: text } : {}) } });
    pageIds.push(page.id);
    opts.onProgress?.(i + 1, pdf.numPages);
  }
  if (placeholder) await deletePage(placeholder);
  return { notebook: (await getNotebook(nb.id))!, pageIds };
}
