import { classifyPointer } from "../../src/ink/input";
import { createHistory } from "../../src/ink/history";
import type { Stroke } from "../../src/ink/model";

const ev = (pointerType: string, init: PointerEventInit = {}) => new PointerEvent("pointerdown", { pointerType, buttons: 1, ...init });

describe("classifyPointer", () => {
  const base = { penSeen: false, tool: "pen" as const };
  it("pen eraser button erases", () => expect(classifyPointer(ev("pen", { buttons: 33 }), base)).toBe("erase"));
  it("pen draws", () => expect(classifyPointer(ev("pen"), base)).toBe("draw"));
  it("touch after a pen navigates (palm rejection)", () => expect(classifyPointer(ev("touch"), { ...base, penSeen: true })).toBe("navigate"));
  it("touch before any pen draws", () => expect(classifyPointer(ev("touch"), base)).toBe("draw"));
  it("mouse middle button navigates", () => expect(classifyPointer(ev("mouse", { button: 1, buttons: 4 }), base)).toBe("navigate"));
  it("hand tool navigates", () => expect(classifyPointer(ev("mouse"), { ...base, tool: "hand" })).toBe("navigate"));
  it("mouse left draws", () => expect(classifyPointer(ev("mouse", { button: 0 }), base)).toBe("draw"));
});

describe("history", () => {
  const op = (n: number) => ({ remove: [] as Stroke[], add: [{ id: String(n) } as Stroke] });
  it("caps at 100", () => {
    const h = createHistory();
    for (let i = 0; i < 101; i++) h.push(op(i));
    let k = 0;
    while (h.undo()) k++;
    expect(k).toBe(100);
  });
  it("undo then redo returns the same op; push clears redo", () => {
    const h = createHistory();
    const a = op(1);
    h.push(a);
    expect(h.undo()).toBe(a);
    expect(h.redo()).toBe(a);
    h.undo();
    h.push(op(2));
    expect(h.redo()).toBeNull();
  });
});
