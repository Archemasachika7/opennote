import type { ToolName } from "../notebook/tool";

export type PointerAction = "draw" | "erase" | "navigate";
const ERASER_BUTTON = 32;

/** Decide what a pointer should do. Palm rejection: once a pen is seen, touch only navigates. */
export function classifyPointer(e: PointerEvent, s: { penSeen: boolean; tool: ToolName }): PointerAction {
  if (e.pointerType === "pen") {
    if (e.buttons & ERASER_BUTTON) return "erase";
    return s.tool === "hand" ? "navigate" : "draw";
  }
  if (e.pointerType === "touch") return s.penSeen || s.tool === "hand" ? "navigate" : "draw";
  if (e.button === 1 || e.buttons & 4 || s.tool === "hand") return "navigate";
  return "draw";
}

/** Full-rate points for a move: coalesced events when available. */
export function coalesced(e: PointerEvent): PointerEvent[] {
  const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
  return list.length ? list : [e];
}

export function predicted(e: PointerEvent): PointerEvent[] {
  return typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
}
