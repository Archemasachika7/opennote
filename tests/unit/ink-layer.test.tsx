import "fake-indexeddb/auto";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { InkLayer } from "../../src/ink/InkLayer";
import { setTool, sendCommand } from "../../src/notebook/tool";
import type { Stroke } from "../../src/ink/model";

let pageId = "";
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "x" });
  pageId = (await getPages(nb.id))[0].id;
  setTool({ tool: "pen", penSeen: false, eraseMode: "stroke", mode: "interact" });
});

const W = 702;
const H = 936;
type P = [number, number];
function draw(el: Element, pts: P[], pointerType = "pen") {
  const first = pts[0];
  const last = pts[pts.length - 1];
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, clientX: first[0], clientY: first[1], pressure: 0.5, buttons: 1 });
  for (const [x, y] of pts.slice(1)) fireEvent.pointerMove(el, { pointerId: 1, pointerType, clientX: x, clientY: y, pressure: 0.5, buttons: 1 });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType, clientX: last[0], clientY: last[1], pressure: 0, buttons: 0 });
}
const hline = (y: number, n = 11): P[] => Array.from({ length: n }, (_, i) => [20 + i * 10, y] as P);
const layer = () => <InkLayer pageId={pageId} width={W} height={H} paper="dark" />;

it("pen stroke is stored with all points and survives remount", async () => {
  const { getByTestId, unmount } = render(layer());
  draw(getByTestId("ink-surface"), hline(50));
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  const [s] = await getStrokes(pageId);
  expect(s.points.length / 4).toBeGreaterThanOrEqual(11);
  expect(s.points[0]).toBeCloseTo(40);
  unmount();
  render(layer());
  expect(await getStrokes(pageId)).toHaveLength(1);
});

it("touch does not draw once a pen was seen", async () => {
  const { getByTestId } = render(layer());
  const el = getByTestId("ink-surface");
  draw(el, hline(50));
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  draw(el, hline(120), "touch");
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  expect(await getStrokes(pageId)).toHaveLength(1);
});

async function seedLine(): Promise<Stroke> {
  const pts = new Float32Array(100 * 4);
  for (let i = 0; i < 100; i++) pts.set([100 + i * 4, 200, 0.5, i], i * 4);
  const s: Stroke = { id: "seed", tool: "pen", variant: "ball", color: "#fff", width: 4, points: pts };
  await putStroke(pageId, s);
  return s;
}

it("partial eraser splits a stroke in two", async () => {
  await seedLine();
  setTool({ tool: "eraser", eraseMode: "partial" });
  const { getByTestId } = render(layer());
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  draw(getByTestId("ink-surface"), [[150, 80], [150, 100], [150, 120]]);
  await waitFor(async () => {
    const s = await getStrokes(pageId);
    expect(s).toHaveLength(2);
    expect(s.every((x) => x.id !== "seed")).toBe(true);
  });
});

it("stroke eraser removes the whole stroke and undo restores it", async () => {
  await seedLine();
  setTool({ tool: "eraser", eraseMode: "stroke" });
  const { getByTestId } = render(layer());
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  draw(getByTestId("ink-surface"), [[150, 90], [150, 110]]);
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(0));
  await act(async () => { sendCommand("undo", pageId); });
  await waitFor(async () => expect((await getStrokes(pageId)).map((s) => s.id)).toEqual(["seed"]));
});

it("shape tool snaps a held straight line to 2 points", async () => {
  setTool({ tool: "shape" });
  let t = 1000;
  const now = vi.spyOn(performance, "now").mockImplementation(() => t);
  const { getByTestId } = render(layer());
  const el = getByTestId("ink-surface");
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: "pen", clientX: 20, clientY: 50, pressure: 0.5, buttons: 1 });
  for (let i = 1; i <= 20; i++) {
    t += 8;
    fireEvent.pointerMove(el, { pointerId: 1, pointerType: "pen", clientX: 20 + i * 10, clientY: 50 + (i % 2), pressure: 0.5, buttons: 1 });
  }
  t += 600;
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: "pen", clientX: 220, clientY: 50, buttons: 0 });
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  expect((await getStrokes(pageId))[0].points.length / 4).toBe(2);
  now.mockRestore();
});

it("still draws when setPointerCapture throws (pointer no longer active)", async () => {
  const proto = Element.prototype as unknown as { setPointerCapture?: (id: number) => void };
  const original = proto.setPointerCapture;
  proto.setPointerCapture = () => { throw new DOMException("No active pointer with the given id is found.", "NotFoundError"); };
  try {
    const { getByTestId } = render(layer());
    draw(getByTestId("ink-surface"), hline(60));
    await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  } finally {
    proto.setPointerCapture = original;
  }
});

it("after a pen is seen the surface still blocks native panning, and finger drags scroll the notebook in JS", async () => {
  const scrollBy = vi.fn();
  const { container } = render(<div className="nb-scroll">{layer()}</div>);
  (container.querySelector(".nb-scroll") as HTMLElement).scrollBy = scrollBy as unknown as HTMLElement["scrollBy"];
  const el = container.querySelector("[data-testid=ink-surface]")!;
  draw(el, hline(50));
  await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
  expect((el as HTMLElement).style.touchAction).toBe("none");
  fireEvent.pointerDown(el, { pointerId: 11, pointerType: "touch", clientX: 100, clientY: 300, buttons: 1 });
  fireEvent.pointerMove(el, { pointerId: 11, pointerType: "touch", clientX: 100, clientY: 240, buttons: 1 });
  fireEvent.pointerUp(el, { pointerId: 11, pointerType: "touch", clientX: 100, clientY: 240 });
  expect(scrollBy).toHaveBeenCalledWith({ left: -0, top: 60 });
  expect(await getStrokes(pageId)).toHaveLength(1);
});
