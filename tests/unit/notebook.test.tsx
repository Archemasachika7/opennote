import "fake-indexeddb/auto";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db } from "../../src/store/schema";
import { createNotebook, getNotebook } from "../../src/store/notebooks";
import { getPages, insertPage } from "../../src/store/pages";
import { NotebookView } from "../../src/notebook/NotebookView";

class FakeIO { constructor(_: unknown) {} observe() {} unobserve() {} disconnect() {} }
beforeEach(async () => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  Element.prototype.scrollIntoView = vi.fn();
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function setup() {
  const nb = await createNotebook({ title: "Lab" });
  await insertPage(nb.id, 1, { kind: "ink", template: "grid" });
  render(<NotebookView id={nb.id} />);
  await screen.findAllByTestId("thumb");
  return nb;
}

it("inserts a text page between pages via the gap menu", async () => {
  const user = userEvent.setup();
  const nb = await setup();
  await user.click(screen.getByRole("button", { name: "Insert page at 2" }));
  const menu = screen.getByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Ink page" })).toBeInTheDocument();
  expect(within(menu).getByRole("menuitem", { name: "Live page" })).toBeInTheDocument();
  await user.click(within(menu).getByRole("menuitem", { name: "Text page" }));
  await waitFor(async () => expect((await getPages(nb.id)).map((p) => p.kind)).toEqual(["ink", "text", "ink"]));
});

it("reorders by dragging thumbnails", async () => {
  const nb = await setup();
  const before = (await getPages(nb.id)).map((p) => p.id);
  const thumbs = screen.getAllByTestId("thumb");
  fireEvent.dragStart(thumbs[1], { dataTransfer: { setData() {}, effectAllowed: "" } });
  fireEvent.dragOver(thumbs[0]);
  fireEvent.drop(thumbs[0]);
  await waitFor(async () => expect((await getPages(nb.id)).map((p) => p.id)).toEqual([before[1], before[0]]));
});

it("page menu offers duplicate, delete, bookmark and template for ink", async () => {
  const user = userEvent.setup();
  const nb = await setup();
  await user.click(screen.getAllByRole("button", { name: /page options/i })[0]);
  const menu = screen.getByRole("menu");
  for (const name of ["Duplicate", "Delete", "Bookmark", "Template: ruled"]) {
    expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
  }
  await user.click(within(menu).getByRole("menuitem", { name: "Bookmark" }));
  await waitFor(async () => expect((await getNotebook(nb.id))!.bookmarks).toHaveLength(1));
});

it("bookmarks tab lists bookmarked pages and scrolls to them", async () => {
  const user = userEvent.setup();
  await setup();
  await user.click(screen.getAllByRole("button", { name: /page options/i })[1]);
  await user.click(screen.getByRole("menuitem", { name: "Bookmark" }));
  await user.click(screen.getByRole("tab", { name: "Bookmarks" }));
  const items = await screen.findAllByTestId("bookmark");
  expect(items).toHaveLength(1);
  await user.click(items[0]);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it("live thumbnails are tagged", async () => {
  const nb = await createNotebook({ title: "L" });
  await insertPage(nb.id, 1, { kind: "html", title: "Viz", source: "<p/>", artifactType: "html", allowNetwork: false });
  render(<NotebookView id={nb.id} />);
  const thumbs = await screen.findAllByTestId("thumb");
  expect(thumbs[1]).toHaveAttribute("data-live", "true");
  expect(within(thumbs[1]).getByText("LIVE")).toBeInTheDocument();
});

it("paper menu switches notebook paper", async () => {
  const user = userEvent.setup();
  const nb = await setup();
  await user.click(screen.getByRole("button", { name: /notebook options/i }));
  await user.click(screen.getByRole("menuitem", { name: "Light paper" }));
  await waitFor(async () => expect((await getNotebook(nb.id))!.paper).toBe("light"));
});

it("image tool returns to the previous tool after the picker closes (even when cancelled)", async () => {
  const user = userEvent.setup();
  const port = await import("../../src/platform/port");
  const spy = vi.spyOn(port.platform, "openFiles").mockResolvedValue([]);
  const { getTool, setTool } = await import("../../src/notebook/tool");
  setTool({ tool: "pen" });
  await setup();
  await user.click(screen.getByRole("button", { name: "Image" }));
  await waitFor(() => expect(spy).toHaveBeenCalled());
  await waitFor(() => expect(getTool().tool).toBe("pen"));
  spy.mockRestore();
});

it("tool buttons have hover labels", async () => {
  await setup();
  expect(screen.getByRole("button", { name: "Lasso" })).toHaveAttribute("title", expect.stringMatching(/lasso/i));
});

it("Ctrl+V pastes copied ink onto the current page; page menu offers Paste here", async () => {
  const user = userEvent.setup();
  const { copyToClipboard, CLIP_MARKER } = await import("../../src/ink/clipboard");
  const { getStrokes } = await import("../../src/store/strokes");
  const nb = await setup();
  const [p0, p1] = await getPages(nb.id);
  copyToClipboard(p1.id, [{ id: "c1", tool: "pen", variant: "ball", color: "#fff", width: 3, points: new Float32Array([10, 10, 0.5, 0, 40, 40, 0.5, 8]) }], []);
  const dt = { files: [], getData: (t: string) => (t === "text/plain" ? CLIP_MARKER : "") };
  const ev = new Event("paste", { bubbles: true }) as ClipboardEvent;
  Object.defineProperty(ev, "clipboardData", { value: dt });
  document.body.dispatchEvent(ev);
  await waitFor(async () => expect(await getStrokes(p0.id)).toHaveLength(1));
  await user.click(screen.getAllByRole("button", { name: /page options/i })[1]);
  await user.click(screen.getByRole("menuitem", { name: "Paste here" }));
  await waitFor(async () => expect(await getStrokes(p1.id)).toHaveLength(1));
});

it("shapes tool shows a picker of predefined shapes", async () => {
  const user = userEvent.setup();
  const { getTool } = await import("../../src/notebook/tool");
  await setup();
  await user.click(screen.getByRole("button", { name: "Shapes" }));
  const picker = screen.getByRole("combobox", { name: "Shape" });
  for (const label of ["Auto (hold to snap)", "Line", "Arrow", "Rectangle", "Rounded rectangle", "Ellipse / circle", "Triangle", "Diamond", "Star"]) {
    expect(within(picker).getByRole("option", { name: label })).toBeInTheDocument();
  }
  await user.selectOptions(picker, "star");
  expect(getTool().shapeKind).toBe("star");
});

it("Outline tab lists headings from text pages and jumps to their page", async () => {
  const user = userEvent.setup();
  const { updatePage } = await import("../../src/store/pages");
  const nb = await createNotebook({ title: "O" });
  const tp = await insertPage(nb.id, 1, { kind: "text" });
  await updatePage(tp.id, { doc: { type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Kinematics" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Velocity" }] },
  ] } });
  render(<NotebookView id={nb.id} />);
  await screen.findAllByTestId("thumb");
  await user.click(screen.getByRole("tab", { name: "Outline" }));
  const items = await screen.findAllByTestId("outline-item");
  expect(items.map((i) => i.textContent)).toEqual(["Kinematics", "Velocity"]);
  expect(items[1]).toHaveAttribute("data-level", "2");
  await user.click(items[0]);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

it("notebook menu exports a .opennote backup", async () => {
  const user = userEvent.setup();
  const port = await import("../../src/platform/port");
  const save = vi.spyOn(port.platform, "saveFile").mockResolvedValue();
  await setup();
  await user.click(screen.getByRole("button", { name: /notebook options/i }));
  await user.click(screen.getByRole("menuitem", { name: "Export backup (.opennote)" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("Lab.opennote", expect.anything()));
  save.mockRestore();
});

it("Export dialog sends the chosen page range to JPG export and saves the result", async () => {
  const user = userEvent.setup();
  const port = await import("../../src/platform/port");
  const images = await import("../../src/io/exportImages");
  const save = vi.spyOn(port.platform, "saveFile").mockResolvedValue();
  const jpg = vi.spyOn(images, "exportPagesJpg").mockResolvedValue({ blob: new Blob(["j"]), name: "Lab.jpg" });
  const nb = await setup();
  const pages = await getPages(nb.id);
  await user.click(screen.getByRole("button", { name: /notebook options/i }));
  await user.click(screen.getByRole("menuitem", { name: "Export..." }));
  const dialog = screen.getByRole("dialog", { name: "Export" });
  await user.click(within(dialog).getByRole("radio", { name: "JPG images" }));
  await user.click(within(dialog).getByRole("radio", { name: "Pages" }));
  await user.type(within(dialog).getByRole("textbox", { name: "Page range" }), "2");
  await user.click(within(dialog).getByRole("button", { name: "Export" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith("Lab.jpg", expect.anything()));
  expect(jpg.mock.calls[0][0].map((p) => p.id)).toEqual([pages[1].id]);
  save.mockRestore(); jpg.mockRestore();
});

it("Export dialog shows a readable error for a bad range", async () => {
  const user = userEvent.setup();
  await setup();
  await user.click(screen.getByRole("button", { name: /notebook options/i }));
  await user.click(screen.getByRole("menuitem", { name: "Export..." }));
  const dialog = screen.getByRole("dialog", { name: "Export" });
  await user.click(within(dialog).getByRole("radio", { name: "Pages" }));
  await user.type(within(dialog).getByRole("textbox", { name: "Page range" }), "7");
  await user.click(within(dialog).getByRole("button", { name: "Export" }));
  expect(within(dialog).getByText("Pages go from 1 to 2")).toBeInTheDocument();
});
