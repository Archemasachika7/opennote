"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "./motion";

export function Sheet({ open, onClose, title, children, width }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const safe = useSafeMotion(motionTokens.distance.md);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // scroll lock while the dialog is open
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="sheet-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.fast }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.section className="sheet" role="dialog" aria-modal="true" aria-label={title}
            initial={{ ...safe.initial, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
            animate={{ ...safe.animate, scale: 1 }}
            exit={{ ...safe.exit, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
            transition={safe.reduce ? safe.transition : springs.snappy}
            style={width ? { width: `min(${width}px, 100%)` } : undefined}>
            <header>
              <h2 style={{ fontSize: 16 }}>{title}</h2>
              <button className="btn ghost icon" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
            </header>
            <div className="sheet-body">{children}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
