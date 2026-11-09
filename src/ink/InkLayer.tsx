import { useCallback, useEffect, useRef } from "react";
import { PAGE_SIZE, type Paper } from "../store/schema";
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

type Active = { id: number; kind: "stroke" | "erase"; pts: number[]; start: number; lastMove: number; pen: boolean };

export function InkLayer({ pageId, width, height, paper, inputFilter, logicalWidth = PAGE_SIZE.w }: {
  pageId: string; width: number; height: number; paper: Paper; inputFilter?: (e: PointerEvent) => boolean; logicalWidth?: number;
}) {
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

  const redrawDry = useCallback(() => {
    const ctx = setup(dry.current);
    if (!ctx) return;
    performance.mark?.("dry-start");
    ctx.clearRect(0, 0, logicalWidth, logicalH);
    const all = [...strokes.current.values()];
    for (const s of all) if (s.tool === "highlighter") paintStroke(ctx, s, paper, pathOf(s));
    for (const s of all) if (s.tool !== "highlighter") paintStroke(ctx, s, paper, pathOf(s));
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
    void (c === "undo" ? apply(op.add, op.remove) : apply(op.remove, op.add));
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
    const kind = action === "erase" || t.tool === "eraser" ? "erase" : drawTool ? "stroke" : null;
    if (!kind) return;
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

  const touchAction = tool.tool === "hand" ? "auto" : tool.penSeen ? "pan-x pan-y" : "none";
  return (
    <div ref={surface} className="ink-surface" data-testid="ink-surface" style={{ width, height, touchAction }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
      <canvas ref={dry} className="ink-canvas" style={{ width, height }} />
      <canvas ref={wet} className="ink-canvas" style={{ width, height }} />
    </div>
  );
}
