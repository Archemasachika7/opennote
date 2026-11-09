import { zipSync } from "fflate";
import type { Notebook, Page } from "../store/schema";
import type { PageImage } from "./exportPdf";

type Render = (p: Page, nb: Notebook) => Promise<{ images: PageImage[] }>;
const safe = (s: string) => s.replace(/[<>:"/|?*]+/g, "-").trim() || "notebook";

/** JPG export: a single .jpg for one image, otherwise a zip of numbered .jpg files. */
export async function exportPagesJpg(pages: Page[], nb: Notebook, render?: Render): Promise<{ blob: Blob; name: string }> {
  const r: Render = render ?? (await import("./renderPages")).renderPage;
  const images: PageImage[] = [];
  for (const p of pages) images.push(...(await r(p, nb)).images);
  const base = safe(nb.title);
  if (images.length === 1) return { blob: new Blob([images[0].bytes as BlobPart], { type: "image/jpeg" }), name: `${base}.jpg` };
  const files: Record<string, Uint8Array> = {};
  images.forEach((im, i) => { files[`${base}-${String(i + 1).padStart(2, "0")}.jpg`] = im.bytes; });
  return { blob: new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), name: `${base} (jpg).zip` };
}
