import "fake-indexeddb/auto";
import { db, type InkPage } from "../../src/store/schema";
import { createNotebook, deleteNotebook } from "../../src/store/notebooks";
import { getPages, insertBoard, addLayer, deleteLayer, setLayers } from "../../src/store/pages";
import { addCard, listCards, updateCard, deleteCard, moveCard, reviewCard } from "../../src/store/cards";
import { addTape, setTapeRevealed, setAllTape, getObjects } from "../../src/ink/objects";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { exportBackup, importBackup } from "../../src/io/backup";
import { searchAll } from "../../src/store/search";
import { BASE_LAYER, pageLayers } from "../../src/ink/layers";
import { DAY } from "../../src/study/srs";
import type { Stroke } from "../../src/ink/model";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

const stroke = (id: string, layerId?: string): Stroke => ({
  id, tool: "pen", variant: "ball", color: "#fff", width: 2, points: new Float32Array([0, 0, 0.5, 0, 10, 10, 0.5, 1]), ...(layerId ? { layerId } : {}),
});

describe("whiteboards", () => {
  it("a new whiteboard starts with one named board", async () => {
    const nb = await createNotebook({ title: "Plan", kind: "whiteboard" });
    expect(nb.kind).toBe("whiteboard");
    const [b] = (await getPages(nb.id)) as InkPage[];
    expect(b.kind).toBe("ink");
    expect(b.board).toBe(true);
    expect(b.title).toBe("Board 1");
  });
  it("adds more boards with the next number", async () => {
    const nb = await createNotebook({ title: "Plan", kind: "whiteboard" });
    await insertBoard(nb.id);
    const pages = (await getPages(nb.id)) as InkPage[];
    expect(pages.map((p) => p.title)).toEqual(["Board 1", "Board 2"]);
  });
});

describe("study sets", () => {
  it("starts with no pages and no cards", async () => {
    const nb = await createNotebook({ title: "Bio", kind: "studyset" });
    expect(nb.pageIds).toEqual([]);
    expect(await listCards(nb.id)).toEqual([]);
  });
  it("adds, edits, reorders and deletes cards", async () => {
    const nb = await createNotebook({ title: "Bio", kind: "studyset" });
    const a = await addCard(nb.id, { front: "Q1", back: "A1" });
    const b = await addCard(nb.id, { front: "Q2", back: "A2" });
    await updateCard(a.id, { back: "A1!" });
    await moveCard(nb.id, 1, 0);
    expect((await listCards(nb.id)).map((c) => c.front)).toEqual(["Q2", "Q1"]);
    expect((await listCards(nb.id))[1].back).toBe("A1!");
    await deleteCard(b.id);
    expect((await listCards(nb.id)).map((c) => c.front)).toEqual(["Q1"]);
  });
  it("reviewing stores the new schedule", async () => {
    const nb = await createNotebook({ title: "Bio", kind: "studyset" });
    const c = await addCard(nb.id, { front: "Q", back: "A" });
    await reviewCard(c.id, "good", 1000);
    const [after] = await listCards(nb.id);
    expect(after.srs.state).toBe("review");
    expect(after.srs.due).toBe(1000 + DAY);
  });
  it("deleting the set deletes its cards", async () => {
    const nb = await createNotebook({ title: "Bio", kind: "studyset" });
    await addCard(nb.id, { front: "Q", back: "A" });
    await deleteNotebook(nb.id);
    expect(await db.cards.count()).toBe(0);
  });
  it("search finds card text", async () => {
    const nb = await createNotebook({ title: "Bio", kind: "studyset" });
    await addCard(nb.id, { front: "What is mitosis?", back: "Cell division" });
    const hits = await searchAll("mitosis");
    expect(hits.some((h) => h.notebookId === nb.id)).toBe(true);
  });
  it("backup round trip keeps cards (schedule reset)", async () => {
    const nb = await createNotebook({ title: "Bio", kind: "studyset" });
    const c = await addCard(nb.id, { front: "Q", back: "A" });
    await reviewCard(c.id, "good", 1000);
    const copy = await importBackup(await exportBackup(nb.id));
    expect(copy.kind).toBe("studyset");
    const cards = await listCards(copy.id);
    expect(cards.map((x) => [x.front, x.back])).toEqual([["Q", "A"]]);
    expect(cards[0].id).not.toBe(c.id);
  });
});

describe("tape", () => {
  it("adds tape that starts hidden, toggles and reveals all", async () => {
    const nb = await createNotebook({ title: "x" });
    const [p] = await getPages(nb.id);
    const t1 = await addTape(p.id, { x: 10, y: 10, w: 200, h: 40 }, "#F5A524");
    await addTape(p.id, { x: 10, y: 100, w: 200, h: 40 }, "#F5A524");
    expect(t1.kind).toBe("tape");
    expect(t1.revealed).toBeFalsy();
    await setTapeRevealed(t1.id, true);
    expect((await getObjects(p.id)).find((o) => o.id === t1.id)?.revealed).toBe(true);
    await setAllTape(p.id, true);
    expect((await getObjects(p.id)).every((o) => o.revealed)).toBe(true);
    await setAllTape(p.id, false);
    expect((await getObjects(p.id)).every((o) => !o.revealed)).toBe(true);
  });
});

describe("layers", () => {
  it("adds a layer on top and deleting it removes its content only", async () => {
    const nb = await createNotebook({ title: "x" });
    const [p] = await getPages(nb.id);
    const l = await addLayer(p.id);
    let page = (await db.pages.get(p.id)) as InkPage;
    expect(pageLayers(page).map((x) => x.id)).toEqual([BASE_LAYER, l.id]);
    expect(l.name).toBe("Layer 2");
    await putStroke(p.id, stroke("keep"));
    await putStroke(p.id, stroke("gone", l.id));
    await addTape(p.id, { x: 0, y: 0, w: 10, h: 10 }, "#F5A524", l.id);
    await deleteLayer(p.id, l.id);
    page = (await db.pages.get(p.id)) as InkPage;
    expect(pageLayers(page).map((x) => x.id)).toEqual([BASE_LAYER]);
    expect((await getStrokes(p.id)).map((s) => s.id)).toEqual(["keep"]);
    expect(await getObjects(p.id)).toEqual([]);
  });
  it("never deletes the last layer", async () => {
    const nb = await createNotebook({ title: "x" });
    const [p] = await getPages(nb.id);
    await deleteLayer(p.id, BASE_LAYER);
    expect(pageLayers((await db.pages.get(p.id)) as InkPage)).toHaveLength(1);
  });
  it("layer visibility is saved", async () => {
    const nb = await createNotebook({ title: "x" });
    const [p] = await getPages(nb.id);
    await setLayers(p.id, [{ id: BASE_LAYER, name: "Layer 1", visible: false, locked: false }]);
    expect(pageLayers((await db.pages.get(p.id)) as InkPage)[0].visible).toBe(false);
  });
});
