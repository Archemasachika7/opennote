import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
// fake-indexeddb clones with Node structuredClone, which keeps Node Blobs but drops jsdom Blobs (browsers keep both).
vi.stubGlobal("Blob", NodeBlob);
import { fireEvent, render, screen } from "@testing-library/react";
import { db, objectBlobIds, type PageObject } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { deletePage, getPages, insertPage } from "../../src/store/pages";
import { deleteObjects, getObjects } from "../../src/ink/objects";
import { exportBackup, importBackup } from "../../src/io/backup";
import { formatDuration, MAX_VIDEO_BYTES, addVideo, videoBox } from "../../src/ink/video";
import { VideoLayer } from "../../src/ink/VideoLayer";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

async function seedVideo(): Promise<{ nbId: string; pageId: string }> {
  const nb = await createNotebook({ title: "Lab" });
  const [ink] = await getPages(nb.id);
  await db.blobs.bulkAdd([
    { id: "poster", data: new Blob([new Uint8Array([1, 2])], { type: "image/webp" }) },
    { id: "film", data: new Blob([new Uint8Array([9, 9, 9])], { type: "video/mp4" }) },
  ]);
  await db.objects.add({ id: "v1", pageId: ink.id, kind: "image", x: 0, y: 0, w: 800, h: 450, rotation: 0, z: 1, blobId: "poster",
    video: { blobId: "film", mime: "video/mp4", duration: 65 } });
  return { nbId: nb.id, pageId: ink.id };
}

describe("video helpers", () => {
  it("fits a video 800 units wide, keeping its shape", () => {
    expect(videoBox(1920, 1080)).toEqual({ w: 800, h: 450 });
    expect(videoBox(1080, 1920)).toEqual({ w: 800, h: 1422 });
    expect(videoBox(0, 0)).toEqual({ w: 800, h: 450 });
  });

  it("shows lengths like a player", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(undefined)).toBe("");
  });

  it("refuses videos over the size limit before reading them", async () => {
    const big = { size: MAX_VIDEO_BYTES + 1, type: "video/mp4" } as unknown as File;
    await expect(addVideo("p", big)).rejects.toThrow(/up to 200 MB/);
  });

  it("lists both the poster and the video file as the object's blobs", () => {
    expect(objectBlobIds({ blobId: "poster", video: { blobId: "film", mime: "video/mp4" } })).toEqual(["poster", "film"]);
    expect(objectBlobIds({ blobId: "pic" })).toEqual(["pic"]);
  });
});

describe("video storage", () => {
  it("keeps the video file in a backup and restores it", async () => {
    const { nbId } = await seedVideo();
    const copy = await importBackup(await exportBackup(nbId));
    const [page] = await getPages(copy.id);
    const [o] = await getObjects(page.id);
    expect(o.video).toMatchObject({ mime: "video/mp4", duration: 65 });
    expect(o.video!.blobId).not.toBe("film");
    const film = await db.blobs.get(o.video!.blobId);
    expect(film?.data.size).toBe(3);
  });

  it("removes the video file with the object, unless a copy still uses it", async () => {
    const { pageId } = await seedVideo();
    const o = (await db.objects.get("v1"))!;
    await db.objects.add({ ...o, id: "v2" });
    await deleteObjects(["v1"]);
    expect(await db.blobs.get("film")).toBeTruthy();
    await deleteObjects(["v2"]);
    expect(await db.blobs.get("film")).toBeUndefined();
    expect(await db.blobs.get("poster")).toBeUndefined();
    expect(await getObjects(pageId)).toEqual([]);
  });

  it("removes the video file when its page is deleted", async () => {
    const { nbId, pageId } = await seedVideo();
    await insertPage(nbId, 1, { kind: "ink", template: "blank" });
    await deletePage(pageId);
    expect(await db.blobs.get("film")).toBeUndefined();
  });
});

describe("VideoLayer", () => {
  const video: PageObject = { id: "v1", pageId: "p", kind: "image", x: 100, y: 100, w: 800, h: 450, rotation: 0, z: 1, blobId: "poster",
    video: { blobId: "film", mime: "video/mp4", duration: 65 } };

  it("shows a play button with the length on each video, and nothing for plain pictures", () => {
    const { rerender } = render(<VideoLayer objects={[video]} scale={0.5} />);
    expect(screen.getByRole("button", { name: "Play video (1:05)" })).toBeInTheDocument();
    rerender(<VideoLayer objects={[{ ...video, video: undefined }]} scale={0.5} />);
    expect(screen.queryByTestId("video-layer")).toBeNull();
  });

  it("swaps the button for a player, and back on close", () => {
    render(<VideoLayer objects={[video]} scale={0.5} />);
    fireEvent.click(screen.getByRole("button", { name: /Play video/ }));
    expect(screen.getByRole("button", { name: "Close video" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.getByRole("button", { name: /Play video/ })).toBeInTheDocument();
  });

  it("hides videos on hidden layers", () => {
    render(<VideoLayer objects={[{ ...video, layerId: "L2" }]} scale={0.5} hidden={new Set(["L2"])} />);
    expect(screen.queryByTestId("video-layer")).toBeNull();
  });
});
