import "fake-indexeddb/auto";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { db, type TextPage as TP } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { insertPage, getPage } from "../../src/store/pages";
import { TextPage } from "../../src/text/TextPage";
import { textOf } from "../../src/text/textOf";
import { searchAll } from "../../src/store/search";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  document.elementFromPoint = () => null;
});

async function mk(): Promise<TP> {
  const nb = await createNotebook({ title: "Notes" });
  return (await insertPage(nb.id, 1, { kind: "text" })) as TP;
}

it("markdown shortcut makes a heading and the doc persists", async () => {
  const user = userEvent.setup();
  const page = await mk();
  const { container } = render(<TextPage page={page} width={702} />);
  const editor = await waitFor(() => {
    const el = container.querySelector("[contenteditable=true]");
    if (!el) throw new Error("no editor");
    return el as HTMLElement;
  });
  await user.click(editor);
  await user.type(editor, "# Hi");
  await waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Hi"));
  await waitFor(async () => expect(textOf(((await getPage(page.id)) as TP).doc)).toBe("Hi"), { timeout: 3000 });
  expect((await searchAll("hi")).some((h) => h.pageId === page.id)).toBe(true);
});

it("textOf separates blocks with newlines", () => {
  const doc = { type: "doc", content: [
    { type: "heading", content: [{ type: "text", text: "Title" }] },
    { type: "paragraph", content: [{ type: "text", text: "Body " }, { type: "text", text: "text" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
  ] };
  expect(textOf(doc)).toBe("Title\nBody text\none");
});
