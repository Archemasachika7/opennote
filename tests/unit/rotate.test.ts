import "fake-indexeddb/auto";
import { db, PAGE_SIZE, type InkPage } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPage, getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { getObjects } from "../../src/ink/objects";
import { rotatePage } from "../../src/ink/rotate";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

it("rotates a portrait page to landscape, turning and scaling its content to the page width", async () => {
  const nb = await createNotebook({ title: "R" });
  const [p] = await getPages(nb.id);
  await putStroke(p.id, { id: "s", tool: "pen", variant: "ball", color: "#fff", width: 4, points: new Float32Array([100, 200, 0.5, 0]) });
  await db.objects.add({ id: "o", pageId: p.id, kind: "image", x: 0, y: 0, w: 200, h: 100, rotation: 0, z: 1 });
  await rotatePage(p.id);
  const after = (await getPage(p.id)) as InkPage;
  const k = PAGE_SIZE.w / PAGE_SIZE.h;
  expect(after.size).toEqual({ w: PAGE_SIZE.w, h: Math.round(PAGE_SIZE.w * k) });
  const [s] = await getStrokes(p.id);
  expect(s.points[0]).toBeCloseTo((PAGE_SIZE.h - 200) * k, 3);
  expect(s.points[1]).toBeCloseTo(100 * k, 3);
  expect(s.width).toBeCloseTo(4 * k, 5);
  const [o] = await getObjects(p.id);
  expect(o.rotation).toBe(90);
  expect(o.w).toBeCloseTo(200 * k, 3);
});

it("four rotations bring the page back to how it was", async () => {
  const nb = await createNotebook({ title: "R" });
  const [p] = await getPages(nb.id);
  await putStroke(p.id, { id: "s", tool: "pen", variant: "ball", color: "#fff", width: 4, points: new Float32Array([300, 500, 0.5, 0]) });
  for (let i = 0; i < 4; i++) await rotatePage(p.id);
  const after = (await getPage(p.id)) as InkPage;
  expect(after.size).toEqual({ w: PAGE_SIZE.w, h: PAGE_SIZE.h });
  const [s] = await getStrokes(p.id);
  expect(s.points[0]).toBeCloseTo(300, 0);
  expect(s.points[1]).toBeCloseTo(500, 0);
});

it("an imported PDF background turns with the page", async () => {
  const nb = await createNotebook({ title: "R" });
  const [p] = await getPages(nb.id);
  await db.pages.update(p.id, { background: { blobId: "b" } } as never);
  await rotatePage(p.id);
  expect(((await getPage(p.id)) as InkPage).background).toMatchObject({ blobId: "b", rotation: 90 });
});
