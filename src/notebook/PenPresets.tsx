import { useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import type { PenVariant } from "../ink/model";
import type { Paper } from "../store/schema";
import { getTool, setTool, useTool } from "./tool";
import { inkPalette } from "../ink/render";
import { toast } from "../ui/Toast";

/** A saved pen: one tap brings back the exact pen, colour and size. Saved on this device. */
export type PenPreset = { id: string; tool: "pen" | "highlighter"; variant: PenVariant; color: string; paletteIndex: number | null; width: number };

const KEY = "opennote.penPresets";
const MAX = 8;
const subs = new Set<() => void>();
const read = (): PenPreset[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as PenPreset[]; } catch { return []; } };
let cache: PenPreset[] = read();
const write = (list: PenPreset[]) => {
  cache = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode: keep for this session */ }
  subs.forEach((f) => f());
};
export const getPresets = (): PenPreset[] => cache;
export const usePresets = (): PenPreset[] => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getPresets, getPresets);

const same = (a: Omit<PenPreset, "id">, b: Omit<PenPreset, "id">) =>
  a.tool === b.tool && a.variant === b.variant && a.width === b.width && a.paletteIndex === b.paletteIndex && (a.paletteIndex !== null || a.color === b.color);

export function saveCurrentPen(): PenPreset | null {
  const t = getTool();
  if (t.tool !== "pen" && t.tool !== "highlighter") return null;
  const p = { tool: t.tool, variant: t.variant, color: t.color, paletteIndex: t.paletteIndex, width: t.width } as const;
  if (cache.some((x) => same(x, p))) return null;
  const preset: PenPreset = { id: crypto.randomUUID(), ...p };
  write([...cache, preset].slice(-MAX));
  return preset;
}
export function removePreset(id: string): void { write(cache.filter((p) => p.id !== id)); }
export function applyPreset(p: PenPreset): void {
  setTool({ tool: p.tool, variant: p.variant, color: p.color, paletteIndex: p.paletteIndex, width: p.width });
}

const NAMES: Record<PenVariant, string> = {
  ball: "Ballpoint", fountain: "Fountain", brush: "Brush", pencil: "Pencil", calligraphy: "Calligraphy", marker: "Marker", beautify: "Beautify",
};

/** Toolbar chips: tap to use, right-click or long-press to remove, + to save the pen in hand. */
export function PenPresets({ paper }: { paper: Paper }) {
  const list = usePresets();
  const [t] = useTool();
  if (t.tool !== "pen" && t.tool !== "highlighter") return null;
  const colorOf = (p: PenPreset) => (p.paletteIndex !== null ? inkPalette(paper)[p.paletteIndex] ?? p.color : p.color);
  const remove = (p: PenPreset) => {
    removePreset(p.id);
    toast("Pen preset removed", { label: "Undo", run: () => write([...getPresets(), p]) });
  };
  return (
    <div className="pen-presets" role="group" aria-label="Saved pens">
      {list.map((p) => {
        const on = same(p, { tool: t.tool as PenPreset["tool"], variant: t.variant, color: t.color, paletteIndex: t.paletteIndex, width: t.width });
        const label = `${p.tool === "highlighter" ? "Highlighter" : NAMES[p.variant]}, size ${p.width}`;
        let press = 0;
        return (
          <button key={p.id} type="button" className={`pen-preset ${on ? "on" : ""}`} aria-label={`Use saved pen: ${label}`} aria-pressed={on}
            title={`${label} (right-click or hold to remove)`}
            onClick={() => applyPreset(p)}
            onContextMenu={(e) => { e.preventDefault(); remove(p); }}
            onPointerDown={() => { press = window.setTimeout(() => remove(p), 650); }}
            onPointerUp={() => window.clearTimeout(press)} onPointerLeave={() => window.clearTimeout(press)}>
            <span className="pen-preset-dot" style={{
              background: colorOf(p), width: Math.min(16, 5 + p.width * 1.6), height: Math.min(16, 5 + p.width * 1.6),
              opacity: p.tool === "highlighter" ? 0.5 : 1, borderRadius: p.variant === "calligraphy" || p.tool === "highlighter" ? 3 : "50%",
            }} />
          </button>
        );
      })}
      <button type="button" className="pen-preset add" aria-label="Save this pen" title="Save this pen, colour and size"
        onClick={() => toast(saveCurrentPen() ? "Pen saved. Tap it any time to switch back." : "This pen is already saved.")}>
        <Plus size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
