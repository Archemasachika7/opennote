import { createCapacitorPort } from "../../src/platform/capacitor";

it("Android saveFile writes the file to Documents and opens the share sheet", async () => {
  const writeFile = vi.fn(async () => ({ uri: "file:///docs/Notes.pdf" }));
  const share = vi.fn(async () => ({}));
  const port = createCapacitorPort({ Filesystem: { writeFile }, Share: { share }, Directory: { Documents: "DOCUMENTS", Cache: "CACHE" } });
  await port.saveFile("Notes.pdf", new Blob(["%PDF-1.7"], { type: "application/pdf" }));
  expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: "OpenNote/Notes.pdf", directory: "DOCUMENTS", recursive: true, data: btoa("%PDF-1.7") }));
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "file:///docs/Notes.pdf", title: "Notes.pdf" }));
});

it("falls back to the cache folder when Documents is not writable", async () => {
  const writeFile = vi.fn()
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValueOnce({ uri: "file:///cache/a.pdf" });
  const share = vi.fn(async () => ({}));
  const port = createCapacitorPort({ Filesystem: { writeFile }, Share: { share }, Directory: { Documents: "DOCUMENTS", Cache: "CACHE" } });
  await port.saveFile("a.pdf", new Blob(["x"]));
  expect(writeFile).toHaveBeenLastCalledWith(expect.objectContaining({ directory: "CACHE" }));
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "file:///cache/a.pdf" }));
});
