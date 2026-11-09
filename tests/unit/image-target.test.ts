import { imageTarget } from "../../src/notebook/imageTarget";

const pg = (id: string, kind: "ink" | "text" | "html") => ({ id, kind }) as never;

describe("imageTarget", () => {
  it("uses the current page when it is an ink page", () => {
    expect(imageTarget([pg("a", "ink"), pg("b", "ink")], 1)).toEqual({ pageId: "b" });
  });
  it("inserts a new ink page right after a text or live page instead of jumping to page 1", () => {
    expect(imageTarget([pg("a", "ink"), pg("b", "html")], 1)).toEqual({ insertAt: 2 });
  });
  it("handles an empty notebook", () => {
    expect(imageTarget([], 0)).toEqual({ insertAt: 0 });
  });
});
