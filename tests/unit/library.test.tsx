import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db } from "../../src/store/schema";
import { LibraryView } from "../../src/library/LibraryView";
import { createNotebook, listNotebooks } from "../../src/store/notebooks";
import { createFolder } from "../../src/store/folders";
import { insertPage, updatePage } from "../../src/store/pages";
import { searchAll } from "../../src/store/search";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  window.location.hash = "#/";
});

describe("LibraryView", () => {
  it("creates a notebook and navigates to it", async () => {
    const user = userEvent.setup();
    render(<LibraryView />);
    await user.click(screen.getByRole("button", { name: /new notebook/i }));
    await waitFor(async () => expect(await listNotebooks()).toHaveLength(1));
    const [nb] = await listNotebooks();
    await waitFor(() => expect(window.location.hash).toBe(`#/nb/${nb.id}`));
  });

  it("renames through the card menu", async () => {
    const user = userEvent.setup();
    await createNotebook({ title: "Old" });
    render(<LibraryView />);
    await user.click(await screen.findByRole("button", { name: /more for old/i }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByRole("textbox", { name: /notebook name/i });
    await user.clear(input);
    await user.type(input, "New{Enter}");
    expect(await screen.findByText("New")).toBeInTheDocument();
  });

  it("delete moves a notebook to Trash, where it can be restored or deleted forever after confirming", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    await createNotebook({ title: "Doomed" });
    render(<LibraryView />);
    await user.click(await screen.findByRole("button", { name: /more for doomed/i }));
    await user.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
    await waitFor(() => expect(screen.queryByText("Doomed")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Trash" }));
    expect(await screen.findByText("Doomed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /more for doomed/i }));
    await user.click(screen.getByRole("menuitem", { name: "Restore" }));
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(await screen.findByText("Doomed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /more for doomed/i }));
    await user.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
    await user.click(screen.getByRole("button", { name: "Trash" }));
    await user.click(await screen.findByRole("button", { name: /more for doomed/i }));
    await user.click(screen.getByRole("menuitem", { name: "Delete forever" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete forever" }));
    await waitFor(async () => expect(await listNotebooks({ view: "trash" })).toHaveLength(0));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("favourite from the card menu shows a star and the Favourites filter", async () => {
    const user = userEvent.setup();
    await createNotebook({ title: "Star me" });
    await createNotebook({ title: "Plain" });
    render(<LibraryView />);
    await user.click(await screen.findByRole("button", { name: /more for star me/i }));
    await user.click(screen.getByRole("menuitem", { name: "Add to Favourites" }));
    expect(await screen.findByLabelText("Favourite")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Favourites" }));
    await waitFor(() => expect(screen.queryByText("Plain")).not.toBeInTheDocument());
    expect(screen.getByText("Star me")).toBeInTheDocument();
  });

  it("switches between grid and list view", async () => {
    const user = userEvent.setup();
    await createNotebook({ title: "A" });
    render(<LibraryView />);
    await screen.findByText("A");
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(document.querySelector("[data-view=list]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Grid view" }));
    expect(document.querySelector("[data-view=grid]")).not.toBeNull();
  });

  it("select mode moves several notebooks to Trash at once", async () => {
    const user = userEvent.setup();
    await createNotebook({ title: "One" });
    await createNotebook({ title: "Two" });
    await createNotebook({ title: "Three" });
    render(<LibraryView />);
    await screen.findAllByText("One");
    await user.click(screen.getByRole("button", { name: "Select" }));
    await user.click(screen.getByRole("checkbox", { name: "Select One" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Two" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Move selected to Trash" }));
    await waitFor(async () => expect((await listNotebooks()).map((n) => n.title)).toEqual(["Three"]));
  });

  it("filters by folder chip", async () => {
    const user = userEvent.setup();
    const f = await createFolder("Sem 1");
    await createNotebook({ title: "Inside", folderId: f.id });
    await createNotebook({ title: "Outside" });
    render(<LibraryView />);
    await screen.findAllByText("Outside");
    await user.click(screen.getByRole("button", { name: "Sem 1" }));
    await waitFor(() => expect(screen.queryByText("Outside")).not.toBeInTheDocument());
    expect(screen.getByText("Inside")).toBeInTheDocument();
  });

  it("sorts by title", async () => {
    const user = userEvent.setup();
    await createNotebook({ title: "Bravo" });
    await createNotebook({ title: "Alpha" });
    render(<LibraryView />);
    await screen.findAllByText("Alpha");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "title");
    await waitFor(() => {
      const titles = screen.getAllByTestId("nb-title").map((e) => e.textContent);
      expect(titles).toEqual(["Alpha", "Bravo"]);
    });
  });

  it("search shows a hit from a live page title", async () => {
    const user = userEvent.setup();
    const nb = await createNotebook({ title: "Bio" });
    await insertPage(nb.id, 1, { kind: "html", title: "Mitosis visualiser", source: "<p/>", artifactType: "html", allowNetwork: false });
    render(<LibraryView />);
    await user.type(screen.getByRole("searchbox"), "mitosis");
    expect(await screen.findByText("Mitosis visualiser")).toBeInTheDocument();
  });

  it("shows LIVE count tag for notebooks with html pages", async () => {
    const nb = await createNotebook({ title: "Has live" });
    await insertPage(nb.id, 1, { kind: "html", title: "x", source: "<p/>", artifactType: "html", allowNetwork: false });
    render(<LibraryView />);
    expect(await screen.findByText("LIVE 1")).toBeInTheDocument();
  });
});

describe("searchAll", () => {
  it("matches notebook titles, text pages and html source text", async () => {
    const nb = await createNotebook({ title: "Chemistry" });
    const t = await insertPage(nb.id, 1, { kind: "text" });
    await updatePage(t.id, { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Avogadro constant" }] }] } });
    await insertPage(nb.id, 2, { kind: "html", title: "Viz", source: "<h1>Titration curve</h1>", artifactType: "html", allowNetwork: false });
    expect((await searchAll("chem")).map((h) => h.title)).toContain("Chemistry");
    expect((await searchAll("avogadro"))[0]).toMatchObject({ notebookId: nb.id, pageId: t.id });
    expect((await searchAll("titration"))[0].snippet).toMatch(/Titration curve/);
    expect(await searchAll("")).toEqual([]);
  });
});

describe("import", () => {
  it("Import with a .opennote file adds the notebook copy", async () => {
    const user = userEvent.setup();
    const port = await import("../../src/platform/port");
    const backup = await import("../../src/io/backup");
    const file = new File(["zip"], "Bio.opennote");
    const pick = vi.spyOn(port.platform, "openFile").mockResolvedValue(file);
    const imp = vi.spyOn(backup, "importBackup").mockImplementation(async () => createNotebook({ title: "Bio copy" }));
    render(<LibraryView />);
    await user.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => expect(imp).toHaveBeenCalledWith(file));
    expect(await screen.findByText("Bio copy")).toBeInTheDocument();
    expect(pick).toHaveBeenCalledWith([".opennote", ".pdf", "application/pdf"]);
    pick.mockRestore(); imp.mockRestore();
  });
});
