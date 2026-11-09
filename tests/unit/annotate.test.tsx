import "fake-indexeddb/auto";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import { db, type TextPage as TP } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { insertPage } from "../../src/store/pages";
import { getStrokes } from "../../src/store/strokes";
import { Annotatable, useAnnotate } from "../../src/ink/Annotatable";
import { setTool, getTool } from "../../src/notebook/tool";
import { Toolbar } from "../../src/notebook/Toolbar";
import { buildSrcdoc } from "../../src/live/srcdoc";

let page: TP;
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const nb = await createNotebook({ title: "x" });
  page = (await insertPage(nb.id, 1, { kind: "text" })) as TP;
  setTool({ tool: "pen", penSeen: false, mode: "interact" });
});

const W = 702;
const H = 936;
const overlay = () => screen.getByTestId("annotation-overlay");
function draw(el: Element, pointerType: string) {
  fireEvent.pointerDown(el, { pointerId: 7, pointerType, clientX: 20, clientY: 20, pressure: 0.5, buttons: 1 });
  for (let i = 1; i <= 8; i++) fireEvent.pointerMove(el, { pointerId: 7, pointerType, clientX: 20 + i * 10, clientY: 20, pressure: 0.5, buttons: 1 });
  fireEvent.pointerUp(el, { pointerId: 7, pointerType, clientX: 100, clientY: 20 });
}
const subject = () => (
  <Annotatable pageId={page.id} width={W} height={H} paper="dark">
    <div data-testid="content">text page content</div>
  </Annotatable>
);

it("pen hover activates the overlay and pen strokes are stored for the page", async () => {
  render(subject());
  expect(overlay()).toHaveStyle({ pointerEvents: "none" });
  fireEvent.pointerOver(screen.getByTestId("content"), { pointerType: "pen" });
  expect(overlay()).toHaveStyle({ pointerEvents: "auto" });
  await waitFor(() => expect(screen.getByTestId("ink-surface")).toHaveAttribute("data-loaded"));
  draw(screen.getByTestId("ink-surface"), "pen");
  await waitFor(async () => expect(await getStrokes(page.id)).toHaveLength(1));
});

it("touch leaves the overlay off so the page stays interactive", () => {
  render(subject());
  fireEvent.pointerDown(screen.getByTestId("content"), { pointerType: "touch" });
  fireEvent.pointerOver(screen.getByTestId("content"), { pointerType: "touch" });
  expect(overlay()).toHaveStyle({ pointerEvents: "none" });
});

it("annotate mode lets a mouse draw", async () => {
  setTool({ mode: "annotate" });
  render(subject());
  expect(overlay()).toHaveStyle({ pointerEvents: "auto" });
  await waitFor(() => expect(screen.getByTestId("ink-surface")).toHaveAttribute("data-loaded"));
  draw(screen.getByTestId("ink-surface"), "mouse");
  await waitFor(async () => expect(await getStrokes(page.id)).toHaveLength(1));
});

it("mouse in interact mode does not draw even when the overlay is active", async () => {
  render(subject());
  fireEvent.pointerOver(screen.getByTestId("content"), { pointerType: "pen" });
  await waitFor(() => expect(screen.getByTestId("ink-surface")).toHaveAttribute("data-loaded"));
  draw(screen.getByTestId("ink-surface"), "mouse");
  await new Promise((r) => setTimeout(r, 50));
  expect(await getStrokes(page.id)).toHaveLength(0);
});

it("children can report pen activity (live pages forward it from the sandbox)", () => {
  let ping: (() => void) | null = null;
  function Child() { ping = useAnnotate().penActivity; return null; }
  render(<Annotatable pageId={page.id} width={W} height={H} paper="dark"><Child /></Annotatable>);
  expect(overlay()).toHaveStyle({ pointerEvents: "none" });
  act(() => ping!());
  expect(overlay()).toHaveStyle({ pointerEvents: "auto" });
});

it("sandbox documents report pen activity to the app", () => {
  expect(buildSrcdoc({ source: "<p/>", type: "html", allowNetwork: false })).toContain("opennote:pen");
});

describe("mouse mode switch", () => {
  const nb = { id: "n", title: "t", coverColor: "#fff", paper: "dark" as const, folderId: null, bookmarks: [], pageIds: [], createdAt: 0, updatedAt: 0 };
  const bar = (kind: "ink" | "text" | "html") => <Toolbar notebook={nb} zoom={1} setZoom={() => {}} onUndo={() => {}} onRedo={() => {}} currentKind={kind} />;
  it("is not shown on ink pages (they are always for writing)", () => {
    render(bar("ink"));
    expect(screen.queryByRole("radiogroup", { name: /mouse on this page/i })).toBeNull();
  });
  it("on live and text pages offers explicit Use page / Write on page choices", async () => {
    const { rerender } = render(bar("html"));
    const use = screen.getByRole("radio", { name: "Use page" });
    const write = screen.getByRole("radio", { name: "Write on page" });
    expect(use).toBeChecked();
    act(() => write.click());
    expect(getTool().mode).toBe("annotate");
    rerender(bar("text"));
    expect(screen.getByRole("radio", { name: "Write on page" })).toBeChecked();
    act(() => screen.getByRole("radio", { name: "Use page" }).click());
    expect(getTool().mode).toBe("interact");
  });
});
