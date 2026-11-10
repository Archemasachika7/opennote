import { useSyncExternalStore } from "react";
import type { PenVariant } from "../ink/model";
import type { ShapeKind } from "../ink/shapes";
import type { InkElement } from "../ink/elements";

export type ToolName = "pen" | "highlighter" | "eraser" | "lasso" | "shape" | "text" | "image" | "hand" | "laser" | "tape";
export interface ToolState {
  tool: ToolName;
  variant: PenVariant;
  color: string;
  paletteIndex: number | null;
  width: number;
  eraseMode: "stroke" | "partial";
  shapeKind: ShapeKind | "auto";
  shapeFill: boolean;
  shapeDashed: boolean;
  penGestures: boolean;
  zoomBoxOpen: boolean;
  mode: "annotate" | "interact";
  penSeen: boolean;
}

let state: ToolState = {
  tool: "pen", variant: "ball", color: "#E8E9EE", paletteIndex: 0, width: 3,
  eraseMode: "stroke", shapeKind: "rect", shapeFill: false, shapeDashed: false,
  penGestures: true, zoomBoxOpen: false, mode: "interact", penSeen: false,
};
const subs = new Set<() => void>();

export function getTool(): ToolState { return state; }
export function setTool(p: Partial<ToolState>): void {
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
export function useTool(): [ToolState, (p: Partial<ToolState>) => void] {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getTool);
  return [s, setTool];
}

/** Notebook-level commands (undo/redo) routed to the current page's ink layer. */
type Command = "undo" | "redo";
const cmdSubs = new Set<(c: Command, pageId: string) => void>();
export function sendCommand(c: Command, pageId: string): void { cmdSubs.forEach((f) => f(c, pageId)); }
export function onCommand(f: (c: Command, pageId: string) => void): () => void {
  cmdSubs.add(f);
  return () => { cmdSubs.delete(f); };
}

/** Stamp a saved InkElement onto a target page/board. */
const stampSubs = new Set<(pageId: string, elem: InkElement) => void>();
export function sendStampElement(pageId: string, elem: InkElement): void { stampSubs.forEach((f) => f(pageId, elem)); }
export function onStampElement(f: (pageId: string, elem: InkElement) => void): () => void {
  stampSubs.add(f);
  return () => { stampSubs.delete(f); };
}
