import "fake-indexeddb/auto";
import { render, waitFor, screen, fireEvent } from "@testing-library/react";
import { db, type TextPage as TP } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { insertPage } from "../../src/store/pages";
import { TextPage } from "../../src/text/TextPage";
import { headingsOf } from "../../src/text/outline";
import { layoutText } from "../../src/io/textLayout";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  document.elementFromPoint = () => null;
});

const t = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...content: unknown[]) => ({ type: "doc", content });

it("headingsOf lists headings in order with their level", () => {
  expect(headingsOf(doc({ type: "heading", attrs: { level: 1 }, content: [t("Intro")] }, { type: "paragraph", content: [t("x")] },
    { type: "heading", attrs: { level: 2 }, content: [t("Part A")] }))).toEqual([{ level: 1, text: "Intro", index: 0 }, { level: 2, text: "Part A", index: 1 }]);
});

it("PDF layout keeps colours, underline and bold per word, and lays tables out as rows", () => {
  const measure = (s: string) => s.length * 10;
  const pages = layoutText(doc(
    { type: "paragraph", content: [t("red", [{ type: "textStyle", attrs: { color: "#ff0000" } }]), t(" plain "), t("under", [{ type: "underline" }, { type: "bold" }])] },
    { type: "table", content: [
      { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [t("Name")] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [t("Age")] }] }] },
      { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [t("Ana")] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [t("21")] }] }] },
    ] },
  ), { width: 600, height: 1000, measure });
  const [p, h, r] = pages[0];
  expect(p.runs?.map((x) => [x.text, x.color ?? null, !!x.underline, !!x.bold])).toEqual([["red", "#ff0000", false, false], ["plain", null, false, false], ["under", null, true, true]]);
  expect(h).toMatchObject({ style: "table", cells: ["Name", "Age"], header: true });
  expect(r).toMatchObject({ style: "table", cells: ["Ana", "21"], header: false });
});

it("editor offers underline, colours, highlight and tables", async () => {
  const nb = await createNotebook({ title: "N" });
  const page = (await insertPage(nb.id, 1, { kind: "text" })) as TP;
  const { container } = render(<TextPage page={page} width={702} />);
  const editor = await waitFor(() => { const el = container.querySelector("[contenteditable=true]"); if (!el) throw new Error("no"); return el as HTMLElement; });
  fireEvent.focus(editor);
  for (const name of ["Underline", "Text colour", "Highlight", "Insert table"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Insert table" }));
  await waitFor(() => expect(container.querySelector("table")).not.toBeNull());
  expect(container.querySelectorAll("table tr").length).toBe(3);
});
