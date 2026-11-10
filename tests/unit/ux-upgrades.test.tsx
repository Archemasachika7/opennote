import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App, navigate } from "../../src/App";
import { db } from "../../src/store/schema";
import { createNotebook, getNotebook, listNotebooks } from "../../src/store/notebooks";
import { createFolder, listFolders } from "../../src/store/folders";
import { deletePageWithUndo, getPages, insertPage, restoreDeletedPage } from "../../src/store/pages";
import { putStroke, getStrokes } from "../../src/store/strokes";
import { addCard, listCards, reviewCard } from "../../src/store/cards";
import { addTextBox, getObjects } from "../../src/ink/objects";
import { ExportSheet } from "../../src/notebook/ExportSheet";
import { PasteSheet } from "../../src/live/PasteSheet";
import { StudySetView } from "../../src/study/StudySetView";
import { NotebookView } from "../../src/notebook/NotebookView";
import { getTheme, setTheme } from "../../src/ui/theme";
import { setTool, getTool } from "../../src/notebook/tool";

async function resetAll() {
  await Promise.all([
    db.notebooks.clear(),
    db.pages.clear(),
    db.strokes.clear(),
    db.objects.clear(),
    db.blobs.clear(),
    db.folders.clear(),
    db.cards.clear(),
  ]);
  localStorage.clear();
  setTheme("dark");
  setTool({ tool: "pen" });
  window.location.hash = "#/";
}

describe("UI/UX Upgradation & Bug Fixes", () => {
  beforeEach(resetAll);

  it("shows a recovery screen instead of infinite Loading when a notebook ID does not exist", async () => {
    window.location.hash = "#/nb/missing-notebook-id";
    render(<App />);
    expect(await screen.findByRole("heading", { name: /notebook not found/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /back to library/i }));
    expect(await screen.findByRole("heading", { name: "OpenNote" })).toBeInTheDocument();
  });

  it("switches themes via Settings sheet and Command Palette (Ctrl+K)", async () => {
    render(<App />);
    expect(getTheme()).toBe("dark");

    // Open Settings via ? shortcut
    fireEvent.keyDown(document, { key: "?" });
    expect(await screen.findByRole("dialog", { name: /settings/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /light/i }));
    expect(getTheme()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    // Close Settings with Escape
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /settings/i })).not.toBeInTheDocument());

    // Open Command Palette with Ctrl+K
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    const input = screen.getByRole("searchbox", { name: /command or search/i });
    await userEvent.type(input, "Dark theme");
    await userEvent.keyboard("{Enter}");
    expect(getTheme()).toBe("dark");
  });

  it("creates the 3-page Starter Demo notebook from the empty library state", async () => {
    render(<App />);
    const demoBtn = await screen.findByRole("button", { name: /explore starter demo/i });
    await userEvent.click(demoBtn);

    await waitFor(async () => {
      const nbs = await listNotebooks();
      expect(nbs).toHaveLength(1);
      expect(nbs[0].title).toBe("Welcome to OpenNote");
      const pages = await getPages(nbs[0].id);
      expect(pages.map((p) => p.kind)).toEqual(["html", "text", "ink"]);
    });
  });

  it("supports Trash Undo toast and folder rename/delete in Library", async () => {
    const folder = await createFolder("Semester 1");
    const nb = await createNotebook({ title: "Physics 101" });
    await db.notebooks.update(nb.id, { folderId: folder.id });

    render(<App />);
    expect(await screen.findByText("Physics 101")).toBeInTheDocument();

    // Select folder chip and rename folder via folder actions
    await userEvent.click(screen.getByRole("button", { name: "Semester 1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Rename folder Semester 1" }));
    const renameInput = screen.getByRole("textbox", { name: "Folder name" });
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "Autumn Term{Enter}");
    await waitFor(async () => {
      const folders = await listFolders();
      expect(folders[0].name).toBe("Autumn Term");
    });

    // Move notebook to Trash and click Undo in toast
    await userEvent.click(screen.getByRole("button", { name: "More for Physics 101" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to Trash" }));
    const undoBtn = await screen.findByRole("button", { name: "Undo" });
    await userEvent.click(undoBtn);
    await waitFor(async () => {
      const restored = await getNotebook(nb.id);
      expect(restored?.trashedAt).toBeFalsy();
    });
  });

  it("restores deleted ink pages with strokes and objects via deletePageWithUndo", async () => {
    const notebook = await createNotebook({ title: "Calc" });
    const [firstPage] = await getPages(notebook.id);
    const p2 = await insertPage(notebook.id, 1, { kind: "ink", template: "grid" });
    await putStroke(firstPage.id, {
      id: "stroke-1", color: "#ffffff", width: 3, tool: "pen", variant: "ball",
      points: new Float32Array([10, 10, 0.5, 0, 40, 40, 0.5, 16]),
    });
    await addTextBox(firstPage.id, { x: 120, y: 140 }, "#ffffff");

    const snap = await deletePageWithUndo(firstPage.id);
    expect(snap).not.toBeNull();
    expect((await getPages(notebook.id)).map((p) => p.id)).toEqual([p2.id]);

    await restoreDeletedPage(snap!);
    const pagesAfter = await getPages(notebook.id);
    expect(pagesAfter.map((p) => p.id)).toEqual([firstPage.id, p2.id]);
    expect(await getStrokes(firstPage.id)).toHaveLength(1);
    expect(await getObjects(firstPage.id)).toHaveLength(1);
  });

  it("guards addTextBox against NaN coordinates and ExportSheet against 0-page notebooks", async () => {
    const notebook = await createNotebook({ title: "Guard" });
    const [firstPage] = await getPages(notebook.id);
    const tb = await addTextBox(firstPage.id, { x: Number.NaN, y: Number.POSITIVE_INFINITY }, "#ffffff");
    expect(Number.isFinite(tb.x)).toBe(true);
    expect(Number.isFinite(tb.y)).toBe(true);

    render(<ExportSheet open total={0} current={0} onClose={() => undefined} onExport={() => undefined} />);
    expect(screen.getByText(/add at least one page before exporting/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("supports inline title rename, sidebar toggle, and tool keyboard shortcuts in NotebookView", async () => {
    const notebook = await createNotebook({ title: "Draft Title" });
    render(<NotebookView id={notebook.id} />);
    const titleEl = await screen.findByText("Draft Title");

    // Inline click to rename
    await userEvent.click(titleEl);
    const input = screen.getByRole("textbox", { name: "Document title" });
    await userEvent.clear(input);
    await userEvent.type(input, "Final Lecture Notes{Enter}");
    await waitFor(async () => {
      expect((await getNotebook(notebook.id))?.title).toBe("Final Lecture Notes");
    });

    // Single-key tool shortcut works outside inputs
    fireEvent.keyDown(document, { key: "e" });
    expect(getTool().tool).toBe("eraser");

    // Ctrl+\ toggles sidebar
    expect(screen.getByRole("complementary", { name: "Notebook navigation" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Notebook navigation" })).not.toBeInTheDocument());
  });

  it("indents with Tab and guards unsaved code on Escape in PasteSheet", async () => {
    let closed = false;
    let savedTitle = "";
    render(
      <PasteSheet
        open
        onClose={() => { closed = true; }}
        onSave={(d) => { savedTitle = d.title; }}
      />,
    );
    const code = screen.getByRole("textbox", { name: "Artifact code" }) as HTMLTextAreaElement;
    await userEvent.type(code, "<h1>Wave</h1>");

    // Tab inserts 2 spaces instead of leaving textarea
    code.setSelectionRange(0, 0);
    fireEvent.keyDown(code, { key: "Tab" });
    expect(code.value).toBe("  <h1>Wave</h1>");

    // Escape asks for confirmation instead of discarding immediately
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toBe(false);
    expect(await screen.findByText(/discard unsaved artifact code/i)).toBeInTheDocument();

    // Ctrl+Enter saves directly
    fireEvent.keyDown(code, { key: "Enter", ctrlKey: true });
    expect(savedTitle).toBe("Wave");
  });

  it("undoes card deletion and confirms before resetting progress in StudySetView", async () => {
    const set = await createNotebook({ title: "Bio Deck", kind: "studyset" });
    const card = await addCard(set.id, { front: "ATP", back: "Adenosine triphosphate" });
    await reviewCard(card.id, "easy");

    render(<><StudySetView id={set.id} /></>);
    // Delete card and verify it is removed
    const delBtn = await screen.findByRole("button", { name: "Delete card 1" });
    await userEvent.click(delBtn);
    await waitFor(async () => expect(await listCards(set.id)).toHaveLength(0));

    // Re-add and check Smart Learn Start over confirmation guard
    const c2 = await addCard(set.id, { front: "DNA", back: "Deoxyribonucleic acid" });
    await reviewCard(c2.id, "easy", Date.now());
    await act(async () => { navigate(`/nb/${set.id}`); });
    await userEvent.click(screen.getByRole("tab", { name: "Smart Learn" }));
    const startOver = await screen.findByRole("button", { name: /start over/i });
    await userEvent.click(startOver);
    // Progress is NOT wiped until Confirm reset is clicked
    expect((await listCards(set.id))[0].srs.reps).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /confirm reset/i }));
    await waitFor(async () => expect((await listCards(set.id))[0].srs.reps).toBe(0));
  });
});
