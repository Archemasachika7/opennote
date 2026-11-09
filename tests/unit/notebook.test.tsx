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
