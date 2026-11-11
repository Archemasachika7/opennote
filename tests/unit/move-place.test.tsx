import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db, type Page, type PageObject } from "../../src/store/schema";
import { selectAt, selectionBox, selectWithLasso } from "../../src/ink/selection";
import { createNotebook } from "../../src/store/notebooks";
import { getPages, insertPage } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { clipboardSize, copyToClipboard, moveSelection } from "../../src/ink/clipboard";
import { historyFor } from "../../src/ink/history";
import { askPlace, PlaceHost } from "../../src/notebook/PlacePicker";
import { placeText } from "../../src/notebook/RecognizeSheet";
import { LASER_COLOR } from "../../src/ink/laser";
import type { Stroke } from "../../src/ink/model";

const stroke = (id: string): Stroke => ({ id, tool: "pen", variant: "ball", color: "#fff", width: 3, points: new Float32Array([10, 10, 0.5, 0, 50, 60, 0.5, 9]) });

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

async function twoPages() {
  const nb = await createNotebook({ title: "Lab" });
  await insertPage(nb.id, 1, { kind: "ink", template: "blank" });
  const [a, b] = await getPages(nb.id);
  return { nb, a, b };
}

it("moves a selection to another page at the same spot, without touching the clipboard", async () => {
  const { a, b } = await twoPages();
  await putStroke(a.id, stroke("s1"));
  copyToClipboard(a.id, [stroke("other")], []);
  await moveSelection(a.id, b.id, [stroke("s1")], []);
  expect(await getStrokes(a.id)).toEqual([]);
  const [moved] = await getStrokes(b.id);
  expect(Array.from(moved.points)).toEqual(Array.from(stroke("s1").points));
  expect(clipboardSize()).toBe(1); // what was copied before is still there
  expect(historyFor(a.id).undo()?.remove.map((s) => s.id)).toEqual(["s1"]); // undo on the old page brings it back
});

it("puts recognised text on the page as a text box, and can replace the ink in one undo step", async () => {
  const { a } = await twoPages();
  await putStroke(a.id, stroke("ink1"));
  const o = await placeText(a.id, "E = mc²", { x: 100, y: 200, w: 300 }, [stroke("ink1")]);
  expect(o).toMatchObject({ kind: "textbox", text: "E = mc²", x: 100, y: 200 });
  expect(await db.objects.get(o.id)).toMatchObject({ text: "E = mc²" });
  expect(await getStrokes(a.id)).toEqual([]);
  const step = historyFor(a.id).undo();
  expect(step?.remove.map((s) => s.id)).toEqual(["ink1"]);
  expect(step?.objects?.after.map((x) => x.id)).toEqual([o.id]);
});

it("asks where to put things: this page, next page, a new page, or a page number", async () => {
  const { nb } = await twoPages();
  await insertPage(nb.id, 2, { kind: "text" });
  const pages = (await getPages(nb.id)) as Page[];
  render(<PlaceHost notebookId={nb.id} pages={pages} current={0} />);
  let answer: Promise<string | null> = Promise.resolve(null);
  act(() => { answer = askPlace({ title: "Paste on…" }); });
  expect(screen.getByRole("dialog", { name: "Paste on…" })).toBeTruthy();
  expect(screen.getByText("This page (page 1)")).toBeTruthy();
  expect(screen.getByText("Next page (page 2)")).toBeTruthy();
  // a text page can't hold ink: it says so instead of failing
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Go" }));
  expect(screen.getByRole("alert").textContent).toMatch(/Page 3 is a text page/);
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Go" }));
  await waitFor(async () => expect(await answer).toBe(pages[1].id));
});

it("the laser is neon red", () => {
  expect(LASER_COLOR.toUpperCase()).toBe("#FF1F3D");
});

describe("recognised text boxes behave like ink", () => {
  const box = (over: Partial<PageObject> = {}): PageObject =>
    ({ id: "t1", pageId: "p", kind: "textbox", x: 100, y: 100, w: 600, h: 60, rotation: 0, text: "E = mc²", z: 1, ...over }) as PageObject;
  const loop = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];

  it("a lasso round just the words selects the text box, even when the box is wider", () => {
    // the box's middle (x = 400) is outside this loop; the words (about 100..225) are inside
    expect(selectWithLasso(loop(90, 90, 240, 170), [], [box()]).objectIds).toEqual(["t1"]);
    expect(selectWithLasso(loop(400, 300, 500, 400), [], [box()]).objectIds).toEqual([]);
  });

  it("a tap with the lasso selects the text box under it, or the stroke, or nothing", () => {
    expect(selectAt(130, 120, [], [box()], 6)).toEqual({ strokeIds: [], objectIds: ["t1"] });
    expect(selectAt(30, 30, [stroke("s1")], [box()], 6)).toEqual({ strokeIds: ["s1"], objectIds: [] });
    expect(selectAt(900, 900, [stroke("s1")], [box()], 6)).toBeNull();
  });

  it("the selection box hugs the words", () => {
    const b = selectionBox([], [box()])!;
    expect(b.w).toBeLessThan(200);
  });

  it("moves a text box to another page, and undo on the old page brings it back", async () => {
    const { a, b } = await twoPages();
    const o = await placeText(a.id, "x² + y²", { x: 100, y: 200, w: 300 });
    historyFor(a.id).undo(); // drop the placeText step so the next undo is the move
    await moveSelection(a.id, b.id, [], [o]);
    expect(await db.objects.where("pageId").equals(a.id).count()).toBe(0);
    const [moved] = await db.objects.where("pageId").equals(b.id).toArray();
    expect(moved).toMatchObject({ kind: "textbox", text: "x² + y²", x: 100, y: 200 });
    expect(historyFor(a.id).undo()?.objects?.before.map((x) => x.text)).toEqual(["x² + y²"]);
  });
});
