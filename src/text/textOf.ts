type Node = { type?: string; text?: string; content?: Node[] };
const BLOCKS = new Set(["paragraph", "heading", "codeBlock", "blockquote", "listItem", "taskItem", "horizontalRule"]);

/** Plain text of a ProseMirror/TipTap JSON doc; blocks separated by newlines. */
export function textOf(doc: unknown): string {
  const out: string[] = [];
  let line = "";
  const walk = (n: Node) => {
    if (typeof n.text === "string") line += n.text;
    n.content?.forEach(walk);
    if (n.type && BLOCKS.has(n.type) && line) { out.push(line); line = ""; }
  };
  if (doc && typeof doc === "object") walk(doc as Node);
  if (line) out.push(line);
  return out.join("\n");
}
