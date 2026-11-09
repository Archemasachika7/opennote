export type TextStyle = "h1" | "h2" | "h3" | "p" | "code" | "quote" | "hr" | "table";
/** A word with its formatting (spaces between runs are implied). */
export type Run = { text: string; color?: string; highlight?: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
export type Line = { text: string; style: TextStyle; prefix?: string; indent: number; y: number; runs?: Run[]; cells?: string[]; header?: boolean };
type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: Mark[] };

export const LINE_HEIGHT: Record<TextStyle, number> = { h1: 64, h2: 52, h3: 44, p: 40, quote: 40, code: 32, hr: 28, table: 46 };

function runsOf(n: Node): Run[] {
  const out: Run[] = [];
  const walk = (x: Node) => {
    if (typeof x.text === "string") {
      const style: Omit<Run, "text"> = {};
      for (const m of x.marks ?? []) {
        if (m.type === "bold") style.bold = true;
        if (m.type === "italic") style.italic = true;
        if (m.type === "underline") style.underline = true;
        if (m.type === "strike") style.strike = true;
        if (m.type === "textStyle" && typeof m.attrs?.color === "string") style.color = m.attrs.color as string;
        if (m.type === "highlight") style.highlight = typeof m.attrs?.color === "string" ? (m.attrs.color as string) : "#F2C94C";
      }
      for (const w of x.text.split(/\s+/).filter(Boolean)) out.push({ text: w, ...style });
    }
    x.content?.forEach(walk);
  };
  walk(n);
  return out;
}

function wrapRuns(runs: Run[], width: number, measure: (s: string, style: TextStyle) => number, style: TextStyle): Run[][] {
  const lines: Run[][] = [[]];
  let text = "";
  for (const r of runs) {
    const next = text ? text + " " + r.text : r.text;
    if (text && measure(next, style) > width) { lines.push([r]); text = r.text; } else { lines[lines.length - 1].push(r); text = next; }
  }
  return lines;
}
const INDENT = 44;

const textIn = (n: Node): string => (typeof n.text === "string" ? n.text : (n.content ?? []).map(textIn).join(""));

function wrap(text: string, width: number, measure: (s: string, style: TextStyle) => number, style: TextStyle): string[] {
  if (style === "code") return text.split("\n");
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, style) > width) { out.push(line); line = word; } else line = next;
  }
  if (line || out.length === 0) out.push(line);
  return out;
}

/** Lay a TipTap/ProseMirror doc out into pages of lines (pure; measuring is injected). */
export function layoutText(doc: unknown, opts: { width: number; height: number; measure: (s: string, style: TextStyle) => number }): Line[][] {
  const flat: Omit<Line, "y">[] = [];
  const block = (n: Node, indent: number, prefix?: string, quote = false) => {
    const add = (style: TextStyle, text: string) => {
      wrap(text, opts.width - indent, opts.measure, style).forEach((t, i) => flat.push({ text: t, style, indent, prefix: i === 0 ? prefix : undefined }));
    };
    const addRich = (style: TextStyle) => {
      const runs = runsOf(n);
      if (runs.length === 0) { flat.push({ text: "", style, indent, prefix }); return; }
      wrapRuns(runs, opts.width - indent, opts.measure, style).forEach((line, i) =>
        flat.push({ text: line.map((r) => r.text).join(" "), runs: line, style, indent, prefix: i === 0 ? prefix : undefined }));
    };
    switch (n.type) {
      case "heading": addRich((`h${Math.min(3, Number(n.attrs?.level ?? 1))}`) as TextStyle); break;
      case "paragraph": addRich(quote ? "quote" : "p"); break;
      case "table":
        (n.content ?? []).forEach((row) => {
          const cells = (row.content ?? []).map((c) => textIn(c));
          const header = (row.content ?? []).some((c) => c.type === "tableHeader");
          flat.push({ text: cells.join(" | "), style: "table", cells, header, indent });
        });
        break;
      case "codeBlock": add("code", textIn(n)); break;
      case "horizontalRule": flat.push({ text: "", style: "hr", indent }); break;
      case "blockquote": (n.content ?? []).forEach((c) => block(c, indent + 20, undefined, true)); break;
      case "bulletList":
      case "orderedList":
      case "taskList":
        (n.content ?? []).forEach((item, i) => {
          const mark = n.type === "bulletList" ? "•" : n.type === "orderedList" ? `${i + 1}.` : item.attrs?.checked ? "[x]" : "[ ]";
          (item.content ?? []).forEach((c, j) => block(c, indent + INDENT, j === 0 ? mark : undefined, quote));
        });
        break;
      default: (n.content ?? []).forEach((c) => block(c, indent, prefix, quote));
    }
  };
  if (doc && typeof doc === "object") block(doc as Node, 0);
  const pages: Line[][] = [[]];
  let y = 0;
  for (const l of flat) {
    const h = LINE_HEIGHT[l.style];
    if (y + h > opts.height && pages[pages.length - 1].length > 0) { pages.push([]); y = 0; }
    pages[pages.length - 1].push({ ...l, y });
    y += h;
  }
  return pages;
}
