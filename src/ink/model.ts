export type StrokeTool = "pen" | "highlighter";
export type PenVariant = "ball" | "fountain" | "brush";

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
}

export const STRIDE = 4;
