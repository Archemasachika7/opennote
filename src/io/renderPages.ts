import { PAGE_SIZE, type HtmlPage, type InkPage, type Notebook, type Page, type PageObject, type TextPage } from "../store/schema";
import { getStrokes } from "../store/strokes";
import { getBlob, getObjects } from "../ink/objects";
import { paintStroke } from "../ink/render";
import { buildSrcdoc } from "../live/srcdoc";
import { loadVendor } from "../live/vendor";
import { layoutText, LINE_HEIGHT, type TextStyle } from "./textLayout";
import type { PageImage } from "./exportPdf";

const W = PAGE_SIZE.w;
const H = PAGE_SIZE.h;
const PAPER = { dark: { bg: "#1E2028", rule: "#2A2D37", ink: "#E8E9EE", dim: "#9A9DAB" }, light: { bg: "#F3F1EC", rule: "#D6D2C8", ink: "#16171C", dim: "#5D6070" } };
const FONT: Record<TextStyle, string> = {
  h1: "600 50px 'Space Grotesk', Inter, sans-serif", h2: "600 40px 'Space Grotesk', Inter, sans-serif",
  h3: "600 34px 'Space Grotesk', Inter, sans-serif", p: "30px Inter, sans-serif", quote: "italic 30px Inter, sans-serif",
  code: "24px 'JetBrains Mono', monospace", hr: "30px Inter, sans-serif", table: "26px Inter, sans-serif",
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

async function toImage(c: HTMLCanvasElement): Promise<PageImage> {
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode page"))), "image/jpeg", 0.92));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "jpeg", w: c.width, h: c.height };
}

function drawTemplate(ctx: CanvasRenderingContext2D, page: Page, paper: Notebook["paper"], h: number) {
  const p = PAPER[paper];
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, h);
  if (page.kind !== "ink" || page.template === "blank") return;
  ctx.strokeStyle = p.rule; ctx.fillStyle = p.rule; ctx.lineWidth = 1.5;
  if (page.template === "ruled") for (let y = 62; y < h; y += 62) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  if (page.template === "grid") {
    for (let y = 0; y < h; y += 52) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let x = 0; x < W; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  }
  if (page.template === "dot") for (let y = 26; y < h; y += 52) for (let x = 26; x < W; x += 52) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
}

async function drawObjects(ctx: CanvasRenderingContext2D, objs: PageObject[], paper: Notebook["paper"]) {
  for (const o of objs) {
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    ctx.rotate((o.rotation * Math.PI) / 180);
    if (o.kind === "image" && o.blobId) {
      const blob = await getBlob(o.blobId);
      if (blob) {
        const bmp = await createImageBitmap(blob);
        const c = o.crop ?? { x: 0, y: 0, w: 1, h: 1 };
        ctx.drawImage(bmp, c.x * bmp.width, c.y * bmp.height, c.w * bmp.width, c.h * bmp.height, -o.w / 2, -o.h / 2, o.w, o.h);
        bmp.close();
      }
    } else if (o.kind === "textbox" && o.text) {
      ctx.fillStyle = PAPER[paper].ink; ctx.font = "28px Inter, sans-serif"; ctx.textBaseline = "top";
      o.text.split("\n").forEach((line, i) => ctx.fillText(line, -o.w / 2 + 6, -o.h / 2 + 4 + i * 38));
    }
    ctx.restore();
  }
}

async function drawStrokes(ctx: CanvasRenderingContext2D, pageId: string, paper: Notebook["paper"], dy = 0) {
  const strokes = await getStrokes(pageId);
  ctx.save();
  ctx.translate(0, dy);
  for (const s of strokes) if (s.tool === "highlighter") paintStroke(ctx, s, paper);
  for (const s of strokes) if (s.tool !== "highlighter") paintStroke(ctx, s, paper);
  ctx.restore();
}

export async function renderInkPage(page: InkPage, nb: Notebook): Promise<PageImage[]> {
  const [c, ctx] = canvas(W, H);
  drawTemplate(ctx, page, nb.paper, H);
  await drawObjects(ctx, await getObjects(page.id), nb.paper);
  await drawStrokes(ctx, page.id, nb.paper);
  return [await toImage(c)];
}

const PAD_X = 110;
const PAD_Y = 96;

export async function renderTextPage(page: TextPage, nb: Notebook): Promise<PageImage[]> {
  const [, probe] = canvas(1, 1);
  const measure = (s: string, style: TextStyle) => { probe.font = FONT[style]; return probe.measureText(s).width; };
  const pages = layoutText(page.doc, { width: W - PAD_X * 2, height: H - PAD_Y * 2, measure });
  const p = PAPER[nb.paper];
  const out: PageImage[] = [];
  for (const [i, lines] of pages.entries()) {
    const [c, ctx] = canvas(W, H);
    drawTemplate(ctx, page, nb.paper, H);
    ctx.textBaseline = "top";
    for (const l of lines) {
      const x = PAD_X + l.indent;
      const y = PAD_Y + l.y;
      if (l.style === "hr") { ctx.strokeStyle = p.rule; ctx.beginPath(); ctx.moveTo(PAD_X, y + 14); ctx.lineTo(W - PAD_X, y + 14); ctx.stroke(); continue; }
      ctx.font = FONT[l.style];
      ctx.fillStyle = l.style === "quote" ? p.dim : p.ink;
      if (l.prefix) { ctx.font = FONT.p; ctx.fillText(l.prefix, x - 36, y); ctx.font = FONT[l.style]; }
      if (l.style === "code") { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(x - 10, y - 4, W - PAD_X * 2 - l.indent + 20, LINE_HEIGHT.code); ctx.fillStyle = p.ink; }
      if (l.cells) {
        // table row: equal-width cells with borders, header row bold
        const tw = W - PAD_X * 2 - l.indent;
        const cw = tw / Math.max(1, l.cells.length);
        const rh = LINE_HEIGHT.table;
        ctx.strokeStyle = p.rule; ctx.lineWidth = 1.5;
        l.cells.forEach((cell, k) => {
          ctx.strokeRect(x + k * cw, y - 6, cw, rh);
          ctx.font = l.header ? "600 26px Inter, sans-serif" : FONT.table;
          ctx.fillStyle = p.ink;
          ctx.save(); ctx.beginPath(); ctx.rect(x + k * cw, y - 6, cw - 6, rh); ctx.clip();
          ctx.fillText(cell, x + k * cw + 10, y + 4);
          ctx.restore();
        });
        continue;
      }
      if (l.runs && l.runs.length) {
        // styled words: colour, highlight, bold/italic, underline/strike
        let cx = x;
        const base = FONT[l.style];
        const size = Number(/(\d+)px/.exec(base)?.[1] ?? 30);
        const space = (() => { ctx.font = base; return ctx.measureText(" ").width; })();
        for (const r of l.runs) {
          const weight = r.bold || l.style.startsWith("h") ? "600 " : "";
          ctx.font = `${r.italic || l.style === "quote" ? "italic " : ""}${weight}${base.replace(/^(italic )?(600 )?/, "")}`;
          const wpx = ctx.measureText(r.text).width;
          if (r.highlight) { ctx.fillStyle = r.highlight; ctx.fillRect(cx - 2, y - 2, wpx + 4, size + 8); }
          ctx.fillStyle = r.color ?? (l.style === "quote" ? p.dim : p.ink);
          ctx.fillText(r.text, cx, y);
          if (r.underline || r.strike) {
            ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
            const ly = r.underline ? y + size + 2 : y + size * 0.55;
            ctx.beginPath(); ctx.moveTo(cx, ly); ctx.lineTo(cx + wpx, ly); ctx.stroke();
          }
          cx += wpx + space;
        }
        continue;
      }
      ctx.fillText(l.text, x, y);
    }
    if (i === 0) await drawStrokes(ctx, page.id, nb.paper); // pen notes written over the page
    out.push(await toImage(c));
  }
  return out;
}

/** Render a live page inside a hidden sandbox and ask it to capture itself; null if it cannot. */
export async function captureLive(page: HtmlPage, cssWidth = 860, timeoutMs = 10000): Promise<HTMLCanvasElement | null> {
  try {
    const lib = await (await fetch(`${import.meta.env.BASE_URL}vendor/html2canvas.js`)).text();
    const vendor = page.artifactType === "react" ? await loadVendor() : undefined;
    const doc = buildSrcdoc({ source: page.source, type: page.artifactType, allowNetwork: page.allowNetwork, vendor, capture: lib });
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${cssWidth}px;height:${Math.round((page.height * cssWidth) / W)}px;border:0;`;
    frame.srcdoc = doc;
    const data = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => done(null), timeoutMs);
      const onMsg = (e: MessageEvent) => {
        if (e.source !== frame.contentWindow || e.data?.type !== "opennote:capture-result") return;
        done(typeof e.data.data === "string" ? e.data.data : null);
      };
      function done(v: string | null) { clearTimeout(timer); window.removeEventListener("message", onMsg); frame.remove(); resolve(v); }
      window.addEventListener("message", onMsg);
      frame.addEventListener("load", () => setTimeout(() => frame.contentWindow?.postMessage({ type: "opennote:capture" }, "*"), 1200));
      document.body.appendChild(frame);
    });
    if (!data) return null;
    const img = new Image();
    img.src = data;
    await img.decode();
    const [c, ctx] = canvas(W, Math.round((img.height * W) / img.width));
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } catch {
    return null;
  }
}

export async function renderLivePage(page: HtmlPage, nb: Notebook): Promise<{ images: PageImage[]; captured: boolean }> {
  const shot = await captureLive(page);
  let c: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  if (shot) {
    [c, ctx] = canvas(W, shot.height);
    ctx.drawImage(shot, 0, 0);
  } else {
    [c, ctx] = canvas(W, 900);
    ctx.fillStyle = "#1A1C23"; ctx.fillRect(0, 0, W, 900);
    ctx.strokeStyle = "#3DDC97"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, W - 6, 894);
    ctx.fillStyle = "#3DDC97"; ctx.font = "28px 'JetBrains Mono', monospace"; ctx.fillText("LIVE PAGE", 90, 120);
    ctx.fillStyle = "#E8E9EE"; ctx.font = "600 56px 'Space Grotesk', sans-serif"; ctx.fillText(page.title, 90, 220);
    ctx.fillStyle = "#9A9DAB"; ctx.font = "30px Inter, sans-serif";
    ctx.fillText("Interactive content. Open this notebook in OpenNote to use it.", 90, 300);
  }
  await drawStrokes(ctx, page.id, nb.paper);
  return { images: [await toImage(c)], captured: !!shot };
}

export async function renderPage(page: Page, nb: Notebook): Promise<{ images: PageImage[]; captured?: boolean }> {
  if (page.kind === "ink") return { images: await renderInkPage(page, nb) };
  if (page.kind === "text") return { images: await renderTextPage(page, nb) };
  return renderLivePage(page, nb);
}


