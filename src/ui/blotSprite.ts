// Blot, the ink-drop companion from the OpenNote launch film: a 14×14 pixel drop, drawn as small voxel
// cubes (front, lit top, shaded side) in plain SVG. No 3D library, no canvas loop: it redraws only on change.

export type BlotPose = { eyes: "open" | "shut" | "happy"; arms: "down" | "up" | "wave" | "wings" | "wings-down" };
export type BlotKind = "body" | "shade" | "shine" | "white" | "pupil";
export type BlotPixel = { c: number; r: number; kind: BlotKind };

const BODY = [
  "......##......",
  ".....####.....",
  "....######....",
  "...########...",
  "..##########..",
  "..##########..",
  ".############.",
  ".############.",
  ".############.",
  ".############.",
  "..##########..",
  "...########...",
];

export const BLOT_COLORS: Record<BlotKind, string> = {
  body: "#2F8CFF", shade: "#1B5FC4", shine: "#8CC3FF", white: "#FFFFFF", pupil: "#0B1020",
};

export function blotGrid(pose: BlotPose): BlotPixel[] {
  const P = new Map<string, BlotKind>();
  const put = (c: number, r: number, k: BlotKind) => P.set(`${c},${r}`, k);
  BODY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === "#") put(c, r, r >= 10 ? "shade" : "body"); }));
  put(4, 3, "shine"); put(3, 4, "shine"); put(3, 5, "shine");
  if (pose.arms === "up") for (const r of [4, 5, 6]) { put(0, r, "body"); put(13, r, "body"); }
  else if (pose.arms === "wave") { put(0, 8, "body"); put(0, 9, "body"); for (const r of [4, 5, 6]) put(13, r, "body"); }
  else if (pose.arms === "wings") {
    // little white wings, raised (flap up)
    for (const [c, r] of [[-1, 3], [-1, 4], [0, 4], [0, 5], [14, 3], [14, 4], [13, 4], [13, 5]]) put(c, r, "white");
  } else if (pose.arms === "wings-down") {
    for (const [c, r] of [[-1, 7], [-1, 8], [0, 6], [0, 7], [14, 7], [14, 8], [13, 6], [13, 7]]) put(c, r, "white");
  }
  else { put(0, 8, "body"); put(0, 9, "body"); put(13, 8, "body"); put(13, 9, "body"); }
  for (const [c, h] of [[4, 2], [5, 2], [8, 2], [9, 2]]) for (let r = 12; r < 12 + h; r++) put(c, r, "shade");
  if (pose.eyes === "shut") for (const c of [4, 5, 8, 9]) put(c, 7, "pupil");
  else if (pose.eyes === "happy") { put(4, 7, "pupil"); put(5, 6, "pupil"); put(8, 6, "pupil"); put(9, 7, "pupil"); }
  else {
    for (const c0 of [4, 8]) for (const r of [6, 7]) for (const c of [c0, c0 + 1]) put(c, r, "white");
    put(5, 7, "pupil"); put(9, 7, "pupil");   // one pupil pixel per eye, looking slightly to the right
  }
  return [...P].map(([k, kind]) => { const [c, r] = k.split(",").map(Number); return { c, r, kind }; });
}

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

/** SVG markup (no outer <svg>) in a 19 × 18 viewBox: a soft floor shadow, then cubes back to front. */
export function blotVoxelSvg(pose: BlotPose): string {
  const D = 0.42;
  const cells = blotGrid(pose).sort((a, b) => a.r - b.r || b.c - a.c);
  let s = '<ellipse cx="7.4" cy="14.6" rx="4.4" ry=".55" fill="rgba(0,0,0,.2)"/>';
  for (const { c: x, r: y, kind } of cells) {
    const col = BLOT_COLORS[kind];
    s += `<polygon points="${x + 1},${y} ${x + 1 + D},${y - D} ${x + 1 + D},${y + 1 - D} ${x + 1},${y + 1}" fill="${shade(col, 0.62)}"/>`;
    s += `<polygon points="${x},${y} ${x + D},${y - D} ${x + 1 + D},${y - D} ${x + 1},${y}" fill="${shade(col, 1.22)}"/>`;
    s += `<rect x="${x}" y="${y}" width="1.01" height="1.01" fill="${col}"/>`;
  }
  return s;
}
