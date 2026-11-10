import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { deleteElement, listElements, onElementsChanged, type InkElement } from "./elements";
import { paintStroke } from "./render";
import type { Paper } from "../store/schema";

function ElementThumb({ elem, paper }: { elem: InkElement; paper: Paper }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = 132, h = 96;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const k = Math.min((w - 16) / Math.max(1, elem.width), (h - 16) / Math.max(1, elem.height));
    const ox = (w - elem.width * k) / 2;
    const oy = (h - elem.height * k) / 2;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(ox, oy);
    ctx.scale(k, k);
    for (const spec of elem.strokes) {
      paintStroke(ctx, {
        id: "preview",
        tool: spec.tool,
        variant: spec.variant,
        color: spec.color,
        paletteIndex: spec.paletteIndex,
        width: spec.width,
        points: new Float32Array(spec.points),
        shape: spec.shape,
      }, paper);
    }
    ctx.restore();
  }, [elem, paper]);

  return <canvas ref={ref} style={{ width: 132, height: 96, display: "block" }} />;
}

export function ElementsSheet({
  open, onClose, paper, onInsert,
}: {
  open: boolean;
  onClose: () => void;
  paper: Paper;
  onInsert: (elem: InkElement) => void;
}) {
  const [items, setItems] = useState<InkElement[]>([]);
  const [filter, setFilter] = useState<"all" | "custom" | "builtin">("all");

  useEffect(() => {
    if (!open) return;
    const load = () => void listElements().then(setItems);
    load();
    return onElementsChanged(load);
  }, [open]);

  const shown = items.filter((e) => filter === "all" || e.category === filter);

  return (
    <Sheet open={open} onClose={onClose} title="Elements & Stamps" width={580}>
      <p className="dim small" style={{ marginTop: -4, marginBottom: 12 }}>
        Stamp reusable diagrams onto any Ink page or Whiteboard. Lasso any drawing and click the Stamp button to save your own.
      </p>
      <div className="chips" style={{ marginBottom: 12 }}>
        {(["all", "custom", "builtin"] as const).map((k) => (
          <button key={k} type="button" className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
            {k === "all" ? "All" : k === "custom" ? "My Saved" : "STEM Stamps"}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="dim" style={{ padding: "24px 0", textAlign: "center" }}>
          No custom elements saved yet. Use Lasso to select any diagram on a page and click &ldquo;Save as element&rdquo;.
        </p>
      ) : (
        <div className="elem-grid">
          {shown.map((el) => (
            <div key={el.id} className="elem-card">
              <button
                type="button"
                className={`elem-btn ${paper === "light" ? "elem-light" : "elem-dark"}`}
                aria-label={`Insert ${el.name}`}
                onClick={() => { onInsert(el); onClose(); }}>
                <ElementThumb elem={el} paper={paper} />
                <span className="elem-name">{el.name}</span>
              </button>
              {el.category === "custom" && (
                <button
                  type="button"
                  className="btn ghost icon elem-del"
                  aria-label={`Delete ${el.name}`}
                  onClick={() => void deleteElement(el.id)}>
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
