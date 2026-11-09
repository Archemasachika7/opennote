"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "./motion";

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean };

export function Menu({ items, onClose, style }: { items: MenuItem[]; onClose: () => void; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = useSafeMotion(motionTokens.distance.xs);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <motion.div className="menu" role="menu" ref={ref} style={{ ...style, transformOrigin: "top right" }}
      initial={{ opacity: 0, y: safe.reduce ? 0 : -motionTokens.distance.xs, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={safe.reduce ? safe.transition : springs.instant}>
      {items.map((it) => (
        <button key={it.label} role="menuitem" style={it.danger ? { color: "var(--danger)" } : undefined}
          onClick={() => { it.onSelect(); onClose(); }}>
          {it.icon}{it.label}
        </button>
      ))}
    </motion.div>
  );
}
