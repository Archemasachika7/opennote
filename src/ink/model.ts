export type StrokeTool = "pen" | "highlighter";
export type PenVariant = "ball" | "fountain" | "brush";
export type GeometricShapeKind = "line" | "arrow" | "rect" | "roundrect" | "ellipse" | "triangle" | "diamond" | "star";

export interface ShapeMeta {
  kind: GeometricShapeKind;
  fill?: boolean;
  dashed?: boolean;
}

export interface StrokeAudioSync {
  clipId: string;
  offsetMs: number;
}

/** points: Float32Array, stride 4 — x, y, pressure, t (ms since stroke start). */
export interface Stroke {
  id: string;
  tool: StrokeTool;
  variant: PenVariant;
  color: string;
  /** Index into inkPalette(paper) when picked from the palette; swaps with paper. */
  paletteIndex?: number;
  width: number;
  points: Float32Array;
  /** Layer this stroke is on (absent = the base layer). */
  layerId?: string;
  /** Present when this stroke is a crisp geometric shape rather than freehand ink. */
  shape?: ShapeMeta;
  /** Optional lecture audio timestamp sync. */
  audioSync?: StrokeAudioSync;
}

export const STRIDE = 4;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Binary form: u32 header length, JSON header (padded to 4 bytes), Float32 points. */
export function encodeStroke(s: Stroke): ArrayBuffer {
  const { points, ...meta } = s;
  const head = enc.encode(JSON.stringify(meta));
  const headLen = Math.ceil(head.length / 4) * 4;
  const buf = new ArrayBuffer(4 + headLen + points.byteLength);
  new DataView(buf).setUint32(0, head.length, true);
  new Uint8Array(buf, 4, head.length).set(head);
  new Float32Array(buf, 4 + headLen, points.length).set(points);
  return buf;
}

export function decodeStroke(buf: ArrayBuffer): Stroke {
  const len = new DataView(buf).getUint32(0, true);
  const meta = JSON.parse(dec.decode(new Uint8Array(buf, 4, len))) as Omit<Stroke, "points">;
  const off = 4 + Math.ceil(len / 4) * 4;
  return { ...meta, points: new Float32Array(buf.slice(off)) };
}
