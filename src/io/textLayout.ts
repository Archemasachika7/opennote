export type TextStyle = "h1" | "h2" | "h3" | "p" | "code" | "quote" | "hr";
export type Line = { text: string; style: TextStyle; prefix?: string; indent: number; y: number };
type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] };

export const LINE_HEIGHT: Record<TextStyle, number> = { h1: 64, h2: 52, h3: 44, p: 40, quote: 40, code: 32, hr: 28 };
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
    switch (n.type) {
      case "heading": add((`h${Math.min(3, Number(n.attrs?.level ?? 1))}`) as TextStyle, textIn(n)); break;
      case "paragraph": add(quote ? "quote" : "p", textIn(n)); break;
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
