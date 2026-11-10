import "fake-indexeddb/auto";
import { render, fireEvent, waitFor, screen, act } from "@testing-library/react";
import { db, type InkPage } from "../../src/store/schema";
import { createNotebook, getNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { addCard, listCards } from "../../src/store/cards";
import { App } from "../../src/App";
import { LibraryView } from "../../src/library/LibraryView";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  window.location.hash = "";
});

it("opens a whiteboard in the whiteboard view and a study set in the study view", async () => {
  const wb = await createNotebook({ title: "Plan", kind: "whiteboard" });
  const ss = await createNotebook({ title: "Bio", kind: "studyset" });
  render(<App />);
  act(() => { window.location.hash = `#/nb/${wb.id}`; });
  expect(await screen.findByTestId("whiteboard")).toBeInTheDocument();
  act(() => { window.location.hash = `#/nb/${ss.id}`; });
  expect(await screen.findByTestId("study-set")).toBeInTheDocument();
});

describe("whiteboard", () => {
  it("adds, renames and lists boards; shows the minimap", async () => {
    const wb = await createNotebook({ title: "Plan", kind: "whiteboard" });
    render(<App />);
    act(() => { window.location.hash = `#/nb/${wb.id}`; });
    expect(await screen.findByTestId("minimap")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add board" }));
    await waitFor(async () => expect(await getPages(wb.id)).toHaveLength(2));
    expect(await screen.findByRole("button", { name: "Board 2" })).toBeInTheDocument();
    fireEvent.doubleClick(screen.getByRole("button", { name: "Board 1" }));
    const input = screen.getByRole("textbox", { name: "Board name" });
    fireEvent.change(input, { target: { value: "Ideas" } });
    fireEvent.blur(input);
    await waitFor(async () => expect(((await getPages(wb.id))[0] as InkPage).title).toBe("Ideas"));
  });

  it("Ctrl+wheel zooms the board", async () => {
    const wb = await createNotebook({ title: "Plan", kind: "whiteboard" });
    render(<App />);
    act(() => { window.location.hash = `#/nb/${wb.id}`; });
    const stage = await screen.findByTestId("board-stage");
    expect(screen.getByText("100%")).toBeInTheDocument();
    fireEvent.wheel(stage, { deltaY: -100, ctrlKey: true, clientX: 100, clientY: 100 });
    await waitFor(() => expect(screen.queryByText("100%")).toBeNull());
  });

  it("changes the board background pattern", async () => {
    const wb = await createNotebook({ title: "Plan", kind: "whiteboard" });
    render(<App />);
    act(() => { window.location.hash = `#/nb/${wb.id}`; });
    fireEvent.change(await screen.findByRole("combobox", { name: "Background pattern" }), { target: { value: "grid" } });
    await waitFor(async () => expect(((await getPages(wb.id))[0] as InkPage).template).toBe("grid"));
  });
});

describe("study set", () => {
  async function open() {
    const ss = await createNotebook({ title: "Bio", kind: "studyset" });
    render(<App />);
    act(() => { window.location.hash = `#/nb/${ss.id}`; });
    await screen.findByTestId("study-set");
    return ss;
  }

  it("adds a card and saves its question and answer", async () => {
    const ss = await open();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    const q = await screen.findByRole("textbox", { name: "Question 1" });
    fireEvent.change(q, { target: { value: "What is ATP?" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Answer 1" }), { target: { value: "Energy currency" } });
    await waitFor(async () => expect((await listCards(ss.id)).map((c) => [c.front, c.back])).toEqual([["What is ATP?", "Energy currency"]]));
  });

  it("practice shows the question, then the answer when flipped", async () => {
    const ss = await createNotebook({ title: "Bio", kind: "studyset" });
    await addCard(ss.id, { front: "2+2?", back: "4" });
    render(<App />);
    act(() => { window.location.hash = `#/nb/${ss.id}`; });
    await screen.findByTestId("study-set");
    fireEvent.click(screen.getByRole("tab", { name: "Practice" }));
    expect(await screen.findByText("2+2?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Flip card" }));
    expect(await screen.findByText("4")).toBeInTheDocument();
  });

  it("Smart Learn: show answer, rate Good, then all caught up", async () => {
    const ss = await createNotebook({ title: "Bio", kind: "studyset" });
    await addCard(ss.id, { front: "Capital of France?", back: "Paris" });
    render(<App />);
    act(() => { window.location.hash = `#/nb/${ss.id}`; });
    await screen.findByTestId("study-set");
    fireEvent.click(screen.getByRole("tab", { name: "Smart Learn" }));
    expect(await screen.findByText("Capital of France?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Good/ }));
    expect(await screen.findByText(/All caught up/)).toBeInTheDocument();
    const [c] = await listCards(ss.id);
    expect(c.srs.state).toBe("review");
  });
});

it("library can create a study set and a whiteboard", async () => {
  render(<LibraryView />);
  fireEvent.click(screen.getByRole("button", { name: "More new items" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "New study set" }));
  await waitFor(() => expect(window.location.hash).toMatch(/^#\/nb\//));
  const id = decodeURIComponent(window.location.hash.slice("#/nb/".length));
  expect((await getNotebook(id))?.kind).toBe("studyset");
  window.location.hash = "";
  fireEvent.click(screen.getByRole("button", { name: "More new items" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "New whiteboard" }));
  await waitFor(async () => expect((await db.notebooks.toArray()).some((n) => n.kind === "whiteboard")).toBe(true));
});
