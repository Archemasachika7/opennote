import { db, newId, now } from "../store/schema";
import { STRIDE, type ShapeMeta, type Stroke } from "./model";
import { bbox } from "./geometry";
import { shapePoints } from "./shapes";

const ELEMENTS_BLOB_ID = "opennote:elements:v1";

export interface SavedStrokeSpec {
  tool: Stroke["tool"];
  variant: Stroke["variant"];
  color: string;
  paletteIndex?: number;
  width: number;
  points: number[];
  shape?: ShapeMeta;
}

export interface InkElement {
  id: string;
  name: string;
  category: "builtin" | "custom";
  width: number;
  height: number;
  strokes: SavedStrokeSpec[];
  createdAt: number;
}

const packLine = (pts: [number, number][]): number[] => {
  const out: number[] = [];
  for (const [x, y] of pts) out.push(x, y, 0.5, 0);
  return out;
};

/** Built-in STEM & study vector stamps (normalised ~160x160 logical units). */
export const BUILTIN_ELEMENTS: InkElement[] = [
  {
    id: "builtin-axes-2d",
    name: "2D Axes (x, y)",
    category: "builtin",
    width: 180,
    height: 180,
    createdAt: 0,
    strokes: [
      { tool: "pen", variant: "ball", color: "#E8E9EE", paletteIndex: 0, width: 2.5, points: Array.from(shapePoints("arrow", 12, 150, 172, 150, false)), shape: { kind: "arrow" } },
      { tool: "pen", variant: "ball", color: "#E8E9EE", paletteIndex: 0, width: 2.5, points: Array.from(shapePoints("arrow", 30, 168, 30, 12, false)), shape: { kind: "arrow" } },
    ],
  },
  {
    id: "builtin-axes-3d",
    name: "3D Axes (x, y, z)",
    category: "builtin",
    width: 180,
    height: 180,
    createdAt: 0,
    strokes: [
      { tool: "pen", variant: "ball", color: "#E8E9EE", paletteIndex: 0, width: 2.5, points: Array.from(shapePoints("arrow", 90, 96, 90, 12, false)), shape: { kind: "arrow" } },
      { tool: "pen", variant: "ball", color: "#E8E9EE", paletteIndex: 0, width: 2.5, points: Array.from(shapePoints("arrow", 90, 96, 170, 136, false)), shape: { kind: "arrow" } },
      { tool: "pen", variant: "ball", color: "#E8E9EE", paletteIndex: 0, width: 2.5, points: Array.from(shapePoints("arrow", 90, 96, 18, 142, false)), shape: { kind: "arrow" } },
    ],
  },
  {
    id: "builtin-benzene",
    name: "Benzene Ring",
    category: "builtin",
    width: 150,
    height: 168,
    createdAt: 0,
    strokes: (() => {
      const cx = 75, cy = 84, R = 68;
      const hex: [number, number][] = Array.from({ length: 7 }, (_, i) => {
        const a = -Math.PI / 2 + (i % 6) * (Math.PI / 3);
        return [cx + Math.cos(a) * R, cy + Math.sin(a) * R];
      });
      return [
        { tool: "pen" as const, variant: "ball" as const, color: "#4FD1C5", paletteIndex: 1, width: 2.5, points: packLine(hex), shape: { kind: "rect" as const } },
        { tool: "pen" as const, variant: "ball" as const, color: "#4FD1C5", paletteIndex: 1, width: 2, points: Array.from(shapePoints("ellipse", cx - 38, cy - 38, cx + 38, cy + 38, true)), shape: { kind: "ellipse" as const } },
      ];
    })(),
  },
  {
    id: "builtin-resistor",
    name: "Circuit Resistor",
    category: "builtin",
    width: 200,
    height: 64,
    createdAt: 0,
    strokes: [
      {
        tool: "pen", variant: "ball", color: "#3DDC97", paletteIndex: 2, width: 2.5,
        points: packLine([[8, 32], [44, 32], [56, 10], [76, 54], [96, 10], [116, 54], [136, 10], [148, 32], [192, 32]]),
      },
    ],
  },
  {
    id: "builtin-callout",
    name: "Key Concept Box",
    category: "builtin",
    width: 260,
    height: 110,
    createdAt: 0,
    strokes: [
      {
        tool: "pen", variant: "ball", color: "#F2C94C", paletteIndex: 5, width: 2.5,
        points: Array.from(shapePoints("roundrect", 8, 8, 252, 102, false)),
        shape: { kind: "roundrect", fill: true },
      },
    ],
  },
  {
    id: "builtin-star-badge",
    name: "Exam Star",
    category: "builtin",
    width: 96,
    height: 96,
    createdAt: 0,
    strokes: [
      {
        tool: "pen", variant: "ball", color: "#FF9E6B", paletteIndex: 3, width: 2.5,
        points: Array.from(shapePoints("star", 8, 8, 88, 88, true)),
        shape: { kind: "star", fill: true },
      },
    ],
  },
];

const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function onElementsChanged(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

async function readCustomElements(): Promise<InkElement[]> {
  try {
    const row = await db.blobs.get(ELEMENTS_BLOB_ID);
    if (!row) return [];
    const raw = typeof row.data?.text === "function"
      ? await row.data.text()
      : (row as unknown as { json?: string }).json ?? "";
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InkElement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCustomElements(list: InkElement[]): Promise<void> {
  const json = JSON.stringify(list);
  const blob = new Blob([json], { type: "application/json" });
  await db.blobs.put({ id: ELEMENTS_BLOB_ID, data: blob, json } as { id: string; data: Blob });
  notify();
}

export async function listElements(): Promise<InkElement[]> {
  const custom = await readCustomElements();
  return [...custom, ...BUILTIN_ELEMENTS];
}

/** Normalise selected strokes to a local (0,0)-anchored element and save to IndexedDB. */
export async function saveStrokesAsElement(name: string, strokes: Stroke[]): Promise<InkElement | null> {
  if (strokes.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const b = bbox(s.points);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  const pad = 8;
  const ox = x0 - pad, oy = y0 - pad;
  const width = Math.max(24, Math.round(x1 - x0 + pad * 2));
  const height = Math.max(24, Math.round(y1 - y0 + pad * 2));

  const specs: SavedStrokeSpec[] = strokes.map((s) => {
    const pts = Array.from(s.points);
    for (let i = 0; i < pts.length; i += STRIDE) {
      pts[i] -= ox;
      pts[i + 1] -= oy;
    }
    return {
      tool: s.tool,
      variant: s.variant,
      color: s.color,
      paletteIndex: s.paletteIndex,
      width: s.width,
      points: pts,
      shape: s.shape,
    };
  });

  const elem: InkElement = {
    id: newId(),
    name: name.trim() || "Saved diagram",
    category: "custom",
    width,
    height,
    strokes: specs,
    createdAt: now(),
  };
  const prev = await readCustomElements();
  await writeCustomElements([elem, ...prev]);
  return elem;
}

export async function deleteElement(id: string): Promise<void> {
  const prev = await readCustomElements();
  await writeCustomElements(prev.filter((e) => e.id !== id));
}

/** Instantiate an element's strokes centered around `(cx, cy)` on a target layer. */
export function instantiateElement(elem: InkElement, cx: number, cy: number, layerId?: string): Stroke[] {
  const dx = cx - elem.width / 2;
  const dy = cy - elem.height / 2;
  return elem.strokes.map((spec) => {
    const pts = new Float32Array(spec.points);
    for (let i = 0; i < pts.length; i += STRIDE) {
      pts[i] += dx;
      pts[i + 1] += dy;
    }
    return {
      id: newId(),
      tool: spec.tool,
      variant: spec.variant,
      color: spec.color,
      paletteIndex: spec.paletteIndex,
      width: spec.width,
      points: pts,
      shape: spec.shape,
      ...(layerId ? { layerId } : {}),
    };
  });
}
