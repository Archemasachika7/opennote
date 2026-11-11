import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BookView } from "../../src/notebook/BookView";
import { getPageLayout, setPageLayout, turnKey, turnTarget } from "../../src/notebook/pageLayout";

function reducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}

function Harness({ count, onAdd = () => {} }: { count: number; onAdd?: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div ref={scroller}>
      <BookView pageKey={`p${i}`} index={i} count={count} dir={dir} scroller={scroller} onAddPage={onAdd}
        onTurn={(d) => { const to = turnTarget(i, d, count); if (to !== null) { setDir(d); setI(to); } }}>
        <p>Page body {i + 1}</p>
      </BookView>
    </div>
  );
}

beforeEach(() => { localStorage.clear(); reducedMotion(false); setPageLayout("scroll"); });

describe("page layout prefs", () => {
  it("turns only within the notebook", () => {
    expect(turnTarget(0, -1, 3)).toBeNull();
    expect(turnTarget(0, 1, 3)).toBe(1);
    expect(turnTarget(2, 1, 3)).toBeNull();
    expect(turnTarget(2, -1, 3)).toBe(1);
  });

  it("maps arrows and Page Up/Down, but not shortcuts with modifiers", () => {
    const k = (key: string, mod = false) => turnKey({ key, ctrlKey: mod, metaKey: false, altKey: false });
    expect(k("ArrowRight")).toBe(1);
    expect(k("PageDown")).toBe(1);
    expect(k("ArrowLeft")).toBe(-1);
    expect(k("PageUp")).toBe(-1);
    expect(k("ArrowRight", true)).toBe(0);
    expect(k("a")).toBe(0);
  });

  it("remembers book view on this device", () => {
    setPageLayout("book");
    expect(getPageLayout()).toBe("book");
    expect(localStorage.getItem("opennote.pageLayout")).toBe("book");
  });
});

describe("BookView", () => {
  it("shows one page and turns with the buttons", () => {
    render(<Harness count={3} />);
    expect(screen.getByText("Page body 1")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByText("Page body 2")).toBeInTheDocument();
  });

  it("turns with the keyboard, but not while typing", () => {
    render(<><Harness count={3} /><input aria-label="field" /></>);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "PageUp" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("offers to add a page after the last one", () => {
    const onAdd = vi.fn();
    render(<Harness count={1} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add page" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("still turns with reduced motion (cross-fade instead of a swing)", () => {
    reducedMotion(true);
    render(<Harness count={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });
});
