import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
vi.stubGlobal("Blob", NodeBlob);
import Dexie from "dexie";

// The app's db opens on import, so build the old (v2) database first, then import the app.
it("v3 upgrade moves old JSON-indexed recordings into the recordings table, one audio copy each", async () => {
  await Dexie.delete("opennote");
  const old = new Dexie("opennote");
  old.version(1).stores({
    notebooks: "id, folderId, updatedAt, title", pages: "id, notebookId", strokes: "id, pageId",
    objects: "id, pageId", blobs: "id", folders: "id, parentId",
  });
  old.version(2).stores({ cards: "id, notebookId" });
  await old.open();
  const index = [
    { id: "c1", notebookId: "nb1", title: "Week 1", durationMs: 4000, mimeType: "audio/webm", createdAt: 100, transcript: "hi" },
    { id: "c2", notebookId: "nb1", title: "Week 2", durationMs: 5000, mimeType: "audio/wav", createdAt: 200 },
    { id: "c3", notebookId: "nb1", title: "Missing audio", durationMs: 1, mimeType: "audio/webm", createdAt: 300 },
  ];
  const json = JSON.stringify(index);
  await old.table("blobs").bulkPut([
    { id: "opennote:audio-index:nb1", data: new Blob([json], { type: "application/json" }), json },
    // the old code kept the audio twice: as a Blob and as raw bytes
    { id: "opennote:audio-clip:c1", data: new Blob(["AAA"], { type: "audio/webm" }), bytes: new Uint8Array([65, 65, 65]).buffer, mimeType: "audio/webm" },
    // only bytes survived (what fake-indexeddb / some WebViews did with Blobs)
    { id: "opennote:audio-clip:c2", bytes: new Uint8Array([66, 66]).buffer, mimeType: "audio/wav" },
    { id: "img1", data: new Blob(["png"], { type: "image/png" }) },
  ]);
  old.close();

  const { db } = await import("../../src/store/schema");
  const { listAudioClips, getAudioClipBlob } = await import("../../src/store/audio");
  const clips = await listAudioClips("nb1");
  expect(clips.map((c) => [c.id, c.title, c.transcript])).toEqual([["c1", "Week 1", "hi"], ["c2", "Week 2", undefined]]);
  expect(await (await getAudioClipBlob("c1"))!.text()).toBe("AAA");
  const b2 = await getAudioClipBlob("c2");
  expect(b2!.type).toBe("audio/wav");
  expect(await b2!.text()).toBe("BB");
  const ids = (await db.blobs.toCollection().primaryKeys()) as string[];
  expect(ids.sort()).toEqual(["img1", "opennote:audio-clip:c1", "opennote:audio-clip:c2"]);
  const raw = await db.blobs.get("opennote:audio-clip:c1");
  expect(Object.keys(raw!).sort()).toEqual(["data", "id"]);
});
