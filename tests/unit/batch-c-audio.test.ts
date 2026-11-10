import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
// fake-indexeddb clones with Node structuredClone, which keeps Node Blobs but drops jsdom Blobs (browsers keep both).
vi.stubGlobal("Blob", NodeBlob);
import { readFileSync } from "node:fs";
import { db } from "../../src/store/schema";
import { createNotebook, deleteNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes, putStroke } from "../../src/store/strokes";
import {
  deleteAudioClip, getAudioClipBlob, listAudioClips, saveAudioClip, updateAudioClipMeta,
} from "../../src/store/audio";
import { exportBackup, importBackup } from "../../src/io/backup";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

const audio = (s = "OPUS") => new Blob([s], { type: "audio/webm" });

describe("Batch C: recordings are real rows", () => {
  it("stores clip metadata in the recordings table, not as a JSON blob", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const clip = await saveAudioClip(nb.id, audio(), { title: "Lecture", durationMs: 5000 });
    const row = await db.recordings.get(clip.id);
    expect(row).toMatchObject({ id: clip.id, notebookId: nb.id, title: "Lecture", durationMs: 5000 });
    const ids = (await db.blobs.toCollection().primaryKeys()) as string[];
    expect(ids.some((id) => id.startsWith("opennote:audio-index:"))).toBe(false);
  });

  it("stores the audio once (no duplicate byte copy)", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const clip = await saveAudioClip(nb.id, audio("ABCDEF"), { durationMs: 1000 });
    const rows = await db.blobs.toArray();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["data", "id"]);
    const back = await getAudioClipBlob(clip.id);
    expect(await back!.text()).toBe("ABCDEF");
  });

  it("parallel saves keep every clip", async () => {
    const nb = await createNotebook({ title: "Bio" });
    await Promise.all([1, 2, 3, 4].map((i) => saveAudioClip(nb.id, audio(), { title: `R${i}`, durationMs: i })));
    expect((await listAudioClips(nb.id)).map((c) => c.title).sort()).toEqual(["R1", "R2", "R3", "R4"]);
  });

  it("lists clips oldest first and updates / deletes them", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const a = await saveAudioClip(nb.id, audio(), { title: "A", durationMs: 1 });
    const b = await saveAudioClip(nb.id, audio(), { title: "B", durationMs: 1 });
    await updateAudioClipMeta(nb.id, a.id, { transcript: "hello" });
    expect((await listAudioClips(nb.id)).map((c) => [c.title, c.transcript])).toEqual([["A", "hello"], ["B", undefined]]);
    await deleteAudioClip(nb.id, a.id);
    expect((await listAudioClips(nb.id)).map((c) => c.id)).toEqual([b.id]);
    expect(await getAudioClipBlob(a.id)).toBeNull();
    expect(await db.blobs.count()).toBe(1);
  });
});

describe("Batch C: deleting a notebook deletes its recordings", () => {
  it("removes recording rows and their audio blobs", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const other = await createNotebook({ title: "Chem" });
    await saveAudioClip(nb.id, audio(), { durationMs: 1 });
    const keep = await saveAudioClip(other.id, audio(), { durationMs: 1 });
    await deleteNotebook(nb.id);
    expect(await db.recordings.count()).toBe(1);
    expect(await db.blobs.count()).toBe(1);
    expect(await getAudioClipBlob(keep.id)).not.toBeNull();
  });
});

describe("Batch C: backups carry recordings", () => {
  it("export → import copies clips, transcripts and stroke links with new ids", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const clip = await saveAudioClip(nb.id, audio("LECTURE"), {
      title: "Week 1", durationMs: 9000, transcript: "cells", transcriptSegments: [{ offsetMs: 0, endMs: 900, text: "cells" }],
    });
    const [ink] = await getPages(nb.id);
    await putStroke(ink.id, {
      id: "s1", tool: "pen", variant: "fountain", color: "#fff", width: 3, points: new Float32Array([1, 2, 0.5, 0]),
      audioSync: { clipId: clip.id, offsetMs: 1200 },
    });
    const copy = await importBackup(await exportBackup(nb.id));
    const clips = await listAudioClips(copy.id);
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ title: "Week 1", durationMs: 9000, transcript: "cells" });
    expect(clips[0].transcriptSegments).toEqual([{ offsetMs: 0, endMs: 900, text: "cells" }]);
    expect(clips[0].id).not.toBe(clip.id);
    expect(await (await getAudioClipBlob(clips[0].id))!.text()).toBe("LECTURE");
    const [p] = await getPages(copy.id);
    const [s] = await getStrokes(p.id);
    expect(s.audioSync).toEqual({ clipId: clips[0].id, offsetMs: 1200 });
  });

  it("drops stroke links to clips that are not in the file", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const [ink] = await getPages(nb.id);
    await putStroke(ink.id, {
      id: "s1", tool: "pen", variant: "fountain", color: "#fff", width: 3, points: new Float32Array([1, 2, 0.5, 0]),
      audioSync: { clipId: "gone", offsetMs: 5 },
    });
    const copy = await importBackup(await exportBackup(nb.id));
    const [p] = await getPages(copy.id);
    const [s] = await getStrokes(p.id);
    expect(s.audioSync).toBeUndefined();
  });
});

describe("Batch C: Sarvam relay is not an open proxy", () => {
  const src = readFileSync("api/sarvam-stt.js", "utf8");
  it("never falls back to a server-side key", () => {
    expect(src).not.toMatch(/process\.env/);
  });
  it("does not allow every origin", () => {
    expect(src).not.toMatch(/Access-Control-Allow-Origin["']?\s*:\s*["']\*/);
  });
  it("client never calls the relay without the user's own key", () => {
    const client = readFileSync("src/ai/sarvamStt.ts", "utf8");
    expect(client).not.toMatch(/server-managed/i);
  });
});
