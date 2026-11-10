import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
// fake-indexeddb clones with Node structuredClone, which keeps Node Blobs but drops jsdom Blobs (browsers keep both).
vi.stubGlobal("Blob", NodeBlob);
import { db } from "../../src/store/schema";
import { createNotebook, listNotebooks } from "../../src/store/notebooks";
import { getPages, insertPage, updatePage } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import { getObjects } from "../../src/ink/objects";
import { exportBackup, importBackup, BACKUP_EXT } from "../../src/io/backup";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

async function seed() {
  const nb = await createNotebook({ title: "Bio" });
  const [ink] = await getPages(nb.id);
  await putStroke(ink.id, { id: "s1", tool: "pen", variant: "fountain", color: "#fff", paletteIndex: 2, width: 3, points: new Float32Array([1, 2, 0.5, 0, 3, 4, 0.7, 8]) });
  await db.blobs.add({ id: "b1", data: new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/webp" }) });
  await db.objects.add({ id: "o1", pageId: ink.id, kind: "image", x: 10, y: 20, w: 100, h: 50, rotation: 15, blobId: "b1", z: 1 });
  const t = await insertPage(nb.id, 1, { kind: "text" });
  await updatePage(t.id, { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "mitosis" }] }] } });
  await insertPage(nb.id, 2, { kind: "html", title: "Viz", source: "<p>live</p>", artifactType: "html", allowNetwork: true });
  return nb;
}

it("export then import makes a full copy with new ids", async () => {
  const nb = await seed();
  const file = await exportBackup(nb.id);
  expect(BACKUP_EXT).toBe(".opennote");
  const copy = await importBackup(file);
  expect(copy.id).not.toBe(nb.id);
  expect(copy.title).toBe("Bio");
  const pages = await getPages(copy.id);
  expect(pages.map((p) => p.kind)).toEqual(["ink", "text", "html"]);
  expect(pages.every((p) => p.notebookId === copy.id)).toBe(true);
  const [s] = await getStrokes(pages[0].id);
  expect(s.id).not.toBe("s1");
  expect(Array.from(s.points)).toEqual([1, 2, 0.5, 0, 3, 4, expect.closeTo(0.7, 5), 8]);
  expect(s).toMatchObject({ variant: "fountain", paletteIndex: 2 });
  const [o] = await getObjects(pages[0].id);
  expect(o).toMatchObject({ x: 10, y: 20, rotation: 15 });
  expect(o.blobId).not.toBe("b1");
  const blob = (await db.blobs.get(o.blobId!))!.data;
  expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3, 250]);
  expect(pages[1]).toMatchObject({ doc: { type: "doc" } });
  expect(pages[2]).toMatchObject({ source: "<p>live</p>", allowNetwork: false }); // imports never switch internet on
  expect((await listNotebooks()).length).toBe(2);
});

it("rejects a file that is not an OpenNote backup and writes nothing", async () => {
  await expect(importBackup(new Blob(["hello"]))).rejects.toThrow("This file is not an OpenNote backup.");
  expect(await listNotebooks()).toEqual([]);
});
