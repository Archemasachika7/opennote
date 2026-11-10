import "fake-indexeddb/auto";
import { render, fireEvent, waitFor, act } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { encodeStroke, decodeStroke, type Stroke } from "../../src/ink/model";
import { shapePoints } from "../../src/ink/shapes";
import { paintStroke } from "../../src/ink/render";
import { hitsEraserPath, snapShape, splitByEraser } from "../../src/ink/geometry";
import { isScribbleGesture } from "../../src/ink/gestures";
import { BUILTIN_ELEMENTS, deleteElement, listElements, saveStrokesAsElement } from "../../src/ink/elements";
import { InkLayer } from "../../src/ink/InkLayer";
import { sendCommand, sendStampElement, setTool } from "../../src/notebook/tool";

let pageId = "";
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "Shapes Test" });
  pageId = (await getPages(nb.id))[0].id;
  setTool({
    tool: "pen", variant: "ball", paletteIndex: 0, color: "#E8E9EE", width: 3,
    eraseMode: "stroke", shapeKind: "rect", shapeFill: false, shapeDashed: false,
    penGestures: true, zoomBoxOpen: false, mode: "interact", penSeen: false,
  });
});

describe("Shapes Bug Fixes & Vector Rendering", () => {
  it("round-trips shape and audioSync metadata through encodeStroke / decodeStroke", () => {
    const pts = shapePoints("rect", 10, 20, 110, 90, false);
    const s: Stroke = {
      id: "sh-1", tool: "pen", variant: "ball", color: "#4FD1C5", paletteIndex: 1, width: 3,
      points: pts,
      shape: { kind: "rect", fill: true, dashed: true },
      audioSync: { clipId: "clip-99", offsetMs: 12450 },
    };
    const decoded = decodeStroke(encodeStroke(s));
    expect(decoded.shape).toEqual({ kind: "rect", fill: true, dashed: true });
    expect(decoded.audioSync).toEqual({ clipId: "clip-99", offsetMs: 12450 });
    expect(decoded.points.length).toBe(pts.length);
  });

  it("renders geometric shapes with crisp Canvas 2D stroke/fill/dash instead of freehand blobbing", () => {
    const calls: string[] = [];
    const fakeCtx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      setLineDash: (d: number[]) => calls.push(`dash:${d.length}`),
      fill: () => calls.push("fill"),
      stroke: () => calls.push("stroke"),
      beginPath: () => calls.push("begin"),
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => calls.push("close"),
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const rectStroke: Stroke = {
      id: "r1", tool: "pen", variant: "ball", color: "#4FD1C5", width: 3,
      points: shapePoints("rect", 0, 0, 100, 80, false),
      shape: { kind: "rect", fill: true, dashed: true },
    };
    paintStroke(fakeCtx, rectStroke, "dark");
    expect(calls).toContain("fill");
    expect(calls).toContain("stroke");
    expect(calls).toContain("dash:2");

    calls.length = 0;
    const arrowStroke: Stroke = {
      id: "a1", tool: "pen", variant: "ball", color: "#4FD1C5", width: 3,
      points: shapePoints("arrow", 10, 10, 150, 10, false),
      shape: { kind: "arrow", fill: true },
    };
    paintStroke(fakeCtx, arrowStroke, "dark");
    expect(calls).toContain("stroke");
    expect(calls).toContain("fill");
  });

  it("erases sparse 2-point lines and 5-point rectangles when swiping across the middle of an edge", () => {
    const sparseLine: Stroke = {
      id: "line-sparse", tool: "pen", variant: "ball", color: "#fff", width: 4,
      points: shapePoints("line", 50, 200, 450, 200, false),
      shape: { kind: "line" },
    };
    // Swipe vertically across x=250 (200px away from both endpoints!)
    const swipe = [250, 170, 250, 230];
    expect(hitsEraserPath(sparseLine, swipe, 8)).toBe(true);

    const fragments = splitByEraser(sparseLine, swipe, 12);
    expect(fragments.length).toBe(2);
    expect(fragments[0].shape).toBeUndefined();
    expect(fragments[1].shape).toBeUndefined();
  });

  it("recognises hand-drawn triangles in snapShape alongside lines, rectangles, ellipses and arrows", () => {
    const verts: [number, number][] = [[200, 60], [320, 240], [80, 240], [200, 60]];
    const samples: number[] = [];
    for (let e = 0; e < 3; e++) {
      const [x0, y0] = verts[e], [x1, y1] = verts[e + 1];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        samples.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.5, 0);
      }
    }
    const res = snapShape(new Float32Array(samples));
    expect(res?.kind).toBe("triangle");
    expect((res?.points.length ?? 0) / 4).toBe(4);
  });

  it("snaps a held stroke in Pen mode and shows draggable endpoint handles for newly drawn lines in Shapes mode", async () => {
    // 1. Pen mode hold-to-snap
    let t = 1000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => t);
    const { getByTestId, queryByTestId } = render(<InkLayer pageId={pageId} width={702} height={936} paper="dark" />);
    const surface = getByTestId("ink-surface");
    await waitFor(() => expect(surface).toHaveAttribute("data-loaded"));

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "pen", clientX: 40, clientY: 80, pressure: 0.5, buttons: 1 });
    for (let i = 1; i <= 15; i++) {
      t += 10;
      fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "pen", clientX: 40 + i * 12, clientY: 80 + (i % 2), pressure: 0.5, buttons: 1 });
    }
    t += 500; // hold still >= 420ms
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "pen", clientX: 220, clientY: 80, buttons: 0 });
    await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(1));
    const [snappedLine] = await getStrokes(pageId);
    expect(snappedLine.shape?.kind).toBe("line");
    spy.mockRestore();

    // 2. Shapes mode arrow with Fill + Dashed + post-draw endpoint handles
    setTool({ tool: "shape", shapeKind: "arrow", shapeFill: true, shapeDashed: true });
    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: "pen", clientX: 50, clientY: 200, pressure: 0.5, buttons: 1 });
    fireEvent.pointerMove(surface, { pointerId: 2, pointerType: "pen", clientX: 240, clientY: 200, pressure: 0.5, buttons: 1 });
    fireEvent.pointerUp(surface, { pointerId: 2, pointerType: "pen", clientX: 240, clientY: 200, buttons: 0 });

    await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(2));
    const strokes = await getStrokes(pageId);
    const arrow = strokes.find((s) => s.shape?.kind === "arrow");
    expect(arrow?.shape).toEqual({ kind: "arrow", fill: true, dashed: true });
    expect(queryByTestId("line-handle-start")).not.toBeNull();
    expect(queryByTestId("line-handle-end")).not.toBeNull();
  });
});

describe("Sprint 2 Pen Gestures & Reusable Elements", () => {
  it("detects scribble-to-erase zig-zags while ignoring normal progressive handwriting", async () => {
    // Normal progressive wave (like writing "mmm") advances steadily along X
    const wave: number[] = [];
    for (let i = 0; i < 30; i++) wave.push(40 + i * 12, 100 + Math.sin(i) * 14, 0.5, i * 8);
    expect(isScribbleGesture(new Float32Array(wave))).toBe(false);

    // Deliberate back-and-forth scribble over the same region (6 reversals)
    const scribblePts: [number, number][] = [
      [100, 100], [180, 104], [102, 112], [182, 118], [98, 124], [180, 130], [104, 136],
    ];
    const dense: number[] = [];
    for (let seg = 0; seg < scribblePts.length - 1; seg++) {
      const [x0, y0] = scribblePts[seg], [x1, y1] = scribblePts[seg + 1];
      for (let k = 0; k < 6; k++) {
        const u = k / 6;
        dense.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0.5, 0);
      }
    }
    expect(isScribbleGesture(new Float32Array(dense))).toBe(true);

    // Seed an underlying stroke on InkLayer and scribble over it (note: client coords map 2x in jsdom)
    const victim: Stroke = {
      id: "victim-word", tool: "pen", variant: "ball", color: "#fff", width: 4,
      points: shapePoints("line", 180, 230, 380, 230, false),
    };
    await putStroke(pageId, victim);

    const { getByTestId } = render(<InkLayer pageId={pageId} width={702} height={936} paper="dark" />);
    const surface = getByTestId("ink-surface");
    await waitFor(() => expect(surface).toHaveAttribute("data-loaded"));

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "pen", clientX: 100, clientY: 100, pressure: 0.5, buttons: 1 });
    for (let seg = 0; seg < scribblePts.length - 1; seg++) {
      const [x0, y0] = scribblePts[seg], [x1, y1] = scribblePts[seg + 1];
      for (let k = 1; k <= 6; k++) {
        const u = k / 6;
        fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "pen", clientX: x0 + (x1 - x0) * u, clientY: y0 + (y1 - y0) * u, pressure: 0.5, buttons: 1 });
      }
    }
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "pen", clientX: 104, clientY: 136, buttons: 0 });

    await waitFor(async () => expect(await getStrokes(pageId)).toHaveLength(0));

    // Undo restores the scribble-erased stroke!
    await act(async () => { sendCommand("undo", pageId); });
    await waitFor(async () => expect((await getStrokes(pageId)).map((s) => s.id)).toEqual(["victim-word"]));
  });

  it("saves custom elements to IndexedDB blobs and stamps built-in STEM elements onto a page", async () => {
    expect(BUILTIN_ELEMENTS.length).toBeGreaterThanOrEqual(6);
    const customStroke: Stroke = {
      id: "c1", tool: "pen", variant: "ball", color: "#4FD1C5", width: 3,
      points: shapePoints("diamond", 200, 300, 300, 420, false),
      shape: { kind: "diamond", fill: true },
    };
    const saved = await saveStrokesAsElement("My Flowchart Node", [customStroke]);
    expect(saved?.name).toBe("My Flowchart Node");
    expect((await listElements()).some((e) => e.id === saved!.id)).toBe(true);

    const { getByTestId } = render(<InkLayer pageId={pageId} width={702} height={936} paper="dark" />);
    await waitFor(() => expect(getByTestId("ink-surface")).toHaveAttribute("data-loaded"));

    await act(async () => { sendStampElement(pageId, BUILTIN_ELEMENTS[0]); });
    await waitFor(async () => expect((await getStrokes(pageId)).length).toBe(BUILTIN_ELEMENTS[0].strokes.length));

    await deleteElement(saved!.id);
    expect((await listElements()).some((e) => e.id === saved!.id)).toBe(false);
  });
});
