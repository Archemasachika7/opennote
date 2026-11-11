import { dropTargetAt, markDropTarget } from "../../src/ink/dropTarget";
import { PAGE_SIZE } from "../../src/store/schema";

/** Two pages stacked down the screen, 702 px wide (half size), 936 px tall, 40 px apart; the second has no ink surface. */
function pages(secondIsInk = true) {
  document.body.innerHTML = "";
  const make = (id: string, top: number, ink: boolean) => {
    const wrap = document.createElement("section");
    wrap.className = "page-wrap";
    wrap.id = `page-${id}`;
    const body = document.createElement("div");
    if (ink) body.setAttribute("data-testid", "ink-surface");
    wrap.appendChild(body);
    const rect = { left: 100, right: 802, width: 702, top, bottom: top + 936, height: 936, x: 100, y: top, toJSON: () => ({}) };
    body.getBoundingClientRect = () => rect as DOMRect;
    wrap.getBoundingClientRect = () => rect as DOMRect;
    document.body.appendChild(wrap);
    return wrap;
  };
  return [make("a", 0, true), make("b", 976, secondIsInk)];
}

it("finds the page under the drop point and where on it, in page units", () => {
  pages();
  expect(dropTargetAt(400, 500, "a")).toBeNull(); // still on its own page
  expect(dropTargetAt(451, 976 + 100, "a")).toMatchObject({ kind: "page", pageId: "b", x: 702, y: 200 });
  expect(dropTargetAt(451, 960, "a")).toMatchObject({ kind: "page", pageId: "b" }); // in the gap, nearer page b
});

it("below the last page means a new page, landing near its top", () => {
  pages();
  const t = dropTargetAt(451, 976 + 936 + 50, "a");
  expect(t).toMatchObject({ kind: "new", afterPageId: "b", x: 702, y: 100 });
  expect((t as { y: number }).y).toBeLessThanOrEqual(PAGE_SIZE.h);
});

it("a text or live page says it can't hold ink, and the target page gets an outline", () => {
  const [, b] = pages(false);
  expect(dropTargetAt(451, 1200, "a")).toMatchObject({ kind: "not-ink" });
  markDropTarget(b);
  expect(b.classList.contains("drop-target")).toBe(true);
  markDropTarget(null);
  expect(b.classList.contains("drop-target")).toBe(false);
});
