import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Sheet({ open, onClose, title, children, width }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <header>
          <h2 style={{ fontSize: 16 }}>{title}</h2>
          <button className="btn ghost icon" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
