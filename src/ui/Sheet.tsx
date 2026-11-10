"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "./motion";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children, width, beforeClose }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number; beforeClose?: () => boolean }) {
  const safe = useSafeMotion(motionTokens.distance.md);
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const requestClose = () => {
    if (beforeClose && !beforeClose()) return;
    onClose();
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const timer = setTimeout(() => {
      const dlg = dialogRef.current;
      if (!dlg) return;
      if (!dlg.contains(document.activeElement)) {
        const first = dlg.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? dlg).focus();
      }
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dlg = dialogRef.current;
      if (!dlg) return;
      const nodes = Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement || !("offsetParent" in el));
      const list = nodes.length > 0 ? nodes : Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (list.length === 0) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!active || !dlg.contains(active) || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!active || !dlg.contains(active) || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // scroll lock while the dialog is open
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (openerRef.current && openerRef.current.isConnected) {
        openerRef.current.focus();
      }
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="sheet-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.duration.fast }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
          <motion.section ref={dialogRef} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={title}
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
