import "fake-indexeddb/auto";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import { strToU8, zipSync } from "fflate";
import { db, type InkPage } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages, addLayer, deleteLayer, insertPage } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { onPageChanged } from "../../src/ink/pageEvents";
import { historyFor } from "../../src/ink/history";
import { copyToClipboard, pasteClipboard } from "../../src/ink/clipboard";
import { addCard, listCards } from "../../src/store/cards";
import { importBackup } from "../../src/io/backup";
import { App } from "../../src/App";
import type { Stroke } from "../../src/ink/model";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  window.location.hash = "";
});

const stroke = (id: string, layerId?: string): Stroke => ({
  id, tool: "pen", variant: "ball", color: "#fff", width: 2, points: new Float32Array([0, 0, 0.5, 0, 10, 10, 0.5, 1]), ...(layerId ? { layerId } : {}),
});

it("deleting a layer tells open ink layers to reload and forgets that page's undo", async () => {
  const nb = await createNotebook({ title: "x" });
  const [p] = await getPages(nb.id);
  const l = await addLayer(p.id);
  await putStroke(p.id, stroke("gone", l.id));
  historyFor(p.id).push({ remove: [], add: [stroke("gone", l.id)] });
  const seen: string[] = [];
  const off = onPageChanged((id) => seen.push(id));
  await deleteLayer(p.id, l.id);
  off();
  expect(seen).toContain(p.id);
  expect(historyFor(p.id).undo()).toBeNull();
});

it("pasting onto another page puts strokes on a layer that exists there", async () => {
  const nb = await createNotebook({ title: "x" });
  const [a] = await getPages(nb.id);
  const b = await insertPage(nb.id, 1, { kind: "ink", template: "blank" });
  const l = await addLayer(a.id);
  copyToClipboard(a.id, [stroke("s", l.id)], []);
  await pasteClipboard(b.id);
  const [pasted] = await getStrokes(b.id);
  expect(pasted.layerId).toBeUndefined();
  // same page keeps its layer
  await pasteClipboard(a.id);
  expect((await getStrokes(a.id)).every((s) => s.layerId === l.id)).toBe(true);
});

it("pressing a grade key twice quickly grades the card once", async () => {
  const ss = await createNotebook({ title: "Bio", kind: "studyset" });
  await addCard(ss.id, { front: "Q", back: "A" });
  await addCard(ss.id, { front: "Q2", back: "A2" });
  render(<App />);
  act(() => { window.location.hash = `#/nb/${ss.id}`; });
  await screen.findByTestId("study-set");
  fireEvent.click(screen.getByRole("tab", { name: "Smart Learn" }));
  await screen.findByText("Q");
  fireEvent.keyDown(document.body, { key: " " });
  await screen.findByText("A");
  fireEvent.keyDown(document.body, { key: "3" });
  fireEvent.keyDown(document.body, { key: "3" });
  await waitFor(async () => expect((await listCards(ss.id)).filter((c) => c.srs.reps > 0)).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 80));
  const graded = (await listCards(ss.id)).filter((c) => c.srs.reps > 0);
  expect(graded).toHaveLength(1);
  expect(graded[0].srs.reps).toBe(1);
});

function backupWith(manifest: Record<string, unknown>): Blob {
  return new Blob([zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)) }) as BlobPart]);
}
const base = (over: Record<string, unknown> = {}) => ({
  format: "opennote", formatVersion: 1, exportedAt: 1,
  notebook: { id: "n", title: "T", coverColor: "#F5A524", paper: "dark", folderId: null, bookmarks: [], pageIds: ["p"], createdAt: 1, updatedAt: 1 } as Record<string, unknown>,
  pages: [{ id: "p", notebookId: "n", kind: "ink", template: "blank", createdAt: 1, updatedAt: 1, size: { w: 1404, h: 1872 } }] as Record<string, unknown>[],
  strokes: [], objects: [], blobs: [], ...over,
});

it("backup import ignores broken cards and layer lists, and unknown kinds", async () => {
  const m = base({ cards: [null, 5, { front: "ok", back: "yes" }] });
  m.notebook.kind = "spaceship";
  m.pages[0].layers = "nope";
  const nb = await importBackup(backupWith(m));
  expect(nb.kind).toBeUndefined();
  expect((await listCards(nb.id)).map((c) => c.front)).toEqual(["ok"]);
  const [p] = (await getPages(nb.id)) as InkPage[];
  expect(p.layers).toBeUndefined();
});

it("the minimap area does not change while the view moves a little (no repaint per frame)", async () => {
  const { snapOut } = await import("../../src/board/Minimap");
  const a = snapOut({ x: 10, y: 20, w: 800, h: 600 });
  const b = snapOut({ x: 40, y: 35, w: 800, h: 600 });
  expect(b).toEqual(a);
  expect(a.x).toBeLessThanOrEqual(10);
  expect(a.x + a.w).toBeGreaterThanOrEqual(810);
});
