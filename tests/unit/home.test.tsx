import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { LibraryView } from "../../src/library/LibraryView";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); window.location.hash = "#/library"; });

it("shows the three most recently edited notebooks in a Continue row that opens them", async () => {
  const made = [];
  for (const [i, title] of ["Alpha", "Beta", "Gamma", "Delta"].entries()) {
    const nb = await createNotebook({ title });
    await db.notebooks.update(nb.id, { updatedAt: 1_000 + i });
    made.push(nb);
  }
  render(<LibraryView />);
  const row = await screen.findByRole("region", { name: /continue where you left off/i });
  await waitFor(() => expect(within(row).getAllByRole("button").map((b) => b.getAttribute("aria-label")))
    .toEqual(["Continue Delta", "Continue Gamma", "Continue Beta"]));
  fireEvent.click(within(row).getByRole("button", { name: "Continue Delta" }));
  expect(window.location.hash).toBe(`#/nb/${made[3].id}`);
});

it("hides the Continue row with fewer than two notebooks", async () => {
  await createNotebook({ title: "Solo" });
  render(<LibraryView />);
  await screen.findByText("Solo");
  expect(screen.queryByRole("region", { name: /continue where you left off/i })).toBeNull();
});

it("keeps the section filters as buttons inside a labelled sidebar", async () => {
  render(<LibraryView />);
  const side = await screen.findByRole("complementary", { name: /library sections/i });
  for (const name of ["All", "Favourites", "Whiteboards", "Study sets", "Trash"]) {
    expect(within(side).getByRole("button", { name: new RegExp(name, "i") })).toBeTruthy();
  }
});
