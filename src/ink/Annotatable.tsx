import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Paper } from "../store/schema";
import { useTool } from "../notebook/tool";
import { InkLayer } from "./InkLayer";

const PEN_IDLE_MS = 1500;
type Ctx = { penActivity: () => void };
const AnnotateCtx = createContext<Ctx>({ penActivity: () => {} });
export const useAnnotate = (): Ctx => useContext(AnnotateCtx);

/**
 * Wraps a Text or Live page with a pen-annotation ink overlay. The overlay only takes pointer input
 * while a pen is active (hovering/drawing, reported directly or forwarded from the sandbox) or in
 * Annotate mode; otherwise fingers and the mouse reach the page underneath.
 */
export function Annotatable({ pageId, width, height, paper, top = 0, inkEnabled = true, children }: {
  pageId: string; width: number; height: number; paper: Paper; top?: number; inkEnabled?: boolean; children: ReactNode;
}) {
  const [tool] = useTool();
  const [penActive, setPenActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const penActivity = useCallback(() => {
    setPenActive(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPenActive(false), PEN_IDLE_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onPen = (e: React.PointerEvent) => { if (e.pointerType === "pen") penActivity(); };
  const annotate = tool.mode === "annotate";
  const active = annotate || penActive;
  const accept = useCallback((e: PointerEvent) => annotate || e.pointerType === "pen", [annotate]);

  return (
    <AnnotateCtx.Provider value={{ penActivity }}>
      <div className="annotatable" onPointerOverCapture={onPen} onPointerMoveCapture={onPen} onPointerDownCapture={onPen}>
        {children}
        <div className="annotation-overlay" data-testid="annotation-overlay"
          style={{ top, height: height - top, pointerEvents: active ? "auto" : "none" }}>
          {inkEnabled && <InkLayer pageId={pageId} width={width} height={height - top} paper={paper} inputFilter={accept} />}
        </div>
      </div>
    </AnnotateCtx.Provider>
  );
}
