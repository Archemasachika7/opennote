import { useSyncExternalStore } from "react";

export interface Layer { id: string; name: string; visible: boolean; locked: boolean }
/** Content saved before layers existed (no layerId) lives on this layer. */
export const BASE_LAYER = "base";
const DEFAULT: Layer = { id: BASE_LAYER, name: "Layer 1", visible: true, locked: false };

/** Layers of a page, bottom to top. Pages made before layers get one default layer. */
export function pageLayers(p: { layers?: Layer[] }): Layer[] {
  return p.layers && p.layers.length ? p.layers : [{ ...DEFAULT }];
}
export const layerOf = (x: { layerId?: string }): string => x.layerId ?? BASE_LAYER;

export function hiddenLayers(p: { layers?: Layer[] }): Set<string> {
  return new Set(pageLayers(p).filter((l) => !l.visible).map((l) => l.id));
}
/** Layers that cannot be edited: locked or hidden. */
export function lockedLayers(p: { layers?: Layer[] }): Set<string> {
  return new Set(pageLayers(p).filter((l) => l.locked || !l.visible).map((l) => l.id));
}

/** Move a layer by `by` places (positive = up / towards the top), clamped. */
export function moveLayer(layers: Layer[], id: string, by: number): Layer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return layers;
  const j = Math.max(0, Math.min(layers.length - 1, i + by));
  const out = [...layers];
  const [l] = out.splice(i, 1);
  out.splice(j, 0, l);
  return out;
}

/** Index of each layer for drawing order. */
export function layerOrder(p: { layers?: Layer[] }): Map<string, number> {
  return new Map(pageLayers(p).map((l, i) => [l.id, i]));
}

/* ---- active layer per page (where new content goes) ---- */
const active = new Map<string, string>();
const subs = new Set<() => void>();
let version = 0;
export function getActiveLayer(pageId: string, p: { layers?: Layer[] }): string {
  const ls = pageLayers(p);
  const id = active.get(pageId);
  if (id && ls.some((l) => l.id === id)) return id;
  return ls[ls.length - 1].id;
}
export function setActiveLayer(pageId: string, layerId: string): void {
  active.set(pageId, layerId);
  version++;
  subs.forEach((f) => f());
}
export function useActiveLayerVersion(): number {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
}
