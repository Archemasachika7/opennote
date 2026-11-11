import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, PAGE_SIZE, type PageObject, type Paper } from "../store/schema";
import { insertPage } from "../store/pages";
import { dropTargetAt, markDropTarget, type DropTarget } from "./dropTarget";
import { addTape, putObjects, removeObjectRows, updateObject } from "./objects";
import { IDENTITY, selectAt, selectWithLasso, selectionBox, xfObject, xfStroke, type Selection, type Xf } from "./selection";
import { SelectionOverlay } from "./SelectionOverlay";
import { shapePoints, snapLineEndpoint, type ShapeKind } from "./shapes";
import { getStrokes, putStroke, replaceStrokes } from "../store/strokes";
import { getTool, onCommand, onShapeStylePatch, onStampElement, setTool, useTool, type ShapeStylePatch } from "../notebook/tool";
import { classifyPointer, coalesced, predicted, tryCapture } from "./input";
import { countCancelled, countPen, judgeTouch, type TouchVerdict } from "./palmGate";
import { historyFor, type Op } from "./history";
import { notifyPageChanged, onPageChanged } from "./pageEvents";
import { copyToClipboard, cutToClipboard, moveSelection } from "./clipboard";
import { askPlace } from "../notebook/PlacePicker";
import { bbox, hitTest, hitsEraserPath, snapShape, splitByEraser, type Box } from "./geometry";
import { inkPalette, paintStroke, resolveColor, resolveFillColor, strokeOptions, strokePath } from "./render";
import { sliceStrokeByTime } from "./replay";
import { getRuler, rulerEdges, snapToRuler, RULER_SNAP_PX, type RulerLine } from "./ruler";
import { liveLaserPoints, paintLaser, type LaserPoint } from "./laser";
import { BASE_LAYER, getActiveLayer, layerOf, layerOrder, lockedLayers, hiddenLayers, type Layer } from "./layers";
import { intersects, type View } from "../board/viewport";
import { toast } from "../ui/Toast";
import { selectionToPng } from "./selectionImage";
import { platform } from "../platform/port";
import { isScribbleGesture, pointsToXYPath } from "./gestures";
import { instantiateElement, saveStrokesAsElement } from "./elements";
import { currentRecordingStamp, requestAudioSeek, useAudioLiveState } from "../store/audio";
import { requestRecognize } from "../ai/inkOcr";
import { tidyStrokes } from "./tidy";
import type { GeometricShapeKind, ShapeMeta, Stroke, StrokeAudioSync } from "./model";
import "./ink.css";

const ERASER_RADIUS = 8;
const SNAP_HOLD_MS = 420;
/** Tape thinner than this (a swipe) becomes a strip of TAPE_STRIP height. */
const TAPE_MIN = 24;
const TAPE_STRIP = 36;
export { historyFor };

type SnappedHold = { kind: GeometricShapeKind; points: Float32Array; x0: number; y0: number };

type Active = {
  id: number;
  kind: "stroke" | "erase" | "lasso" | "laser" | "tape";
  pts: number[];
  start: number;
  lastMove: number;
  holdAnchor: [number, number];
  pen: boolean;
  audioSync?: StrokeAudioSync;
  shape?: { kind: ShapeKind; x0: number; y0: number; x1: number; y1: number };
  snappedShape?: SnappedHold;
};

/** Normalised tape rectangle from a drag; a swipe along a line becomes a strip. */
export function tapeRect(x0: number, y0: number, x1: number, y1: number): Box {
  let x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (h < TAPE_MIN) { y = (y0 + y1) / 2 - TAPE_STRIP / 2; h = TAPE_STRIP; }
  if (w < TAPE_MIN) { x = (x0 + x1) / 2 - TAPE_STRIP / 2; w = TAPE_STRIP; }
  return { x, y, w, h };
}

const clearCanvas = (ctx: CanvasRenderingContext2D) => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
};

export function InkLayer({
  pageId, width, height, paper, inputFilter, logicalWidth = PAGE_SIZE.w, objects = [],
  onPreviewObjects, disabled, onCropRequest, layers, view, onPan, tapeEnabled, onMakeCardFromBox,
}: {
  pageId: string; width: number; height: number; paper: Paper;
  inputFilter?: (e: PointerEvent) => boolean; logicalWidth?: number;
  objects?: PageObject[]; onPreviewObjects?: (o: PageObject[] | null) => void;
  disabled?: boolean; onCropRequest?: (id: string) => void;
  /** Page layers, bottom to top (absent = one layer). */
  layers?: Layer[];
  /** Whiteboard: the visible part of an unbounded board. Without it the layer shows a fixed page. */
  view?: View;
  /** Whiteboard: pan the view by a screen-px delta (hand tool, middle mouse, touch after a pen). */
  onPan?: (dx: number, dy: number) => void;
  /** Allow the tape tool on this surface (ink pages and boards). */
  tapeEnabled?: boolean;
  /** Optional 1-click lasso -> Image Occlusion flashcard callback */
  onMakeCardFromBox?: (box: Box, strokes: Stroke[]) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [previewXf, setPreviewXf] = useState<Xf>(IDENTITY);
  const [editLine, setEditLine] = useState<{ strokeId: string; kind: "line" | "arrow"; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const lineDrag = useRef<{ end: "start" | "end"; origStroke: Stroke } | null>(null);
  const [tool] = useTool();
  const audioState = useAudioLiveState();
  const audioRef = useRef(audioState);
  audioRef.current = audioState;

  const surface = useRef<HTMLDivElement>(null);
  const dry = useRef<HTMLCanvasElement>(null);
  const wet = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(new Map<string, Stroke>());
  const paths = useRef(new Map<string, Path2D>());
  const boxes = useRef(new Map<string, Box>());
  const active = useRef<Active | null>(null);
  const lastShapeId = useRef<string | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;
  const holdTimer = useRef<number | null>(null);
  const pans = useRef(new Map<number, { x: number; y: number }>());
  const frame = useRef(0);
  const laserPts = useRef<LaserPoint[]>([]);
  const laserFrame = useRef(0);
  const lastEvent = useRef<PointerEvent | null>(null);
  const scale = view ? view.zoom : width / logicalWidth;
  const ox = view?.x ?? 0;
  const oy = view?.y ?? 0;

  const clearHoldTimer = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const layerInfo = useMemo(() => {
    const p = { layers };
    return { order: layerOrder(p), hidden: hiddenLayers(p), locked: lockedLayers(p), count: Math.max(1, layers?.length ?? 1) };
  }, [layers]);
  const editable = useCallback((x: { layerId?: string }) => !layerInfo.locked.has(layerOf(x)), [layerInfo]);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const setup = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    // No `desynchronized: true`: on some Windows GPU drivers a desynchronized canvas is composited
    // as an opaque layer, turning the whole transparent page black once it is first drawn on.
    const ctx = c.getContext("2d");
    ctx?.setTransform(dpr * scale, 0, 0, dpr * scale, -ox * dpr * scale, -oy * dpr * scale);
    return ctx;
  }, [width, height, scale, ox, oy]);

  const pathOf = (s: Stroke) => {
    if (s.shape) return undefined;
    let p = paths.current.get(s.id);
    if (!p) { p = strokePath(s); paths.current.set(s.id, p); }
    return p;
  };
  const boxOf = (s: Stroke) => {
    let b = boxes.current.get(s.id);
    if (!b) { const r = bbox(s.points); const pad = s.width * 4; b = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }; boxes.current.set(s.id, b); }
    return b;
  };

  const override = useRef<{ ids: Set<string>; m: Xf } | null>(null);
  /** Tidy preview: strokes drawn in place of the originals while the slider moves. */
  const tidyPreview = useRef<Map<string, Stroke> | null>(null);
  const redrawDry = useCallback(() => {
    const ctx = setup(dry.current);
    if (!ctx) return;
    performance.mark?.("dry-start");
    clearCanvas(ctx);
    const ov = override.current;
    const pb = audioRef.current.playback;
    const visible: Box | null = view ? { x: ox, y: oy, w: width / scale, h: height / scale } : null;
    const byLayer: Stroke[][] = Array.from({ length: layerInfo.count }, () => []);
    for (const s0 of strokes.current.values()) {
      if (layerInfo.hidden.has(layerOf(s0))) continue;
      const tp = tidyPreview.current?.get(s0.id);
      const s = tp ?? (ov && ov.ids.has(s0.id) ? xfStroke(s0, ov.m) : s0);
      if (visible && !(ov && ov.ids.has(s0.id)) && !intersects(boxOf(s0), visible)) continue;
      byLayer[Math.min(layerInfo.count - 1, layerInfo.order.get(layerOf(s0)) ?? 0)].push(s);
    }
    const pathFor = (s: Stroke) => (s.shape ? undefined : (ov && ov.ids.has(s.id)) || tidyPreview.current?.has(s.id) ? strokePath(s) : pathOf(s));
    const replayActive = Boolean(
      pb?.inkReplay && (pb.playing || (pb.currentMs > 0 && (!pb.durationMs || pb.currentMs < pb.durationMs - 60))),
    );
    const activeTips: { x: number; y: number }[] = [];
    const paintReplayAware = (s: Stroke) => {
      if (replayActive && pb && s.audioSync && s.audioSync.clipId === pb.clipId) {
        const rf = sliceStrokeByTime(s, pb.currentMs);
        if (rf.state === "future") {
          paintStroke(ctx, s, paper, pathFor(s), 0.14);
          return;
        }
        if (rf.state === "writing") {
          paintStroke(ctx, s, paper, pathFor(s), 0.14);
          if (rf.partial) paintStroke(ctx, rf.partial, paper, undefined, 1);
          if (rf.tip) activeTips.push(rf.tip);
          return;
        }
      }
      paintStroke(ctx, s, paper, pathFor(s), 1);
    };
    for (const list of byLayer) {
      for (const s of list) if (s.tool === "highlighter") paintReplayAware(s);
      for (const s of list) if (s.tool !== "highlighter") paintReplayAware(s);
    }
    if (activeTips.length > 0) {
      ctx.save();
      for (const tip of activeTips) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(245, 165, 36, 0.28)";
        ctx.arc(tip.x, tip.y, 8 / scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#F5A524";
        ctx.arc(tip.x, tip.y, 3.5 / scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    performance.mark?.("dry-end");
    try { performance.measure?.("dry-redraw", "dry-start", "dry-end"); } catch { /* unsupported */ }
  }, [setup, paper, layerInfo, view, ox, oy, width, height, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setEditLine(null);
    lastShapeId.current = null;
    void getStrokes(pageId).then((list) => {
      if (!alive) return;
      strokes.current = new Map(list.map((s) => [s.id, s]));
      paths.current.clear();
      boxes.current.clear();
      redrawDry();
      setLoaded(true);
    });
    return () => { alive = false; clearHoldTimer(); };
  }, [pageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    redrawDry();
  }, [redrawDry, audioState.playback?.currentMs, audioState.playback?.playing, audioState.playback?.inkReplay, audioState.playback?.clipId]);

  const suppressPageEvent = useRef(false);
  useEffect(() => onPageChanged((id) => {
    if (id !== pageId || suppressPageEvent.current) return;
    void getStrokes(pageId).then((list) => {
      strokes.current = new Map(list.map((s) => [s.id, s]));
      paths.current.clear();
      boxes.current.clear();
      setSelection(null);
      setEditLine(null);
      redrawDry();
    });
  }), [pageId, redrawDry]);

  const emitPeerSync = useCallback(() => {
    suppressPageEvent.current = true;
    try { notifyPageChanged(pageId); } finally { suppressPageEvent.current = false; }
  }, [pageId]);

  const apply = useCallback(async (remove: Stroke[], add: Stroke[]) => {
    for (const s of remove) { strokes.current.delete(s.id); paths.current.delete(s.id); boxes.current.delete(s.id); }
    for (const s of add) strokes.current.set(s.id, s);
    redrawDry();
    await replaceStrokes(pageId, remove.map((s) => s.id), add);
    emitPeerSync();
  }, [pageId, redrawDry, emitPeerSync]);

  useEffect(() => onCommand((c, id) => {
    if (id !== pageId) return;
    const h = historyFor(pageId);
    const op: Op | null = c === "undo" ? h.undo() : h.redo();
    if (!op) return;
    setSelection(null);
    setEditLine(null);
    void (c === "undo" ? apply(op.add, op.remove) : apply(op.remove, op.add));
    if (op.objects) {
      const [target, other] = c === "undo" ? [op.objects.before, op.objects.after] : [op.objects.after, op.objects.before];
      const keep = new Set(target.map((o) => o.id));
      const existed = new Set(other.map((o) => o.id));
      void (async () => {
        await removeObjectRows(other.filter((o) => !keep.has(o.id)).map((o) => o.id));
        await putObjects(target.filter((o) => !existed.has(o.id)));
        for (const o of target.filter((x) => existed.has(x.id))) {
          await updateObject(o.id, { x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.rotation });
        }
      })();
    }
  }), [pageId, apply]);

  // Stamp reusable elements onto the center of the visible page/board
  useEffect(() => onStampElement((target, elem) => {
    if (target !== pageId) return;
    const cx = view ? ox + width / (2 * scale) : logicalWidth / 2;
    const cy = view ? oy + height / (2 * scale) : (height / scale) / 2;
    const layerId = getActiveLayer(pageId, { layers: layersRef.current });
    const stamped = instantiateElement(elem, cx, cy, layerId !== BASE_LAYER ? layerId : undefined);
    if (!stamped.length) return;
    historyFor(pageId).push({ remove: [], add: stamped });
    void apply([], stamped);
    setTool({ tool: "lasso" });
    setSelection({ strokeIds: stamped.map((s) => s.id), objectIds: [] });
    toast(`Stamped "${elem.name}"`);
  }), [pageId, view, ox, oy, width, height, scale, logicalWidth, apply]);

  const toLogicalXY = (cx: number, cy: number): [number, number] => {
    const r = surface.current!.getBoundingClientRect();
    const k = view ? 1 / scale : logicalWidth / (r.width || width);
    return [(cx - r.left) * k + ox, (cy - r.top) * k + oy];
  };
  const toLogical = (e: { clientX: number; clientY: number }): [number, number] => toLogicalXY(e.clientX, e.clientY);

  const rulerLines = (): RulerLine[] => {
    const r = getRuler();
    if (!r) return [];
    return rulerEdges(r).map((l) => {
      const [x0, y0] = toLogicalXY(l.x0, l.y0);
      const [x1, y1] = toLogicalXY(l.x1, l.y1);
      return { x0, y0, x1, y1 };
    });
  };
  const snapAlongRuler = (pts: Float32Array): Float32Array => {
    const lines = rulerLines();
    if (lines.length === 0) return pts;
    const k = view ? 1 / scale : logicalWidth / ((surface.current?.getBoundingClientRect().width) || width);
    return snapToRuler(pts, lines, RULER_SNAP_PX * k) ?? pts;
  };

  const buildShapeMeta = (kind: GeometricShapeKind, t = getTool()): ShapeMeta => ({
    kind,
    fill: t.shapeFill,
    ...(t.shapeFillColor ? { fillColor: t.shapeFillColor } : {}),
    ...(t.shapeFillPaletteIndex !== null ? { fillPaletteIndex: t.shapeFillPaletteIndex } : {}),
    ...(t.shapeFillOpacity !== 0.42 ? { fillOpacity: t.shapeFillOpacity } : {}),
    dashed: t.shapeDashed,
  });

  const currentStroke = (a: Active, extra: number[] = []): Stroke => {
    const t = getTool();
    const layerId = getActiveLayer(pageId, { layers: layersRef.current });
    const shapeKind: GeometricShapeKind | undefined = a.shape?.kind ?? a.snappedShape?.kind;
    let points: Float32Array = a.snappedShape ? a.snappedShape.points : new Float32Array([...a.pts, ...extra]);
    if (!shapeKind && t.tool !== "shape") points = snapAlongRuler(points);
    const sync = a.audioSync ?? currentRecordingStamp();
    return {
      id: crypto.randomUUID(),
      tool: t.tool === "highlighter" ? "highlighter" : "pen",
      variant: t.variant,
      color: t.color,
      paletteIndex: t.paletteIndex ?? undefined,
      width: t.width,
      points,
      ...(layerId !== BASE_LAYER ? { layerId } : {}),
      ...(shapeKind ? { shape: buildShapeMeta(shapeKind, t) } : {}),
      ...(sync ? { audioSync: sync } : {}),
    };
  };

  const tapeColor = () => {
    const t = getTool();
    return resolveColor({ color: t.color, paletteIndex: t.paletteIndex ?? undefined }, paper);
  };

  const paintWet = () => {
    frame.current = 0;
    const a = active.current;
    const ctx = setup(wet.current);
    if (!ctx || !a) return;
    clearCanvas(ctx);
    if (a.kind === "stroke") {
      const extra: number[] = [];
      const e = lastEvent.current;
      // Never append predicted cursor coordinates onto closed/geometric shapes (avoids stray diagonal slash)
      if (e && !a.shape && !a.snappedShape) {
        for (const p of predicted(e)) {
          const [x, y] = toLogical(p);
          extra.push(x, y, a.pen ? p.pressure : 0.5, 0);
        }
      }
      paintStroke(ctx, currentStroke(a, extra), paper);
      return;
    }
    if (a.kind === "tape") {
      const r = tapeRect(a.pts[0], a.pts[1], a.pts[2] ?? a.pts[0], a.pts[3] ?? a.pts[1]);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = tapeColor();
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      return;
    }
    if (a.kind === "lasso") {
      ctx.save();
      ctx.strokeStyle = "#F5A524";
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

  // Pen hover: a stylus held just above the screen shows a ring the size of the nib (S Note style)
  const hover = useRef<{ x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);
  const paintHover = () => {
    hoverFrame.current = 0;
    if (active.current || laserPts.current.length) return;
    const ctx = setup(wet.current);
    if (!ctx) return;
    clearCanvas(ctx);
    const h = hover.current;
    if (!h) return;
    const t = getTool();
    const eraser = t.tool === "eraser";
    const r = eraser ? ERASER_RADIUS : Math.max(1, (strokeOptions({ tool: t.tool === "highlighter" ? "highlighter" : "pen", variant: t.variant, width: t.width }, true).size ?? 2) / 2);
    const col = eraser ? "#9A9DAB" : resolveColor({ color: t.color, paletteIndex: t.paletteIndex ?? undefined }, paper);
    ctx.save();
    ctx.beginPath();
    ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
    ctx.globalAlpha = t.tool === "highlighter" ? 0.25 : 0.18;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.restore();
  };
  const setHover = (p: { x: number; y: number } | null) => {
    if (!p && !hover.current) return;
    hover.current = p;
    if (!hoverFrame.current) hoverFrame.current = requestAnimationFrame(paintHover);
  };

  const armHoldSnapTimer = () => {
    clearHoldTimer();
    const a = active.current;
    if (!a || a.kind !== "stroke" || a.shape || a.snappedShape || getRuler()) return;
    const t = getTool();
    if (t.tool !== "shape" && !t.penGestures) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      const cur = active.current;
      if (!cur || cur.kind !== "stroke" || cur.shape || cur.snappedShape || getRuler()) return;
      if (cur.pts.length < 12) return;
      const snapped = snapShape(new Float32Array(cur.pts));
      if (!snapped) return;
      cur.snappedShape = { kind: snapped.kind, points: snapped.points, x0: snapped.points[0], y0: snapped.points[1] };
      paintWet();
    }, SNAP_HOLD_MS);
  };

  const laserLoop = () => {
    laserFrame.current = 0;
    const ctx = setup(wet.current);
    if (!ctx) return;
    clearCanvas(ctx);
    const now = performance.now();
    laserPts.current = liveLaserPoints(laserPts.current, now);
    paintLaser(ctx, laserPts.current, now, 1 / scale);
    if (laserPts.current.length || active.current?.kind === "laser") laserFrame.current = requestAnimationFrame(() => laserLoopRef.current());
  };
  const laserLoopRef = useRef(laserLoop);
  laserLoopRef.current = laserLoop;
  const startLaserLoop = () => { if (!laserFrame.current) laserFrame.current = requestAnimationFrame(() => laserLoopRef.current()); };
  const stopLaser = () => {
    if (laserFrame.current) { cancelAnimationFrame(laserFrame.current); laserFrame.current = 0; }
    laserPts.current = [];
  };
  useEffect(() => () => {
    if (laserFrame.current) cancelAnimationFrame(laserFrame.current);
    if (frame.current) cancelAnimationFrame(frame.current);
    if (hoverFrame.current) cancelAnimationFrame(hoverFrame.current);
    clearHoldTimer();
  }, []);

  const onDown = (ev: React.PointerEvent) => {
    const e = ev.nativeEvent;
    if (inputFilter && !inputFilter(e)) return;
    if (editLine) setEditLine(null);

    // Tap-to-Seek during Lecture Audio playback
    const pb = audioRef.current.playback;
    if (pb?.tapToSeek) {
      const [tx, ty] = toLogical(e);
      const hit = [...strokes.current.values()].reverse().find((s) => s.audioSync && hitTest(s, tx, ty, 14));
      if (hit?.audioSync) {
        e.preventDefault();
        requestAudioSeek(hit.audioSync.clipId, Math.max(0, hit.audioSync.offsetMs - 350));
        return;
      }
    }

    hover.current = null;
    const t = getTool();
    if (e.pointerType === "pen" && !t.penSeen) setTool({ penSeen: true });
    const cur = active.current;
    if (cur && !cur.pen && cur.id !== e.pointerId && (e.pointerType === "touch" || e.pointerType === "pen")) {
      // a second finger (a pinch) or the pen arrived while a finger was "writing": that finger line was a
      // pinch or a resting palm, so it goes without being saved
      discardActive();
      if (e.pointerType === "touch") return;
    }
    // palm gate: decide what a touch is before anything is drawn (pen and mouse are never a palm)
    let touchVerdict: TouchVerdict | null = null;
    if (e.pointerType === "touch") {
      touchVerdict = judgeTouch(e, { penSeen: t.penSeen });
      if (touchVerdict === "palm") return; // a resting hand: no ink, no scrolling
    } else if (e.pointerType === "pen") countPen();
    const action = touchVerdict === "write" && t.tool !== "hand" ? "draw"
      : touchVerdict === "navigate" ? "navigate"
      : classifyPointer(e, { penSeen: t.penSeen || e.pointerType === "pen", tool: t.tool });
    if (action === "navigate") {
      if (e.pointerType === "touch" || onPan) {
        pans.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (onPan) { e.preventDefault(); tryCapture(surface.current, e.pointerId); }
      }
      return;
    }
    const drawTool = t.tool === "pen" || t.tool === "highlighter" || t.tool === "shape";
    const kind: Active["kind"] | null = action === "erase" || t.tool === "eraser" ? "erase" : drawTool ? "stroke" : t.tool === "lasso" ? "lasso"
      : t.tool === "laser" ? "laser" : t.tool === "tape" && tapeEnabled ? "tape" : null;
    if (!kind) return;
    if (kind === "stroke" || kind === "tape") {
      const layerId = getActiveLayer(pageId, { layers: layersRef.current });
      if (!editable({ layerId })) { toast("This layer is locked or hidden. Pick another layer to write on."); return; }
    }
    if (selection) setSelection(null);
    if (kind !== "laser") stopLaser();
    e.preventDefault();
    tryCapture(surface.current, e.pointerId);
    const now = performance.now();
    const pen = e.pointerType === "pen";
    const [x, y] = toLogical(e);
    active.current = {
      id: e.pointerId, kind,
      pts: kind === "stroke" ? [x, y, pen ? e.pressure : 0.5, 0] : [x, y],
      start: now, lastMove: now, holdAnchor: [x, y], pen,
      audioSync: kind === "stroke" ? currentRecordingStamp() : undefined,
    };
    if (kind === "laser") {
      laserPts.current.push({ x, y, t: now, start: true });
      startLaserLoop();
      return;
    }
    if (t.tool === "shape" && t.shapeKind !== "auto") {
      active.current.shape = { kind: t.shapeKind, x0: x, y0: y, x1: x, y1: y };
    } else if (kind === "stroke") {
      armHoldSnapTimer();
    }
    lastEvent.current = e;
    schedule();
  };

  const onMove = (ev: React.PointerEvent) => {
    const a = active.current;
    const e = ev.nativeEvent;
    const pan = pans.current.get(e.pointerId);
    if (pan) {
      if (pans.current.size === 1) {
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        if (onPan) onPan(dx, dy);
        else (surface.current?.closest(".nb-scroll") as HTMLElement | null)?.scrollBy({ left: -dx, top: -dy });
      }
      pans.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (!a && e.pointerType === "pen" && e.buttons === 0) {
      const t = getTool();
      if (t.tool === "pen" || t.tool === "highlighter" || t.tool === "eraser") { const [x, y] = toLogical(e); setHover({ x, y }); }
      else setHover(null);
      return;
    }
    if (!a || a.id !== e.pointerId) return;
    const now = performance.now();
    if (a.kind === "laser") {
      for (const c of coalesced(e)) { const [x, y] = toLogical(c); laserPts.current.push({ x, y, t: now }); }
      return;
    }
    if (a.kind === "tape") {
      const [x, y] = toLogical(e);
      a.pts = [a.pts[0], a.pts[1], x, y];
      schedule();
      return;
    }
    if (a.shape) {
      [a.shape.x1, a.shape.y1] = toLogical(e);
      a.pts = Array.from(shapePoints(a.shape.kind, a.shape.x0, a.shape.y0, a.shape.x1, a.shape.y1, e.shiftKey));
      a.lastMove = now;
      schedule();
      return;
    }
    if (a.snappedShape) {
      const [x, y] = toLogical(e);
      if (Math.hypot(x - a.holdAnchor[0], y - a.holdAnchor[1]) >= 4) {
        a.snappedShape.points = shapePoints(a.snappedShape.kind, a.snappedShape.x0, a.snappedShape.y0, x, y, e.shiftKey);
        schedule();
      }
      return;
    }
    let lastX = a.holdAnchor[0], lastY = a.holdAnchor[1];
    for (const c of coalesced(e)) {
      const [x, y] = toLogical(c);
      lastX = x; lastY = y;
      if (a.kind === "stroke") a.pts.push(x, y, a.pen ? c.pressure : 0.5, now - a.start);
      else a.pts.push(x, y);
    }
    if (a.kind === "stroke") {
      // Ignore tiny stylus tilt micro-jitter (< 3.5 logical px) when measuring stillness for hold-to-snap
      if (Math.hypot(lastX - a.holdAnchor[0], lastY - a.holdAnchor[1]) >= 3.5) {
        a.lastMove = now;
        a.holdAnchor = [lastX, lastY];
        armHoldSnapTimer();
      }
    } else {
      a.lastMove = now;
    }
    lastEvent.current = e;
    schedule();
  };

  const eraseWith = async (a: Active) => {
    const mode = getTool().eraseMode;
    const remove: Stroke[] = [];
    const add: Stroke[] = [];
    for (const s of strokes.current.values()) {
      if (!editable(s)) continue;
      if (mode === "partial") {
        const parts = splitByEraser(s, a.pts, ERASER_RADIUS);
        if (parts.length === 1 && parts[0] === s) continue;
        remove.push(s);
        add.push(...parts);
        continue;
      }
      if (hitsEraserPath(s, a.pts, ERASER_RADIUS) || hitTest(s, a.pts[0], a.pts[1], ERASER_RADIUS)) {
        remove.push(s);
      }
    }
    if (remove.length === 0) return;
    historyFor(pageId).push({ remove, add });
    await apply(remove, add);
  };

  /** Drop the line being drawn without saving it (palm, pinch or a cancelled pointer). */
  const discardActive = () => {
    clearHoldTimer();
    active.current = null;
    lastEvent.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    const wctx = wet.current?.getContext("2d");
    if (wctx) clearCanvas(wctx);
  };

  /** The browser took the pointer away (it decided on a scroll, or the pen lost contact): never commit a partial line. */
  const cancel = (ev: React.PointerEvent) => {
    pans.current.delete(ev.nativeEvent.pointerId);
    const a = active.current;
    if (!a || a.id !== ev.nativeEvent.pointerId) return;
    if (a.kind === "laser") { active.current = null; return; }
    discardActive();
    countCancelled();
  };

  const finish = async (ev: React.PointerEvent) => {
    clearHoldTimer();
    if (pans.current.delete(ev.nativeEvent.pointerId)) return;
    const a = active.current;
    if (!a || a.id !== ev.nativeEvent.pointerId) return;
    active.current = null;
    lastEvent.current = null;
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    if (a.kind === "laser") return;
    const wctx = setup(wet.current);
    if (wctx) clearCanvas(wctx);
    if (a.kind === "erase") { await eraseWith(a); return; }
    if (a.kind === "lasso") {
      const list = [...strokes.current.values()].filter(editable);
      const objs = objects.filter(editable);
      const xs = a.pts.filter((_, i) => i % 2 === 0), ys = a.pts.filter((_, i) => i % 2 === 1);
      const tiny = Math.max(...xs) - Math.min(...xs) < 8 / scale && Math.max(...ys) - Math.min(...ys) < 8 / scale;
      // a tap (no loop drawn) picks what is under the pen
      const sel = tiny ? selectAt(a.pts[0], a.pts[1], list, objs, 6 / scale) : selectWithLasso(a.pts, list, objs);
      setSelection(sel && (sel.strokeIds.length || sel.objectIds.length) ? sel : null);
      return;
    }
    if (a.kind === "tape") {
      const [x1, y1] = toLogical(ev.nativeEvent);
      const r = tapeRect(a.pts[0], a.pts[1], x1, y1);
      const layerId = getActiveLayer(pageId, { layers: layersRef.current });
      await addTape(pageId, r, tapeColor(), layerId !== BASE_LAYER ? layerId : undefined,
        (o) => historyFor(pageId).push({ remove: [], add: [], objects: { before: [], after: [o] } }));
      return;
    }
    if (a.shape) {
      const sh = a.shape;
      [sh.x1, sh.y1] = toLogical(ev.nativeEvent);
      if (Math.hypot(sh.x1 - sh.x0, sh.y1 - sh.y0) < 6) {
        const hitShape = [...strokes.current.values()]
          .reverse()
          .find((st) => Boolean(st.shape) && editable(st) && hitTest(st, sh.x0, sh.y0, 10));
        if (hitShape) {
          lastShapeId.current = hitShape.id;
          setSelection({ strokeIds: [hitShape.id], objectIds: [] });
        }
        return;
      }
      a.pts = Array.from(shapePoints(sh.kind, sh.x0, sh.y0, sh.x1, sh.y1, ev.nativeEvent.shiftKey));
    }
    const t = getTool();
    let s = currentStroke(a);
    if (!a.shape && !a.snappedShape && !getRuler() && (t.tool === "shape" || t.penGestures) && performance.now() - a.lastMove >= SNAP_HOLD_MS) {
      const snapped = snapShape(s.points);
      if (snapped) {
        s = { ...s, points: snapped.points, shape: buildShapeMeta(snapped.kind, t) };
      }
    }

    // Scribble-to-Erase pen gesture over existing editable strokes
    if (!s.shape && !getRuler() && t.tool === "pen" && t.penGestures && isScribbleGesture(s.points)) {
      const scribblePath = pointsToXYPath(s.points);
      const victims = [...strokes.current.values()].filter((existing) => editable(existing) && hitsEraserPath(existing, scribblePath, ERASER_RADIUS + 2));
      if (victims.length > 0) {
        historyFor(pageId).push({ remove: victims, add: [] });
        await apply(victims, []);
        toast("Erased with scribble", { label: "Undo", run: () => sendUndoFor(pageId) });
        return;
      }
    }

    if (s.shape) lastShapeId.current = s.id;
    strokes.current.set(s.id, s);
    redrawDry();
    historyFor(pageId).push({ remove: [], add: [s] });
    await putStroke(pageId, s);
    emitPeerSync();

    if (t.tool === "shape" && (s.shape?.kind === "line" || s.shape?.kind === "arrow") && s.points.length >= 8) {
      setEditLine({ strokeId: s.id, kind: s.shape.kind, x0: s.points[0], y0: s.points[1], x1: s.points[4], y1: s.points[5] });
    }
  };

  function sendUndoFor(pid: string) {
    const h = historyFor(pid);
    const op = h.undo();
    if (op) void apply(op.add, op.remove);
  }

  const selStrokes = selection ? selection.strokeIds.map((id) => strokes.current.get(id)).filter((x): x is Stroke => !!x) : [];
  const selObjects = selection ? objects.filter((o) => selection.objectIds.includes(o.id)) : [];
  const selBox = selection ? selectionBox(selStrokes, selObjects) : null;

  /** On notebook pages, a plain drag whose middle ends up over another page (or below the last one). */
  const dropAt = (m: Xf): DropTarget | null => {
    if (view || !selBox || m.k !== 1 || m.r !== 0 || !surface.current) return null;
    const r = surface.current.getBoundingClientRect();
    const k = r.width / logicalWidth;
    return dropTargetAt(r.left + (selBox.x + selBox.w / 2 + m.dx) * k, r.top + (selBox.y + selBox.h / 2 + m.dy) * k, pageId);
  };

  const preview = (m: Xf) => {
    if (tidyPreview.current) endTidy();
    const t = dropAt(m);
    markDropTarget(t?.kind === "page" ? t.wrap : null);
    setPreviewXf(m);
    override.current = { ids: new Set(selStrokes.map((s) => s.id)), m };
    redrawDry();
    onPreviewObjects?.(selObjects.map((o) => xfObject(o, m)));
  };

  const commit = async (m: Xf) => {
    const t = dropAt(m);
    markDropTarget(null);
    override.current = null;
    setPreviewXf(IDENTITY);
    if (t && selBox) {
      onPreviewObjects?.(null);
      if (t.kind === "not-ink") { redrawDry(); toast("That page can't hold ink. Drop it on a writing page."); return; }
      // land with the selection's middle where it was dropped (on a new page: near the top)
      const half = selBox.h / 2;
      const ty = t.kind === "new" ? Math.max(half + 24, Math.min(PAGE_SIZE.h - half, t.y)) : t.y;
      const shift = { ...IDENTITY, dx: t.x - (selBox.x + selBox.w / 2), dy: ty - (selBox.y + selBox.h / 2) };
      const st = selStrokes.map((s) => xfStroke(s, shift));
      const ob = selObjects.map((o) => xfObject(o, shift));
      let to = t.kind === "page" ? t.pageId : null;
      if (t.kind === "new") {
        const nb = await db.pages.get(t.afterPageId).then((p) => (p ? db.notebooks.get(p.notebookId) : undefined));
        if (!nb) { redrawDry(); return; }
        to = (await insertPage(nb.id, nb.pageIds.indexOf(t.afterPageId) + 1, { kind: "ink", template: "blank" })).id;
      }
      setSelection(null);
      await moveSelection(pageId, to!, st, ob);
      redrawDry();
      toast(t.kind === "new" ? "Moved to a new page" : "Moved to that page");
      if (t.kind === "new") setTimeout(() => document.getElementById(`page-${to}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      return;
    }
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

  const applyShapeStylePatch = useCallback(async (targets: Stroke[], patch: ShapeStylePatch) => {
    const shapeStrokes = targets.filter((s) => Boolean(s.shape) && editable(s));
    if (!shapeStrokes.length) return;
    const { clearFillColor, ...rest } = patch;
    const next = shapeStrokes.map((s) => {
      const merged: ShapeMeta = { ...s.shape!, ...rest };
      if (clearFillColor) {
        delete merged.fillColor;
        delete merged.fillPaletteIndex;
      }
      return { ...s, shape: merged };
    });
    historyFor(pageId).push({ remove: shapeStrokes, add: next });
    await apply(shapeStrokes, next);
  }, [pageId, editable, apply]);

  // Live-update selected shape(s) or the shape just drawn when Toolbar Fill / Colour / Dashed controls are clicked
  useEffect(() => onShapeStylePatch((patch) => {
    const sel = selectionRef.current;
    if (sel?.strokeIds.length) {
      const chosen = sel.strokeIds.map((id) => strokes.current.get(id)).filter((x): x is Stroke => !!x);
      if (chosen.some((s) => s.shape)) {
        void applyShapeStylePatch(chosen, patch);
        return;
      }
    }
    if (lastShapeId.current) {
      const last = strokes.current.get(lastShapeId.current);
      if (last?.shape) void applyShapeStylePatch([last], patch);
    }
  }), [applyShapeStylePatch]);

  const toggleShapeProp = async (prop: "fill" | "dashed") => {
    const shapeStrokes = selStrokes.filter((s) => s.shape);
    if (!shapeStrokes.length) return;
    const nextVal = !shapeStrokes.every((s) => Boolean(s.shape?.[prop]));
    const t = getTool();
    await applyShapeStylePatch(shapeStrokes, {
      [prop]: nextVal,
      ...(prop === "fill" && nextVal && t.shapeFillColor ? { fillColor: t.shapeFillColor, fillPaletteIndex: t.shapeFillPaletteIndex } : {}),
    });
  };

  const singleImage = selObjects.length === 1 && selStrokes.length === 0 && selObjects[0].kind === "image" ? selObjects[0] : null;
  const copySel = () => copyToClipboard(pageId, selStrokes, selObjects);
  const cutSel = async () => { setSelection(null); await cutToClipboard(pageId, selStrokes, selObjects); };
  /** Crop by drawing around it: the lasso selection as a PNG file, or as a picture on the clipboard. */
  const saveSelectionPicture = async (how: "file" | "clipboard") => {
    if (!selBox) return;
    try {
      const png = await selectionToPng(selStrokes, selObjects, selBox, paper);
      if (how === "file") {
        await platform.saveFile(`OpenNote clip ${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.png`, png);
        toast("Picture saved");
      } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
        toast("Copied as a picture. Paste it into any app.");
      } else {
        toast("This browser can't copy pictures. Use Save as picture instead.");
      }
    } catch (e) {
      toast(`Couldn't make the picture: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const moveSel = async () => {
    const st = selStrokes, ob = selObjects;
    const to = await askPlace({ title: "Move selection to…", fromPageId: pageId, allowCurrent: false });
    if (!to || to === pageId) return;
    setSelection(null);
    await moveSelection(pageId, to, st, ob);
    toast("Moved");
    setTimeout(() => document.getElementById(`page-${to}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const [tidyStrength, setTidyStrength] = useState<number | null>(null);
  const showTidy = (k: number, list: Stroke[]) => {
    setTidyStrength(k);
    tidyPreview.current = new Map(tidyStrokes(list, k).map((s) => [s.id, s]));
    redrawDry();
  };
  const endTidy = () => { tidyPreview.current = null; setTidyStrength(null); redrawDry(); };
  const applyTidy = async () => {
    const next = [...(tidyPreview.current?.values() ?? [])];
    const before = selStrokes.filter((s) => tidyPreview.current?.has(s.id));
    tidyPreview.current = null;
    setTidyStrength(null);
    if (next.length === 0) { redrawDry(); return; }
    historyFor(pageId).push({ remove: before, add: next });
    await apply(before, next);
    toast("Handwriting tidied", { label: "Undo", run: () => sendUndoFor(pageId) });
  };
  // leaving the selection (or the page) drops an unapplied preview
  useEffect(() => { if (!selection && tidyPreview.current) endTidy(); }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selection) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea, [contenteditable=true]")) return;
      if (tidyStrength !== null) { if (e.key === "Escape") endTidy(); else if (e.key === "Enter") void applyTidy(); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copySel(); }
      else if (mod && e.key.toLowerCase() === "x") { e.preventDefault(); void cutSel(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); void deleteSel(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });

  const firstShapeStroke = selStrokes.find((s) => Boolean(s.shape));
  const hasShape = Boolean(firstShapeStroke);
  const shapeFilled = selStrokes.some((s) => Boolean(s.shape?.fill));
  const shapeDashed = selStrokes.some((s) => Boolean(s.shape?.dashed));
  const shapeFillColor = firstShapeStroke ? resolveFillColor(firstShapeStroke, paper) : undefined;
  const shapeFillOpacity = firstShapeStroke?.shape?.fillOpacity ?? 0.42;

  const touchAction = tool.tool === "hand" && !onPan ? "auto" : "none";
  const cursor = audioState.playback?.tapToSeek
    ? "pointer"
    : onPan && tool.tool === "hand" ? "grab" : tool.tool === "laser" ? "crosshair" : undefined;

  return (
    <div ref={surface} className="ink-surface" data-testid="ink-surface" data-loaded={loaded || undefined} data-ink-scale={scale}
      style={{ width, height, touchAction, cursor, pointerEvents: disabled ? "none" : undefined }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={cancel}
      onPointerLeave={(e) => { if (e.pointerType === "pen") setHover(null); }}>
      <canvas ref={dry} className="ink-canvas" style={{ width, height }} />
      <canvas ref={wet} className="ink-canvas" style={{ width, height }} />

      {/* Draggable start/end handles right after drawing a geometric Line or Arrow */}
      {editLine && tool.tool === "shape" && (["start", "end"] as const).map((end) => {
        const px = end === "start" ? editLine.x0 : editLine.x1;
        const py = end === "start" ? editLine.y0 : editLine.y1;
        return (
          <div
            key={end}
            data-testid={`line-handle-${end}`}
            className="line-endpoint-handle"
            style={{ left: (px - ox) * scale, top: (py - oy) * scale }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const orig = strokes.current.get(editLine.strokeId);
              if (!orig) return;
              tryCapture(e.currentTarget as Element, e.pointerId);
              lineDrag.current = { end, origStroke: orig };
            }}
            onPointerMove={(e) => {
              const d = lineDrag.current;
              if (!d) return;
              e.stopPropagation();
              let [nx, ny] = toLogical(e.nativeEvent);
              let x0 = editLine.x0, y0 = editLine.y0, x1 = editLine.x1, y1 = editLine.y1;
              if (d.end === "start") {
                if (e.shiftKey) [nx, ny] = snapLineEndpoint(x1, y1, nx, ny);
                x0 = nx; y0 = ny;
              } else {
                if (e.shiftKey) [nx, ny] = snapLineEndpoint(x0, y0, nx, ny);
                x1 = nx; y1 = ny;
              }
              setEditLine({ ...editLine, x0, y0, x1, y1 });
              const cur = strokes.current.get(editLine.strokeId);
              if (cur) {
                const pts = shapePoints(editLine.kind, x0, y0, x1, y1, false);
                strokes.current.set(cur.id, { ...cur, points: pts });
                boxes.current.delete(cur.id);
                redrawDry();
              }
            }}
            onPointerUp={async (e) => {
              const d = lineDrag.current;
              if (!d) return;
              e.stopPropagation();
              lineDrag.current = null;
              const updated = strokes.current.get(editLine.strokeId);
              if (!updated) return;
              historyFor(pageId).push({ remove: [d.origStroke], add: [updated] });
              await apply([d.origStroke], [updated]);
            }}
          />
        );
      })}

      {selBox && (
        <SelectionOverlay box={selBox} scale={scale} origin={{ x: ox, y: oy }} xf={previewXf}
          hasShape={hasShape} shapeFilled={shapeFilled} shapeDashed={shapeDashed}
          shapeFillColor={shapeFillColor} shapeFillOpacity={shapeFillOpacity} fillPalette={inkPalette(paper)}
          onPreview={preview} onCommit={commit}
          onDelete={deleteSel} onDuplicate={duplicateSel} onRecolor={recolorSel} onCopy={copySel} onCut={cutSel}
          onToggleFill={() => void toggleShapeProp("fill")}
          onToggleDashed={() => void toggleShapeProp("dashed")}
          onUpdateShapeStyle={(patch) => void applyShapeStylePatch(selStrokes, patch)}
          onSaveElement={selStrokes.length > 0 ? async () => {
            const saved = await saveStrokesAsElement(`Diagram ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, selStrokes);
            if (saved) toast("Saved to Elements & Stamps");
          } : undefined}
          onMakeCard={onMakeCardFromBox ? () => onMakeCardFromBox(selBox, selStrokes) : undefined}
          onToText={selStrokes.some((s) => !s.shape) ? () => requestRecognize({ kind: "text", pageId, strokes: selStrokes, box: selBox }) : undefined}
          onToMath={selStrokes.some((s) => !s.shape) ? () => requestRecognize({ kind: "math", pageId, strokes: selStrokes, box: selBox }) : undefined}
          onMoveToPage={view ? undefined : () => void moveSel()}
          onSaveImage={(how) => void saveSelectionPicture(how)}
          onTidy={selStrokes.some((s) => !s.shape && s.tool !== "highlighter") ? () => showTidy(0.7, selStrokes) : undefined}
          tidy={tidyStrength === null ? null : {
            strength: tidyStrength, onStrength: (k) => showTidy(k, selStrokes),
            onApply: () => void applyTidy(), onCancel: endTidy,
          }}
          onCrop={singleImage && onCropRequest ? () => { onCropRequest(singleImage.id); setSelection(null); } : undefined} />
      )}
    </div>
  );
}
