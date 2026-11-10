"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "./motion";

export type MenuItem = { label: string; icon?: ReactNode; shortcut?: string; onSelect: () => void; danger?: boolean };

export function Menu({ items, onClose, style, footer }: { items: MenuItem[]; onClose: () => void; style?: CSSProperties; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = useSafeMotion(motionTokens.distance.xs);
  const [nudge, setNudge] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (r.right > window.innerWidth - 8) dx = window.innerWidth - 8 - r.right;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (r.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - r.bottom;
    if (r.top + dy < 8) dy = 8 - r.top;
    if (dx !== 0 || dy !== 0) setNudge({ x: dx, y: dy });
  }, [items.length]);

  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      if (btns.length === 0) return;
      e.preventDefault();
      const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
      let next = 0;
      if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % btns.length;
      else if (e.key === "ArrowUp") next = idx <= 0 ? btns.length - 1 : idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = btns.length - 1;
      btns[next]?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  return (
    <motion.div className="menu" role="menu" ref={ref}
      style={{ ...style, transformOrigin: "top right", translate: nudge.x || nudge.y ? `${nudge.x}px ${nudge.y}px` : undefined }}
      initial={{ opacity: 0, y: safe.reduce ? 0 : -motionTokens.distance.xs, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={safe.reduce ? safe.transition : springs.instant}>
      {items.map((it) => (
        <button key={it.label} role="menuitem" style={it.danger ? { color: "var(--danger)" } : undefined}
          onClick={() => { it.onSelect(); onClose(); }}>
          {it.icon}
          <span className="menu-label">{it.label}</span>
          {it.shortcut && <kbd className="menu-kbd mono">{it.shortcut}</kbd>}
        </button>
      ))}
      {footer && <div className="menu-footer">{footer}</div>}
    </motion.div>
  );
}
