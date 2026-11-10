"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import type { InkPage } from "../store/schema";
import { addLayer, deleteLayer, setLayers } from "../store/pages";
import { getActiveLayer, moveLayer, pageLayers, setActiveLayer, useActiveLayerVersion, type Layer } from "./layers";

const I = { size: 15, strokeWidth: 1.5 } as const;

/** Layers of one ink page or board: pick where you write, rename, reorder, show/hide, lock, delete. */
export function LayersSheet({ page, onClose }: { page: InkPage | null; onClose: () => void }) {
  useActiveLayerVersion();
  const [confirm, setConfirm] = useState<string | null>(null);
  const layers = page ? pageLayers(page) : [];
  const activeId = page ? getActiveLayer(page.id, page) : "";
  const save = (next: Layer[]) => page && setLayers(page.id, next);
  const patch = (id: string, p: Partial<Layer>) => save(layers.map((l) => (l.id === id ? { ...l, ...p } : l)));

  return (
    <Sheet open={!!page} onClose={() => { setConfirm(null); onClose(); }} title="Layers" width={440}>
      <p className="dim small">New writing goes on the selected layer. Hidden layers are left out of exports. Pictures and text boxes stay under the ink.</p>
      <ul className="layers" aria-label="Layers, top first">
        {[...layers].reverse().map((l, i) => {
          const top = i === 0, bottom = i === layers.length - 1;
          return (
            <li key={l.id} className={`layer-row ${l.id === activeId ? "on" : ""}`}>
              <input type="radio" name="active-layer" aria-label={`Write on ${l.name}`} checked={l.id === activeId}
                onChange={() => page && setActiveLayer(page.id, l.id)} />
              <input className="input layer-name" aria-label="Layer name" defaultValue={l.name} key={`${l.id}:${l.name}`}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) void patch(l.id, { name: v }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <button className="btn ghost icon" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} aria-pressed={!l.visible}
                onClick={() => patch(l.id, { visible: !l.visible })}>{l.visible ? <Eye {...I} /> : <EyeOff {...I} />}</button>
              <button className="btn ghost icon" aria-label={l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} aria-pressed={l.locked}
                onClick={() => patch(l.id, { locked: !l.locked })}>{l.locked ? <Lock {...I} /> : <LockOpen {...I} />}</button>
              <button className="btn ghost icon" aria-label={`Move ${l.name} up`} disabled={top} onClick={() => save(moveLayer(layers, l.id, 1))}><ArrowUp {...I} /></button>
              <button className="btn ghost icon" aria-label={`Move ${l.name} down`} disabled={bottom} onClick={() => save(moveLayer(layers, l.id, -1))}><ArrowDown {...I} /></button>
              {confirm === l.id ? (
                <button className="btn danger" onClick={async () => { setConfirm(null); if (page) await deleteLayer(page.id, l.id); }}>Delete with its content</button>
              ) : (
                <button className="btn ghost icon" aria-label={`Delete ${l.name}`} disabled={layers.length <= 1} onClick={() => setConfirm(l.id)}><Trash2 {...I} /></button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="row-end">
        <button className="btn" onClick={async () => { if (!page) return; const l = await addLayer(page.id); setActiveLayer(page.id, l.id); }}>
          <Plus {...I} />Add layer</button>
      </div>
    </Sheet>
  );
}
