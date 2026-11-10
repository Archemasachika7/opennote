import { createNotebook, updateNotebook } from "../store/notebooks";
import { getPages, insertPage, updatePage } from "../store/pages";
import { putStroke } from "../store/strokes";
import { addTape, addTextBox, updateObject } from "../ink/objects";
import type { Notebook } from "../store/schema";

const WAVE_EXPLORER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Harmonic Wave Superposition</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; background: #161820; color: #e8e9ee;
    font: 14px/1.5 system-ui, -apple-system, sans-serif;
  }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  .hint { font-size: 12px; color: #3ddc97; font-family: ui-monospace, monospace; }
  canvas { width: 100%; height: 240px; background: #1e2028; border: 1px solid #2a2d37; border-radius: 6px; display: block; }
  .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 16px; }
  label { display: grid; gap: 4px; padding: 10px 12px; background: #1e2028; border: 1px solid #2a2d37; border-radius: 6px; font-size: 12.5px; color: #9a9dab; }
  label strong { color: #e8e9ee; font-family: ui-monospace, monospace; float: right; }
  input[type="range"] { width: 100%; accent-color: #f5a524; cursor: pointer; }
</style>
</head>
<body>
  <div class="head">
    <h1>Harmonic Wave Superposition</h1>
    <span class="hint">Interactive Live Page · Switch to "Write on page" or use a stylus to annotate</span>
  </div>
  <canvas id="wave" width="900" height="260"></canvas>
  <div class="controls">
    <label><span>Carrier Frequency (f1) <strong id="f1v">2.0 Hz</strong></span><input id="f1" type="range" min="0.5" max="6" step="0.1" value="2.0" /></label>
    <label><span>Harmonic Ratio (f2) <strong id="f2v">3.5 Hz</strong></span><input id="f2" type="range" min="0.5" max="10" step="0.1" value="3.5" /></label>
    <label><span>Modulation Depth <strong id="ampv">0.65</strong></span><input id="amp" type="range" min="0" max="1" step="0.05" value="0.65" /></label>
  </div>
  <script>
    const c = document.getElementById("wave");
    const ctx = c.getContext("2d");
    const f1 = document.getElementById("f1"), f2 = document.getElementById("f2"), amp = document.getElementById("amp");
    let phase = 0;
    function draw() {
      const w = c.width, h = c.height, mid = h / 2;
      const v1 = parseFloat(f1.value), v2 = parseFloat(f2.value), a2 = parseFloat(amp.value);
      document.getElementById("f1v").textContent = v1.toFixed(1) + " Hz";
      document.getElementById("f2v").textContent = v2.toFixed(1) + " Hz";
      document.getElementById("ampv").textContent = a2.toFixed(2);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#2a2d37"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
      ctx.strokeStyle = "rgba(61, 220, 151, 0.45)"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const t = x / w * Math.PI * 2;
        const y = mid - Math.sin(t * v1 + phase) * 52;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = "#f5a524"; ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const t = x / w * Math.PI * 2;
        const y = mid - (Math.sin(t * v1 + phase) * 52 + Math.sin(t * v2 - phase * 1.3) * 46 * a2);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      phase += 0.025;
      requestAnimationFrame(draw);
    }
    draw();
  </script>
</body>
</html>`;

/** Seeds a 3-page interactive starter notebook showcasing Live, Text, and Ink + Tape pages. */
export async function createStarterNotebook(): Promise<Notebook> {
  const nb = await createNotebook({ title: "Welcome to OpenNote" });
  await updateNotebook(nb.id, { coverColor: "#3DDC97" });
  const [inkPage] = await getPages(nb.id);
  await updatePage(inkPage.id, { template: "grid" });

  // Draw a clean sine sketch + axis on the grid ink page and add a study tape strip
  const axisPts: number[] = [];
  for (let i = 0; i <= 20; i++) axisPts.push(180 + i * 50, 520, 0.5, i * 4);
  await putStroke(inkPage.id, {
    id: crypto.randomUUID(),
    tool: "pen",
    variant: "ball",
    color: "#9A9DAB",
    width: 3,
    points: new Float32Array(axisPts),
  });

  const curvePts: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = 180 + (i / 60) * 1000;
    const y = 520 - Math.sin((i / 60) * Math.PI * 2) * 150;
    curvePts.push(x, y, 0.65, i * 4);
  }
  await putStroke(inkPage.id, {
    id: crypto.randomUUID(),
    tool: "pen",
    variant: "fountain",
    color: "#F5A524",
    width: 5,
    points: new Float32Array(curvePts),
  });

  const tb = await addTextBox(inkPage.id, { x: 180, y: 210 });
  await updateObject(tb.id, { w: 960, h: 110, text: "Ink + Study Tape: Pick Hand (V) or Tape (B) and tap the amber strip below to reveal the hidden formula." });
  const answerTb = await addTextBox(inkPage.id, { x: 220, y: 740 });
  await updateObject(answerTb.id, { w: 680, h: 80, text: "y(x, t) = A sin(kx - wt) + B sin(2kx - wt)" });
  await addTape(inkPage.id, { x: 200, y: 730, w: 720, h: 72 }, "#F5A524");

  // Insert Live Page at top (Page 1) so the differentiator shines immediately
  await insertPage(nb.id, 0, {
    kind: "html",
    title: "Harmonic Wave Superposition",
    source: WAVE_EXPLORER_HTML,
    artifactType: "html",
    allowNetwork: false,
  });

  // Insert structured Text Page at Page 2 (shows Outline headings + checklists)
  const textPage = await insertPage(nb.id, 1, { kind: "text" });
  await updatePage(textPage.id, {
    doc: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Wave Mechanics & Live Artifacts" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "OpenNote blends handwritten " },
            { type: "text", marks: [{ type: "bold" }], text: "Ink pages" },
            { type: "text", text: ", structured " },
            { type: "text", marks: [{ type: "bold" }], text: "Text pages" },
            { type: "text", text: ", and sandboxed " },
            { type: "text", marks: [{ type: "bold" }], text: "Live AI Artifacts" },
            { type: "text", text: " in one offline-first notebook." },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Quick Tryout Checklist" }] },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Drag the frequency sliders on Page 1 above" }] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Switch to 'Write on page' in the toolbar to circle peaks on the live graph" }] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Open the 'Outline' tab on the left sidebar to jump between headings" }] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Paste any HTML, SVG, or React code with Ctrl+V to create a new Live Page" }] }] },
          ],
        },
      ],
    },
  });

  return nb;
}
