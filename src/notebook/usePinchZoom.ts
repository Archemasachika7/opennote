import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

/** Ctrl/Cmd+wheel and two-finger pinch zoom on a scroll container. */
export function usePinchZoom(ref: RefObject<HTMLElement | null>, setZoom: Dispatch<SetStateAction<number>>, clamp: (z: number) => number): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    const touches = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let lastDist = 0;
    const dist = () => {
      const [a, b] = [...touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { startDist = dist(); lastDist = startDist; }
    };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && startDist > 0) {
        const d = dist();
        const ratio = d / lastDist;
        lastDist = d;
        setZoom((z) => clamp(z * ratio));
      }
    };
    const up = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) startDist = 0; };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
    };
  }, [ref, setZoom, clamp]);
}
