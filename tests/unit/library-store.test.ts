import "fake-indexeddb/auto";
import { db } from "../../src/store/schema";
import { createNotebook, listNotebooks, toggleFavorite, trashNotebook, restoreNotebook, purgeTrash, getNotebook, moveNotebooks } from "../../src/store/notebooks";
import { insertPage } from "../../src/store/pages";
import { createFolder } from "../../src/store/folders";
import { searchAll } from "../../src/store/search";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

it("favourites can be toggled and filtered", async () => {
  const a = await createNotebook({ title: "A" });
  await createNotebook({ title: "B" });
  await toggleFavorite(a.id);
  expect((await listNotebooks({ view: "favorites" })).map((n) => n.title)).toEqual(["A"]);
  await toggleFavorite(a.id);
  expect(await listNotebooks({ view: "favorites" })).toEqual([]);
});

it("trash hides notebooks everywhere else; restore brings them back", async () => {
  const a = await createNotebook({ title: "Gone" });
  await createNotebook({ title: "Kept" });
  await trashNotebook(a.id);
  expect((await listNotebooks()).map((n) => n.title)).toEqual(["Kept"]);
  expect((await listNotebooks({ view: "trash" })).map((n) => n.title)).toEqual(["Gone"]);
  expect((await searchAll("gone")).length).toBe(0);
  await restoreNotebook(a.id);
  expect((await listNotebooks()).map((n) => n.title).sort()).toEqual(["Gone", "Kept"]);
});

it("purgeTrash permanently deletes notebooks trashed more than 30 days ago", async () => {
  const old = await createNotebook({ title: "Old" });
  const recent = await createNotebook({ title: "Recent" });
  await trashNotebook(old.id, Date.now() - 31 * 864e5);
  await trashNotebook(recent.id);
  expect(await purgeTrash()).toBe(1);
  expect(await getNotebook(old.id)).toBeUndefined();
  expect(await getNotebook(recent.id)).toBeTruthy();
});

it("sorts by name, created, modified and page count", async () => {
  const a = await createNotebook({ title: "Bravo" });
  await new Promise((r) => setTimeout(r, 5));
  const b = await createNotebook({ title: "Alpha" });
  await insertPage(a.id, 1, { kind: "text" });
  expect((await listNotebooks({ sort: "title" })).map((n) => n.title)).toEqual(["Alpha", "Bravo"]);
  expect((await listNotebooks({ sort: "created" })).map((n) => n.id)).toEqual([b.id, a.id]);
  expect((await listNotebooks({ sort: "updated" }))[0].id).toBe(a.id);
  expect((await listNotebooks({ sort: "pages" }))[0].id).toBe(a.id);
});

it("moves several notebooks into a folder at once", async () => {
  const f = await createFolder("Sem 2");
  const a = await createNotebook({ title: "A" });
  const b = await createNotebook({ title: "B" });
  await moveNotebooks([a.id, b.id], f.id);
  expect((await listNotebooks({ folderId: f.id })).length).toBe(2);
});
