import "fake-indexeddb/auto";
import { render, fireEvent, waitFor, act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db, PAGE_SIZE } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { getObjects, addImage, pasteImages } from "../../src/ink/objects";
import { InkPage } from "../../src/ink/InkPage";
import { setTool, sendCommand } from "../../src/notebook/tool";
import type { Stroke } from "../../src/ink/model";

let pageId = "";
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "x" });
  pageId = (await getPages(nb.id))[0].id;
  setTool({ tool: "pen", penSeen: false });
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(async () => ({ width: 3000, height: 2000, close() {} }));
  globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
  globalThis.URL.revokeObjectURL = vi.fn();
});

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" });
const page = () => <InkPage pageId={pageId} width={PAGE_SIZE.w} height={PAGE_SIZE.h} paper="dark" />;

it("dropping a PNG creates one image object that fits the page", async () => {
  const { getByTestId } = render(page());
  fireEvent.drop(getByTestId("ink-page"), { dataTransfer: { files: [png()], types: ["Files"] }, clientX: 300, clientY: 300 });
  await waitFor(async () => expect(await getObjects(pageId)).toHaveLength(1));
  const [o] = await getObjects(pageId);
  expect(o.kind).toBe("image");
  expect(o.w).toBeLessThanOrEqual(PAGE_SIZE.w);
  expect(o.h / o.w).toBeCloseTo(2000 / 3000);
  expect(o.blobId).toBeTruthy();
});

it("pasting a clipboard image centres it on the page", async () => {
  const n = await pasteImages([png()], pageId);
  expect(n).toBe(1);
  const [o] = await getObjects(pageId);
  expect(o.x + o.w / 2).toBeCloseTo(PAGE_SIZE.w / 2);
});

it("crop handle sets crop and keeps the blob", async () => {
  const o = await addImage(pageId, png(), { x: 100, y: 100 });
  setTool({ tool: "lasso" });
  render(page());
  const img = await screen.findByTestId(`obj-${o.id}`);
  fireEvent.doubleClick(img);
  const handle = await screen.findByTestId("crop-e");
  fireEvent.pointerDown(handle, { pointerId: 2, clientX: 500, clientY: 300, pointerType: "mouse", buttons: 1 });
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 400, clientY: 300, pointerType: "mouse", buttons: 1 });
  fireEvent.pointerUp(handle, { pointerId: 2, clientX: 400, clientY: 300, pointerType: "mouse" });
  await waitFor(async () => {
    const [after] = await getObjects(pageId);
    expect(after.crop?.w).toBeLessThan(1);
    expect(after.blobId).toBe(o.blobId);
  });
});

it("lasso moves a stroke and an image together; one undo restores both", async () => {
  const pts = new Float32Array([200, 200, 0.5, 0, 260, 200, 0.5, 1, 320, 200, 0.5, 2]);
  const s: Stroke = { id: "s1", tool: "pen", variant: "ball", color: "#fff", width: 3, points: pts };
  await putStroke(pageId, s);
  const o = await addImage(pageId, png(), { x: 200, y: 250 });
  const before = (await getObjects(pageId))[0];
  setTool({ tool: "lasso" });
  const { getByTestId } = render(page());
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  await screen.findByTestId(`obj-${o.id}`);
  const surf = getByTestId("ink-surface");
  const loop: [number, number][] = [[150, 150], [1400, 150], [1400, 1800], [150, 1800], [150, 150]];
  fireEvent.pointerDown(surf, { pointerId: 1, pointerType: "mouse", clientX: loop[0][0], clientY: loop[0][1], buttons: 1 });
  for (const [x, y] of loop.slice(1)) fireEvent.pointerMove(surf, { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, buttons: 1 });
  fireEvent.pointerUp(surf, { pointerId: 1, pointerType: "mouse", clientX: 150, clientY: 150 });
  const box = await screen.findByTestId("selection");
  fireEvent.pointerDown(box, { pointerId: 3, pointerType: "mouse", clientX: 300, clientY: 300, buttons: 1 });
  fireEvent.pointerMove(box, { pointerId: 3, pointerType: "mouse", clientX: 350, clientY: 300, buttons: 1 });
  fireEvent.pointerUp(box, { pointerId: 3, pointerType: "mouse", clientX: 350, clientY: 300 });
  await waitFor(async () => {
    expect((await getStrokes(pageId))[0].points[0]).toBeCloseTo(250);
    expect((await getObjects(pageId))[0].x).toBeCloseTo(before.x + 50);
  });
  await act(async () => { sendCommand("undo", pageId); });
  await waitFor(async () => {
    expect((await getStrokes(pageId))[0].points[0]).toBeCloseTo(200);
    expect((await getObjects(pageId))[0].x).toBeCloseTo(before.x);
  });
  expect(o.id).toBe(before.id);
});

it("text tool creates a text box that persists typing", async () => {
  const user = userEvent.setup();
  setTool({ tool: "text" });
  const { getByTestId } = render(page());
  fireEvent.pointerDown(getByTestId("object-layer"), { pointerId: 1, pointerType: "mouse", clientX: 400, clientY: 400, buttons: 1 });
  const box = await screen.findByRole("textbox", { name: /text box/i });
  await user.type(box, "hello");
  await waitFor(async () => expect((await getObjects(pageId))[0].text).toBe("hello"));
});

it("lasso moves a lone stroke", async () => {
  const pts = new Float32Array([200, 200, 0.5, 0, 260, 200, 0.5, 1, 320, 200, 0.5, 2]);
  await putStroke(pageId, { id: "solo", tool: "pen", variant: "ball", color: "#fff", width: 3, points: pts });
  setTool({ tool: "lasso" });
  const { getByTestId } = render(page());
  await waitFor(() => expect(document.querySelector("[data-testid=ink-surface]")).toHaveAttribute("data-loaded"));
  const surf = getByTestId("ink-surface");
  const loop: [number, number][] = [[150, 150], [400, 150], [400, 260], [150, 260], [150, 150]];
  fireEvent.pointerDown(surf, { pointerId: 1, pointerType: "mouse", clientX: 150, clientY: 150, buttons: 1 });
  for (const [x, y] of loop.slice(1)) fireEvent.pointerMove(surf, { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, buttons: 1 });
  fireEvent.pointerUp(surf, { pointerId: 1, pointerType: "mouse", clientX: 150, clientY: 150 });
  const box = await screen.findByTestId("selection");
  fireEvent.pointerDown(box, { pointerId: 3, pointerType: "mouse", clientX: 300, clientY: 200, buttons: 1 });
  fireEvent.pointerMove(box, { pointerId: 3, pointerType: "mouse", clientX: 300, clientY: 260, buttons: 1 });
  fireEvent.pointerUp(box, { pointerId: 3, pointerType: "mouse", clientX: 300, clientY: 260 });
  await waitFor(async () => expect((await getStrokes(pageId))[0].points[1]).toBeCloseTo(260));
});
