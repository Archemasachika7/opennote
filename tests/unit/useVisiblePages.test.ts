import { render, act } from "@testing-library/react";
import { createElement, useRef } from "react";
import { useVisiblePages } from "../../src/notebook/useVisiblePages";

type Cb = (entries: Partial<IntersectionObserverEntry>[]) => void;
let lastCb: Cb | null = null;
class FakeIO {
  constructor(cb: Cb) { lastCb = cb; }
  observe() {} unobserve() {} disconnect() {}
}

beforeEach(() => { (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO; });

it("mounts the visible page and its neighbours", () => {
  let out: ReturnType<typeof useVisiblePages> | null = null;
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    out = useVisiblePages(ref, 10);
    return createElement("div", { ref }, Array.from({ length: 10 }, (_, i) => createElement("div", { key: i, "data-page-index": i })));
  }
  const { container } = render(createElement(Probe));
  const el5 = container.querySelector('[data-page-index="5"]')!;
  act(() => lastCb!([{ target: el5, isIntersecting: true, intersectionRatio: 0.9 }]));
  expect([...out!.mounted].sort((a, b) => a - b)).toEqual([4, 5, 6]);
  expect(out!.current).toBe(5);
});

it("current page is the one occupying the most screen height, not the highest visible ratio", () => {
  let out: ReturnType<typeof useVisiblePages> | null = null;
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    out = useVisiblePages(ref, 3);
    return createElement("div", { ref }, Array.from({ length: 3 }, (_, i) => createElement("div", { key: i, "data-page-index": i })));
  }
  const { container } = render(createElement(Probe));
  const el = (i: number) => container.querySelector(`[data-page-index="${i}"]`)!;
  // page 0: only a 60px sliver visible but it is a short element (ratio 1); page 1 fills 700px of the screen (ratio 0.6)
  act(() => lastCb!([
    { target: el(0), isIntersecting: true, intersectionRatio: 1, intersectionRect: { height: 60 } as DOMRectReadOnly },
    { target: el(1), isIntersecting: true, intersectionRatio: 0.6, intersectionRect: { height: 700 } as DOMRectReadOnly },
  ]));
  expect(out!.current).toBe(1);
});
