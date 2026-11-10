import "fake-indexeddb/auto";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { getObjects } from "../../src/ink/objects";
import { InkLayer } from "../../src/ink/InkLayer";
import { setTool, sendCommand } from "../../src/notebook/tool";
import { setRuler } from "../../src/ink/ruler";
import { BASE_LAYER, setActiveLayer, type Layer } from "../../src/ink/layers";
import type { Stroke } from "../../src/ink/model";

let pageId = "";
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "x" });
  pageId = (await getPages(nb.id))[0].id;
  setTool({ tool: "pen", penSeen: false, eraseMode: "stroke", mode: "interact" });
  setRuler(null);
});

const W = 702; // logical = 2 × client in jsdom (rect width 0 → uses width)
const H = 936;
type P = [number, number];
function draw(el: Element, pts: P[], pointerType = "pen", extra: Record<string, unknown> = {}) {
  const [f, l] = [pts[0], pts[pts.length - 1]];
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: f[0], clientY: f[1], pressure: 0.5, buttons: 1, ...extra });
  for (const [x, y] of pts.slice(1)) fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: x, clientY: y, pressure: 0.5, buttons: 1, ...extra });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: l[0], clientY: l[1], pressure: 0, buttons: 0, ...extra });
}
const line = (y: number, n = 11): P[] => Array.from({ length: n }, (_, i) => [20 + i * 10, y] as P);
const settle = () => waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));

const layers: Layer[] = [
  { id: BASE_LAYER, name: "Layer 1", visible: true, locked: false },
  { id: "top", name: "Layer 2", visible: true, locked: false },
];

it("new strokes go on the active layer", async () => {
  setActiveLayer(pageId, "top");
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" layers={layers} />);
  await settle();
  draw(getByTestId("ink-surface"), line(50));
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  expect((await getStrokes(pageId))[0].layerId).toBe("top");
});

it("the eraser does not touch strokes on a locked layer", async () => {
  const s: Stroke = { id: "locked", tool: "pen", variant: "ball", color: "#fff", width: 4, layerId: "top",
    points: new Float32Array(Array.from({ length: 40 }, (_, i) => [100 + i * 4, 200, 0.5, i]).flat()) };
  await putStroke(pageId, s);
  const locked = [layers[0], { ...layers[1], locked: true }];
  setTool({ tool: "eraser" });
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" layers={locked} />);
  await settle();
  draw(getByTestId("ink-surface"), [[60, 90], [80, 110], [100, 100]], "mouse");
  await new Promise((r) => setTimeout(r, 50));
  expect(await getStrokes(pageId)).toHaveLength(1);
});

it("a stroke started next to the ruler edge is drawn straight along it", async () => {
  // horizontal ruler centred at client y=100, 72 px thick: top edge at client y=64 → logical 128
  setRuler({ cx: 300, cy: 100, angle: 0, length: 640, thickness: 72 });
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" />);
  await settle();
  draw(getByTestId("ink-surface"), [[20, 58], [60, 54], [100, 61], [140, 50]]);
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  const [st] = await getStrokes(pageId);
  for (let i = 1; i < st.points.length; i += 4) expect(st.points[i]).toBeCloseTo(128, 0);
});

it("the laser pointer never saves anything", async () => {
  setTool({ tool: "laser" });
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" />);
  await settle();
  draw(getByTestId("ink-surface"), line(80));
  await new Promise((r) => setTimeout(r, 50));
  expect(await getStrokes(pageId)).toHaveLength(0);
  expect(await getObjects(pageId)).toHaveLength(0);
});

it("the tape tool adds a tape strip that undo removes", async () => {
  setTool({ tool: "tape" });
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" tapeEnabled />);
  await settle();
  draw(getByTestId("ink-surface"), [[20, 100], [120, 102], [220, 104]], "mouse");
  await waitFor(async () => expect(await getObjects(pageId)).toHaveLength(1));
  const [t] = await getObjects(pageId);
  expect(t.kind).toBe("tape");
  expect(t.h).toBeGreaterThanOrEqual(24); // a swipe makes a strip, not a hairline
  sendCommand("undo", pageId);
  await waitFor(async () => expect(await getObjects(pageId)).toHaveLength(0));
});

it("on a board the view offset and zoom map the pointer to board coordinates", async () => {
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" view={{ x: 1000, y: 500, zoom: 0.5 }} />);
  await settle();
  draw(getByTestId("ink-surface"), line(50));
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  const [st] = await getStrokes(pageId);
  expect(st.points[0]).toBeCloseTo(1000 + 20 / 0.5);
  expect(st.points[1]).toBeCloseTo(500 + 50 / 0.5);
});

it("on a board the hand tool pans with the mouse", async () => {
  setTool({ tool: "hand" });
  const onPan = vi.fn();
  const { getByTestId } = render(<InkLayer pageId={pageId} width={W} height={H} paper="dark" view={{ x: 0, y: 0, zoom: 1 }} onPan={onPan} />);
  await settle();
  draw(getByTestId("ink-surface"), [[100, 100], [130, 90]], "mouse");
  expect(onPan).toHaveBeenCalledWith(30, -10);
  expect(await getStrokes(pageId)).toHaveLength(0);
});
