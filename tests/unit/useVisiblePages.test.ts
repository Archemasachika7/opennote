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
