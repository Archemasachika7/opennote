import { useEffect, useRef } from "react";
import { getTool, setTool, type ToolName } from "./tool";
import { getRuler } from "../ink/ruler";
import { toggleRuler } from "../ink/RulerOverlay";

const WIDTH_STEPS = [2, 3, 5, 8];

const KEY_TO_TOOL: Record<string, ToolName> = {
  p: "pen",
  h: "highlighter",
  e: "eraser",
  l: "lasso",
  s: "shape",
  b: "tape",
  k: "laser",
  t: "text",
  v: "hand",
};

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input, textarea, select, [contenteditable=true], .sheet");
}

/** Shared keyboard shortcuts for NotebookView and WhiteboardView: Undo/Redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y), single-key tools, Space-to-pan, and sidebar toggle. */
export function useStudioShortcuts(opts: {
  onUndo: () => void;
  onRedo: () => void;
  onToggleSidebar?: () => void;
}): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const heldTool = useRef<ToolName | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "\\") {
        if (optsRef.current.onToggleSidebar) {
          e.preventDefault();
          optsRef.current.onToggleSidebar();
        }
        return;
      }
      if (isEditableTarget(e.target)) return;

      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          if (e.shiftKey) optsRef.current.onRedo();
          else optsRef.current.onUndo();
          return;
        }
        if (k === "y" && !e.shiftKey) {
          e.preventDefault();
          optsRef.current.onRedo();
          return;
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === " " && !e.repeat) {
        const btn = (e.target as HTMLElement | null)?.closest?.("button, [role=button], [role=tab], [role=radio]");
        if (btn) return;
        const cur = getTool().tool;
        if (cur !== "hand") {
          e.preventDefault();
          heldTool.current = cur;
          setTool({ tool: "hand" });
        }
        return;
      }

      if (e.repeat) return;
      const lower = e.key.toLowerCase();
      if (KEY_TO_TOOL[lower]) {
        setTool({ tool: KEY_TO_TOOL[lower] });
        return;
      }
      if (lower === "r") {
        toggleRuler(!getRuler());
        return;
      }
      if (e.key === "[" || e.key === "]") {
        const curW = getTool().width;
        const idx = WIDTH_STEPS.findIndex((w) => w >= curW);
        const curIdx = idx < 0 ? WIDTH_STEPS.length - 1 : idx;
        const nextIdx = e.key === "[" ? Math.max(0, curIdx - 1) : Math.min(WIDTH_STEPS.length - 1, curIdx + 1);
        setTool({ width: WIDTH_STEPS[nextIdx] });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " && heldTool.current) {
        const restore = heldTool.current;
        heldTool.current = null;
        setTool({ tool: restore });
      }
    };

    const onBlur = () => {
      if (heldTool.current) {
        setTool({ tool: heldTool.current });
        heldTool.current = null;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
