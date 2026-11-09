import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE, type PageObject, type Paper } from "../store/schema";
import { putObjects, removeObjectRows } from "./objects";
import { IDENTITY, selectWithLasso, selectionBox, xfObject, xfStroke, type Selection, type Xf } from "./selection";
import { SelectionOverlay } from "./SelectionOverlay";
import { getStrokes, putStroke, replaceStrokes } from "../store/strokes";
import { getTool, onCommand, setTool, useTool } from "../notebook/tool";
import { classifyPointer, coalesced, predicted } from "./input";
import { createHistory, type History, type Op } from "./history";
import { hitTest, snapShape, splitByEraser } from "./geometry";
import { paintStroke, strokePath } from "./render";
import type { Stroke } from "./model";
import "./ink.css";

const ERASER_RADIUS = 8;
const SNAP_HOLD_MS = 500;
const histories = new Map<string, History>();
export const historyFor = (pageId: string): History => {
  let h = histories.get(pageId);
  if (!h) { h = createHistory(); histories.set(pageId, h); }
  return h;
};

type Active = { id: number; kind: "stroke" | "erase" | "lasso"; pts: number[]; start: number; lastMove: number; pen: boolean };

export function InkLayer({ pageId, width, height, paper, inputFilter, logicalWidth = PAGE_SIZE.w, objects = [], onPreviewObjects, disabled, onCropRequest }: {
  pageId: string; width: number; height: number; paper: Paper; inputFilter?: (e: PointerEvent) => boolean; logicalWidth?: number;
  objects?: PageObject[]; onPreviewObjects?: (o: PageObject[] | null) => void; disabled?: boolean; onCropRequest?: (id: string) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [previewXf, setPreviewXf] = useState<Xf>(IDENTITY);
  const [tool] = useTool();
  const surface = useRef<HTMLDivElement>(null);
  const dry = useRef<HTMLCanvasElement>(null);
  const wet = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(new Map<string, Stroke>());
  const paths = useRef(new Map<string, Path2D>());
  const active = useRef<Active | null>(null);
  const frame = useRef(0);
  const lastEvent = useRef<PointerEvent | null>(null);
  const scale = width / logicalWidth;
  const logicalH = height / scale;

  const setup = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d", c === wet.current ? { desynchronized: true } : undefined);
    ctx?.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    return ctx;
  }, [width, height, scale]);

  const pathOf = (s: Stroke) => {
    let p = paths.current.get(s.id);
    if (!p) { p = strokePath(s); paths.current.set(s.id, p); }
    return p;
  };

  const override = useRef<{ ids: Set<string>; m: Xf } | null>(null);
  const redrawDry = useCallback(() => {
    const ctx = setup(dry.current);
    if (!ctx) return;
    performance.mark?.("dry-start");
    ctx.clearRect(0, 0, logicalWidth, logicalH);
    const ov = override.current;
    const all = [...strokes.current.values()].map((s) => (ov && ov.ids.has(s.id) ? xfStroke(s, ov.m) : s));
    const pathFor = (s: Stroke) => (ov && ov.ids.has(s.id) ? strokePath(s) : pathOf(s));
    for (const s of all) if (s.tool === "highlighter") paintStroke(ctx, s, paper, pathFor(s));
    for (const s of all) if (s.tool !== "highlighter") paintStroke(ctx, s, paper, pathFor(s));
    performance.mark?.("dry-end");
    try { performance.measure?.("dry-redraw", "dry-start", "dry-end"); } catch { /* unsupported */ }
  }, [setup, paper, logicalWidth, logicalH]);

  useEffect(() => {
    let alive = true;
    void getStrokes(pageId).then((list) => {
      if (!alive) return;
      strokes.current = new Map(list.map((s) => [s.id, s]));
      paths.current.clear();
      redrawDry();
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { redrawDry(); }, [redrawDry]);

  const apply = useCallback(async (remove: Stroke[], add: Stroke[]) => {
    for (const s of remove) { strokes.current.delete(s.id); paths.current.delete(s.id); }
    for (const s of add) strokes.current.set(s.id, s);
    redrawDry();
    await replaceStrokes(pageId, remove.map((s) => s.id), add);
  }, [pageId, redrawDry]);

  useEffect(() => onCommand((c, id) => {
    if (id !== pageId) return;
    const h = historyFor(pageId);
    const op: Op | null = c === "undo" ? h.undo() : h.redo();
    if (!op) return;
    setSelection(null);
    void (c === "undo" ? apply(op.add, op.remove) : apply(op.remove, op.add));
    if (op.objects) {
      const [target, other] = c === "undo" ? [op.objects.before, op.objects.after] : [op.objects.after, op.objects.before];
      const keep = new Set(target.map((o) => o.id));
      void removeObjectRows(other.filter((o) => !keep.has(o.id)).map((o) => o.id)).then(() => putObjects(target));
    }
  }), [pageId, apply]);

  const toLogical = (e: PointerEvent): [number, number] => {
    const r = surface.current!.getBoundingClientRect();
    const k = logicalWidth / (r.width || width);
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  };

  const currentStroke = (a: Active, extra: number[] = []): Stroke => {
    const t = getTool();
    return {
      id: crypto.randomUUID(), tool: t.tool === "highlighter" ? "highlighter" : "pen", variant: t.variant,
      color: t.color, paletteIndex: t.paletteIndex ?? undefined, width: t.width, points: new Float32Array([...a.pts, ...extra]),
    };
  };

  const paintWet = () => {
    frame.current = 0;
    const a = active.current;
    const ctx = setup(wet.current);
    if (!ctx || !a) return;
    ctx.clearRect(0, 0, logicalWidth, logicalH);
    if (a.kind === "stroke") {
      const extra: number[] = [];
      const e = lastEvent.current;
      if (e) for (const p of predicted(e)) { const [x, y] = toLogical(p); extra.push(x, y, a.pen ? p.pressure : 0.5, 0); }
      paintStroke(ctx, currentStroke(a, extra), paper);
      return;
    }
    if (a.kind === "lasso") {
      ctx.save();
      ctx.strokeStyle = "#7C5CFF";
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([8 / scale, 6 / scale]);
      ctx.beginPath();
      for (let i = 0; i < a.pts.length; i += 2) {
        if (i === 0) ctx.moveTo(a.pts[i], a.pts[i + 1]); else ctx.lineTo(a.pts[i], a.pts[i + 1]);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.strokeStyle = "rgba(154,157,171,0.6)";
    ctx.lineWidth = ERASER_RADIUS * 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < a.pts.length; i += 2) {
      if (i === 0) ctx.moveTo(a.pts[i], a.pts[i + 1]); else ctx.lineTo(a.pts[i], a.pts[i + 1]);
    }
    ctx.stroke();
    ctx.restore();
  };
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(paintWet); };

  const onDown = (ev: React.PointerEvent) => {
    const e = ev.nativeEvent;
    if (inputFilter && !inputFilter(e)) return;
    const t = getTool();
    if (e.pointerType === "pen" && !t.penSeen) setTool({ penSeen: true });
    const action = classifyPointer(e, { penSeen: t.penSeen || e.pointerType === "pen", tool: t.tool });
    if (action === "navigate") return;
    const drawTool = t.tool === "pen" || t.tool === "highlighter" || t.tool === "shape";
    const kind = action === "erase" || t.tool === "eraser" ? "erase" : drawTool ? "stroke" : t.tool === "lasso" ? "lasso" : null;
    if (!kind) return;
    if (selection) setSelection(null);
    e.preventDefault();
    surface.current?.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    const pen = e.pointerType === "pen";
    const [x, y] = toLogical(e);
    active.current = { id: e.pointerId, kind, pts: kind === "stroke" ? [x, y, pen ? e.pressure : 0.5, 0] : [x, y], start: now, lastMove: now, pen };
    lastEvent.current = e;
    schedule();
  };

  const onMove = (ev: React.PointerEvent) => {
    const a = active.current;
    const e = ev.nativeEvent;
    if (!a || a.id !== e.pointerId) return;
    const now = performance.now();
    for (const c of coalesced(e)) {
      const [x, y] = toLogical(c);
      if (a.kind === "stroke") a.pts.push(x, y, a.pen ? c.pressure : 0.5, now - a.start);
      else a.pts.push(x, y);
    }
    a.lastMove = now;
    lastEvent.current = e;
    schedule();
  };

  const eraseWith = async (a: Active) => {
    const mode = getTool().eraseMode;
    const remove: Stroke[] = [];
    const add: Stroke[] = [];
    for (const s of strokes.current.values()) {
      if (mode === "partial") {
        const parts = splitByEraser(s, a.pts, ERASER_RADIUS);
        if (parts.length === 1 && parts[0] === s) continue;
        remove.push(s);
        add.push(...parts);
        continue;
      }
      const swept = splitByEraser(s, a.pts, ERASER_RADIUS);
      const touched = !(swept.length === 1 && swept[0] === s);
      if (touched || hitTest(s, a.pts[0], a.pts[1], ERASER_RADIUS)) remove.push(s);
    }
    if (remove.length === 0) return;
    historyFor(pageId).push({ remove, add });
    await apply(remove, add);
  };

  const finish = async (ev: React.PointerEvent) => {
    const a = active.current;
    if (!a || a.id !== ev.nativeEvent.pointerId) return;
    active.current = null;
    lastEvent.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    setup(wet.current)?.clearRect(0, 0, logicalWidth, logicalH);
    if (a.kind === "erase") { await eraseWith(a); return; }
    if (a.kind === "lasso") {
      const sel = selectWithLasso(a.pts, strokes.current.values(), objects);
      setSelection(sel.strokeIds.length || sel.objectIds.length ? sel : null);
      return;
    }
    let s = currentStroke(a);
    if (getTool().tool === "shape" && performance.now() - a.lastMove >= SNAP_HOLD_MS) {
      const snapped = snapShape(s.points);
      if (snapped) s = { ...s, points: snapped.points };
    }
    strokes.current.set(s.id, s);
    const ctx = setup(dry.current);
    if (ctx) paintStroke(ctx, s, paper, pathOf(s));
    historyFor(pageId).push({ remove: [], add: [s] });
    await putStroke(pageId, s);
  };

  const selStrokes = selection ? selection.strokeIds.map((id) => strokes.current.get(id)).filter((x): x is Stroke => !!x) : [];
  const selObjects = selection ? objects.filter((o) => selection.objectIds.includes(o.id)) : [];
  const selBox = selection ? selectionBox(selStrokes, selObjects) : null;

  const preview = (m: Xf) => {
    setPreviewXf(m);
    override.current = { ids: new Set(selStrokes.map((s) => s.id)), m };
    redrawDry();
    onPreviewObjects?.(selObjects.map((o) => xfObject(o, m)));
  };

  const commit = async (m: Xf) => {
    override.current = null;
    setPreviewXf(IDENTITY);
    const nextStrokes = selStrokes.map((s) => xfStroke(s, m));
    const nextObjects = selObjects.map((o) => xfObject(o, m));
    historyFor(pageId).push({ remove: selStrokes, add: nextStrokes, objects: { before: selObjects, after: nextObjects } });
    await putObjects(nextObjects);
    onPreviewObjects?.(null);
    await apply(selStrokes, nextStrokes);
  };

  const deleteSel = async () => {
    historyFor(pageId).push({ remove: selStrokes, add: [], objects: { before: selObjects, after: [] } });
    setSelection(null);
    await removeObjectRows(selObjects.map((o) => o.id));
    await apply(selStrokes, []);
  };

  const duplicateSel = async () => {
    const off = { ...IDENTITY, dx: 24, dy: 24 };
    const sCopies = selStrokes.map((s) => ({ ...xfStroke(s, off), id: crypto.randomUUID() }));
    const oCopies = selObjects.map((o) => ({ ...xfObject(o, off), id: crypto.randomUUID() }));
    historyFor(pageId).push({ remove: [], add: sCopies, objects: { before: [], after: oCopies } });
    await putObjects(oCopies);
    await apply([], sCopies);
    setSelection({ strokeIds: sCopies.map((s) => s.id), objectIds: oCopies.map((o) => o.id) });
  };

  const recolorSel = async () => {
    const t = getTool();
    const next = selStrokes.map((s) => ({ ...s, color: t.color, paletteIndex: t.paletteIndex ?? undefined }));
    historyFor(pageId).push({ remove: selStrokes, add: next });
    await apply(selStrokes, next);
  };

  const singleImage = selObjects.length === 1 && selStrokes.length === 0 && selObjects[0].kind === "image" ? selObjects[0] : null;

  const touchAction = tool.tool === "hand" ? "auto" : tool.penSeen ? "pan-x pan-y" : "none";
  return (
    <div ref={surface} className="ink-surface" data-testid="ink-surface" data-loaded={loaded || undefined} style={{ width, height, touchAction, pointerEvents: disabled ? "none" : undefined }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
      <canvas ref={dry} className="ink-canvas" style={{ width, height }} />
      <canvas ref={wet} className="ink-canvas" style={{ width, height }} />
      {selBox && (
        <SelectionOverlay box={selBox} scale={scale} xf={previewXf} onPreview={preview} onCommit={commit}
          onDelete={deleteSel} onDuplicate={duplicateSel} onRecolor={recolorSel}
          onCrop={singleImage && onCropRequest ? () => { onCropRequest(singleImage.id); setSelection(null); } : undefined} />
      )}
    </div>
  );
}
