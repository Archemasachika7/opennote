import "fake-indexeddb/auto";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { db, PAGE_SIZE } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages, insertPage } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { getObjects } from "../../src/ink/objects";
import { copyToClipboard, cutToClipboard, pasteClipboard, hasClipboard, CLIP_MARKER } from "../../src/ink/clipboard";
import { InkPage } from "../../src/ink/InkPage";
import { setTool, sendCommand } from "../../src/notebook/tool";
import type { Stroke } from "../../src/ink/model";
import type { PageObject } from "../../src/store/schema";

let a = "";
let b = "";
const stroke = (id: string, x = 100): Stroke => ({ id, tool: "pen", variant: "ball", color: "#fff", width: 3, points: new Float32Array([x, 100, 0.5, 0, x + 50, 120, 0.5, 8]) });
const img = (id: string, pageId: string): PageObject => ({ id, pageId, kind: "image", x: 300, y: 300, w: 200, h: 100, rotation: 0, blobId: "blob-1", z: 1 });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "x" });
  a = (await getPages(nb.id))[0].id;
  b = (await insertPage(nb.id, 1, { kind: "ink", template: "blank" })).id;
  await db.blobs.add({ id: "blob-1", data: new Blob(["png"]) });
  await putStroke(a, stroke("s1"));
  await db.objects.add(img("o1", a));
});

it("copy on one page and paste on another duplicates ink and pictures with new ids", async () => {
  copyToClipboard(a, [stroke("s1")], [img("o1", a)]);
  expect(hasClipboard()).toBe(true);
  await pasteClipboard(b);
  const bs = await getStrokes(b);
  const bo = await getObjects(b);
  expect(bs).toHaveLength(1);
  expect(bs[0].id).not.toBe("s1");
  expect(bs[0].points[0]).toBeCloseTo(100);
  expect(bo).toHaveLength(1);
  expect(bo[0].blobId).toBe("blob-1");
  expect(await getStrokes(a)).toHaveLength(1);
});

it("pasting onto the same page offsets the copy so it is visible", async () => {
  copyToClipboard(a, [stroke("s1")], []);
  await pasteClipboard(a);
  const xs = (await getStrokes(a)).map((s) => Math.round(s.points[0])).sort();
  expect(xs).toEqual([100, 124]);
});

it("cut then paste moves content from one page to another", async () => {
  await cutToClipboard(a, [stroke("s1")], [img("o1", a)]);
  expect(await getStrokes(a)).toHaveLength(0);
  expect(await getObjects(a)).toHaveLength(0);
  await pasteClipboard(b);
  expect(await getStrokes(b)).toHaveLength(1);
  expect(await getObjects(b)).toHaveLength(1);
  expect(await db.blobs.get("blob-1")).toBeTruthy();
});

it("a mounted page shows pasted ink and one undo removes the paste", async () => {
  render(<InkPage pageId={b} width={PAGE_SIZE.w} height={PAGE_SIZE.h} paper="dark" />);
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  copyToClipboard(a, [stroke("s1")], [img("o1", a)]);
  await act(async () => { await pasteClipboard(b); });
  await act(async () => { sendCommand("undo", b); });
  await waitFor(async () => {
    expect(await getStrokes(b)).toHaveLength(0);
    expect(await getObjects(b)).toHaveLength(0);
  });
});

it("selection bar offers copy and cut", async () => {
  setTool({ tool: "lasso" });
  render(<InkPage pageId={a} width={PAGE_SIZE.w} height={PAGE_SIZE.h} paper="dark" />);
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  await screen.findByTestId("obj-o1");
  const surf = screen.getByTestId("ink-surface");
  const loop: [number, number][] = [[50, 50], [600, 50], [600, 500], [50, 500], [50, 50]];
  fireEvent.pointerDown(surf, { pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 50, buttons: 1 });
  for (const [x, y] of loop.slice(1)) fireEvent.pointerMove(surf, { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, buttons: 1 });
  fireEvent.pointerUp(surf, { pointerId: 1, pointerType: "mouse", clientX: 50, clientY: 50 });
  await screen.findByTestId("selection");
  fireEvent.click(screen.getByRole("button", { name: "Cut selection" }));
  await waitFor(async () => expect(await getStrokes(a)).toHaveLength(0));
  expect(hasClipboard()).toBe(true);
  expect(CLIP_MARKER).toMatch(/^opennote-clip/);
});
