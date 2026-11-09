type Node = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Node[] };
const textIn = (n: Node): string => (typeof n.text === "string" ? n.text : (n.content ?? []).map(textIn).join(""));

/** Headings of a TipTap doc in order: used for the Outline sidebar. `index` is the heading's position among headings. */
export function headingsOf(doc: unknown): { level: number; text: string; index: number }[] {
  const out: { level: number; text: string; index: number }[] = [];
  const walk = (n: Node) => {
    if (n.type === "heading") out.push({ level: Number(n.attrs?.level ?? 1), text: textIn(n).trim(), index: out.length });
    else n.content?.forEach(walk);
  };
  if (doc && typeof doc === "object") walk(doc as Node);
  return out.filter((h) => h.text);
}
