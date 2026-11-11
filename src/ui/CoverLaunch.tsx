"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Launch = { id: number; inset: string; go: () => void };

let push: ((l: Launch) => void) | null = null;
let seq = 0;

const prefersStill = () =>
  typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Open a notebook from its library cover: the cover grows to fill the screen, the notebook opens
 * underneath, and the layer fades away, so the cover visibly becomes the notebook instead of the
 * screen just swapping. With reduced motion, or without the layer mounted (tests), it simply opens.
 */
export function openFromCover(cover: Element | null, go: () => void) {
  if (!push || !cover || prefersStill()) { go(); return; }
  const r = cover.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  // clip-path inset of the full-screen layer that leaves exactly the cover's box showing
  const inset = `inset(${r.top}px ${w - r.right}px ${h - r.bottom}px ${r.left}px round 8px)`;
  push({ id: ++seq, inset, go });
}

/** Mounted once in App, above the routes, so it survives the library unmounting. */
export function CoverLaunchLayer() {
  const [launch, setLaunch] = useState<Launch | null>(null);
  const opened = useRef(0);
  useEffect(() => {
    push = setLaunch;
    return () => { push = null; };
  }, []);

  return (
    <AnimatePresence>
      {launch && (
        <motion.div key={launch.id} className="cover-launch" aria-hidden
          // clip-path, not width/height: it animates without re-laying-out the page every frame
          initial={{ clipPath: launch.inset }}
          animate={{ clipPath: "inset(0px 0px 0px 0px round 0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeOut" } }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => {
            if (opened.current === launch.id) return; // the exit fade completes too
            opened.current = launch.id;
            launch.go();
            // keep covering until the document has really drawn underneath (its view loads lazily),
            // so the fade reveals the notebook, never a "Loading..." screen; give up after 1.5 s
            const started = performance.now();
            const reveal = () => {
              const ready = document.querySelector(".nb-view, .study");
              if (!ready && performance.now() - started < 1500) { requestAnimationFrame(reveal); return; }
              setLaunch((cur) => (cur?.id === launch.id ? null : cur));
            };
            requestAnimationFrame(reveal);
          }} />
      )}
    </AnimatePresence>
  );
}
