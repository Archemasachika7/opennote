import '@testing-library/jest-dom/vitest';
import 'vitest-canvas-mock';
import 'fake-indexeddb/auto';
import { configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 3000 });

// jsdom has no IntersectionObserver (every browser does); motion's whileInView needs it.
// Report every observed element as visible, so scroll reveals render their content in tests.
if (!("IntersectionObserver" in globalThis)) {
  class IO {
    constructor(private cb: (entries: { isIntersecting: boolean; target: Element; intersectionRatio: number }[]) => void) {}
    observe(target: Element) { queueMicrotask(() => this.cb([{ isIntersecting: true, target, intersectionRatio: 1 }])); }
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
}
