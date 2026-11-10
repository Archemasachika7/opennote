import { useEffect, useRef } from "react";
import { PAGE_SIZE, type Paper } from "../store/schema";
import { Sheet } from "../ui/Sheet";
import { ALL_TEMPLATES, drawPaperTemplate, type StemTemplate } from "../store/templates";

function TemplateThumb({ tpl, paper }: { tpl: StemTemplate; paper: Paper }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = 112, h = 148;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale((w * dpr) / PAGE_SIZE.w, (h * dpr) / PAGE_SIZE.h);
    ctx.fillStyle = paper === "light" ? "#F7F6F2" : "#111318";
    ctx.fillRect(0, 0, PAGE_SIZE.w, PAGE_SIZE.h);
    drawPaperTemplate(ctx, tpl, PAGE_SIZE.w, PAGE_SIZE.h, paper);
    ctx.restore();
  }, [tpl, paper]);

  return <canvas ref={ref} style={{ width: 112, height: 148, borderRadius: 6, display: "block" }} />;
}

export function TemplatesSheet({
  open, onClose, current, paper, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  current: StemTemplate;
  paper: Paper;
  onSelect: (tpl: StemTemplate) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Paper & STEM Templates" width={600}>
      <p className="dim small" style={{ marginTop: -4, marginBottom: 14 }}>
        Choose a paper background for this Ink page. STEM templates export cleanly to PDF and JPG.
      </p>
      <div className="elem-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))" }}>
        {ALL_TEMPLATES.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className="elem-btn"
              aria-pressed={active}
              aria-label={`Template ${t.label}`}
              style={active ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
              onClick={() => { onSelect(t.id); onClose(); }}>
              <TemplateThumb tpl={t.id} paper={paper} />
              <span className="elem-name">{t.label}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
