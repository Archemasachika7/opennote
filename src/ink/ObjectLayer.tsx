import { useEffect, useRef, useState } from "react";
import type { PageObject } from "../store/schema";
import { updateObject, addTextBox } from "./objects";
import { BASE_LAYER } from "./layers";
import { toast } from "../ui/Toast";
import { useBlobUrl } from "../ui/useBlobUrl";
import { tryCapture } from "./input";


type Crop = { x: number; y: number; w: number; h: number };
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

const ZERO = { x: 0, y: 0 };

function ImageObj({ o, scale, cropping, onCrop, origin }: { o: PageObject; scale: number; cropping: boolean; onCrop: (on: boolean) => void; origin: { x: number; y: number } }) {
  const url = useBlobUrl(o.blobId);
  const [draft, setDraft] = useState<PageObject | null>(null);
  const drag = useRef<{ edge: string; x: number; y: number; start: PageObject } | null>(null);
  const v = draft ?? o;
  const c = v.crop ?? FULL;
  const imgW = v.w / c.w;
  const imgH = v.h / c.h;

  const down = (edge: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    tryCapture(e.target as Element, e.pointerId);
    drag.current = { edge, x: e.clientX, y: e.clientY, start: o };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    const s = d.start;
    const sc = s.crop ?? FULL;
    const fullW = s.w / sc.w;
    const fullH = s.h / sc.h;
    let { x, y, w, h } = s;
    let crop = { ...sc };
    if (d.edge === "e") { w = Math.max(20, Math.min(s.w + dx, fullW * (1 - sc.x))); crop.w = w / fullW; }
    if (d.edge === "s") { h = Math.max(20, Math.min(s.h + dy, fullH * (1 - sc.y))); crop.h = h / fullH; }
    if (d.edge === "w") {
      const nx = Math.max(-sc.x * fullW, Math.min(dx, s.w - 20));
      x = s.x + nx; w = s.w - nx; crop = { ...crop, x: sc.x + nx / fullW, w: w / fullW };
    }
    if (d.edge === "n") {
      const ny = Math.max(-sc.y * fullH, Math.min(dy, s.h - 20));
      y = s.y + ny; h = s.h - ny; crop = { ...crop, y: sc.y + ny / fullH, h: h / fullH };
    }
    setDraft({ ...s, x, y, w, h, crop });
  };
  const up = async () => {
    const d = draft;
    drag.current = null;
    if (d) await updateObject(o.id, { x: d.x, y: d.y, w: d.w, h: d.h, crop: d.crop });
    setDraft(null);
  };

  return (
    <div className={`obj obj-image ${cropping ? "cropping" : ""}`} data-testid={`obj-${o.id}`} onDoubleClick={() => onCrop(!cropping)}
      style={{ left: (v.x - origin.x) * scale, top: (v.y - origin.y) * scale, width: v.w * scale, height: v.h * scale, transform: `rotate(${v.rotation}deg)` }}>
      <div className="obj-clip">
        {url && <img src={url} alt="" draggable={false}
          style={{ width: imgW * scale, height: imgH * scale, left: -c.x * imgW * scale, top: -c.y * imgH * scale }} />}
      </div>
      {cropping && ["n", "e", "s", "w"].map((edge) => (
        <span key={edge} className={`crop-h crop-${edge}`} data-testid={`crop-${edge}`}
          onPointerDown={down(edge)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      ))}
    </div>
  );
}

function TextObj({ o, scale, color, active, origin }: { o: PageObject; scale: number; color: string; active: boolean; origin: { x: number; y: number } }) {
  const [text, setText] = useState(o.text ?? "");
  const el = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (document.activeElement !== el.current) setText(o.text ?? ""); }, [o.text]);
  return (
    <textarea ref={el} className="obj obj-text" aria-label="Text box" value={text} data-testid={`obj-${o.id}`}
      autoFocus={active && !o.text}
      onChange={(e) => { setText(e.target.value); void updateObject(o.id, { text: e.target.value }); }}
      style={{ left: (o.x - origin.x) * scale, top: (o.y - origin.y) * scale, width: o.w * scale, minHeight: o.h * scale, fontSize: 28 * scale, color,
        transform: `rotate(${o.rotation}deg)`, pointerEvents: active ? "auto" : "none" }} />
  );
}

export function ObjectLayer({ pageId, objects, scale, tool, textColor, cropping, setCropping, origin = ZERO, hidden, layerId, locked }: {
  pageId: string; objects: PageObject[]; scale: number; tool: string; textColor: string;
  cropping: string | null; setCropping: (id: string | null) => void;
  /** logical point at the layer's top-left (boards scroll; pages stay at 0,0) */
  origin?: { x: number; y: number };
  /** layer ids whose objects are not shown */
  hidden?: Set<string>;
  /** layer that new text boxes go on */
  layerId?: string;
  /** layers that cannot be edited (locked or hidden) */
  locked?: Set<string>;
}) {
  const onDown = async (e: React.PointerEvent) => {
    if (tool !== "text" || e.target !== e.currentTarget) return;
    if (locked?.has(layerId ?? BASE_LAYER)) { toast("This layer is locked or hidden. Pick another layer to write on."); return; }
    const r = e.currentTarget.getBoundingClientRect();
    await addTextBox(pageId, { x: (e.clientX - r.left) / scale + origin.x, y: (e.clientY - r.top) / scale + origin.y }, layerId);
  };
  // tape is drawn above the ink by TapeLayer
  const shown = objects.filter((o) => o.kind !== "tape" && !hidden?.has(o.layerId ?? BASE_LAYER));
  return (
    <div className="object-layer" data-testid="object-layer" onPointerDown={onDown}
      style={{ pointerEvents: tool === "text" || cropping ? "auto" : "none" }}>
      {shown.map((o) => o.kind === "image"
        ? <ImageObj key={o.id} o={o} origin={origin} scale={scale} cropping={cropping === o.id} onCrop={(on) => setCropping(on ? o.id : null)} />
        : <TextObj key={o.id} o={o} origin={origin} scale={scale} color={textColor} active={tool === "text" && !locked?.has(o.layerId ?? BASE_LAYER)} />)}
    </div>
  );
}
