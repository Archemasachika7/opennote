import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean };

export function Menu({ items, onClose, style }: { items: MenuItem[]; onClose: () => void; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div className="menu" role="menu" ref={ref} style={style}>
      {items.map((it) => (
        <button key={it.label} role="menuitem" style={it.danger ? { color: "var(--danger)" } : undefined}
          onClick={() => { it.onSelect(); onClose(); }}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  );
}
