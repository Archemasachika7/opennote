import "fake-indexeddb/auto";
import { render, waitFor } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getStrokes } from "../../src/store/strokes";
import { InkLayer } from "../../src/ink/InkLayer";
import { setTool } from "../../src/notebook/tool";
import { hexToArgb, nativeInkAvailable, replayStroke } from "../../src/platform/nativeInk";
import { resetGate } from "../../src/ink/palmGate";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); resetGate(); setTool({ tool: "pen", penSeen: true }); });

it("is off outside the Android app", () => {
  expect(nativeInkAvailable()).toBe(false);
});

it("gives Android colour ints for hex colours", () => {
  expect(hexToArgb("#FF0000")).toBe(0xffff0000 | 0);
  expect(hexToArgb("#E8E9EE")).toBe(0xffe8e9ee | 0);
});

it("a stroke finished natively is saved by the normal ink engine, where it was drawn", async () => {
  const nb = await createNotebook({ title: "Native" });
  const [page] = await getPages(nb.id);
  const { getByTestId } = render(<InkLayer pageId={page.id} width={702} height={936} paper="dark" />);
  const el = getByTestId("ink-surface");
  // jsdom has no layout: the surface sits at 0,0 and is 702 CSS px wide (logical page 1404 → scale 0.5)
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 702, height: 936, right: 702, bottom: 936, x: 0, y: 0, toJSON() {} }) as DOMRect;
  // native points in CSS px: [x, y, pressure, ms, ...]
  replayStroke(el, [50, 60, 0.4, 0, 100, 60, 0.6, 8, 150, 62, 0.5, 16], 50_001);
  await waitFor(async () => expect(await getStrokes(page.id)).toHaveLength(1));
  const [s] = await getStrokes(page.id);
  expect(s.points[0]).toBeCloseTo(100, 0); // 50 CSS px at scale 0.5 = 100 logical
  expect(s.points[1]).toBeCloseTo(120, 0);
  expect(s.points[2]).toBeCloseTo(0.4, 2); // the stylus pressure is kept
});
