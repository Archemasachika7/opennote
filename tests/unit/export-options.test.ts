import { unzipSync } from "fflate";
import { parsePageRange } from "../../src/io/pageRange";
import { exportPagesJpg } from "../../src/io/exportImages";
import type { PageImage } from "../../src/io/exportPdf";
import type { Notebook, Page } from "../../src/store/schema";

describe("parsePageRange", () => {
  it("parses ranges, singles and spaces into 0-based indices, sorted and unique", () => {
    expect(parsePageRange("2-5, 8", 10)).toEqual([1, 2, 3, 4, 7]);
    expect(parsePageRange(" 3 ,1,3 ", 5)).toEqual([0, 2]);
    expect(parsePageRange("4-2", 5)).toEqual([1, 2, 3]);
  });
  it("rejects pages that do not exist or text that is not a range", () => {
    expect(() => parsePageRange("0", 5)).toThrow("Pages go from 1 to 5");
    expect(() => parsePageRange("2-9", 5)).toThrow("Pages go from 1 to 5");
    expect(() => parsePageRange("abc", 5)).toThrow('Use page numbers like "2-5, 8"');
    expect(() => parsePageRange("", 5)).toThrow('Use page numbers like "2-5, 8"');
  });
});

describe("exportPagesJpg", () => {
  const nb = { title: "Bio" } as Notebook;
  const pages = [{ id: "a" }, { id: "b" }] as Page[];
  const jpeg = (n: number): PageImage => ({ bytes: new Uint8Array([0xff, 0xd8, n]), type: "jpeg", w: 10, h: 10 });
  const render = async (p: Page) => ({ images: p.id === "a" ? [jpeg(1)] : [jpeg(2), jpeg(3)] });

  it("one page with one image gives a single .jpg", async () => {
    const r = await exportPagesJpg([pages[0]], nb, render);
    expect(r.name).toBe("Bio.jpg");
    expect(Array.from(new Uint8Array(await r.blob.arrayBuffer()))).toEqual([0xff, 0xd8, 1]);
  });
  it("several pages give a zip with one numbered jpg per image", async () => {
    const r = await exportPagesJpg(pages, nb, render);
    expect(r.name).toBe("Bio (jpg).zip");
    const files = unzipSync(new Uint8Array(await r.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["Bio-01.jpg", "Bio-02.jpg", "Bio-03.jpg"]);
  });
});
