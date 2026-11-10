// Blot: an original pixel ink drop, 14×14 square pixels (body rows 0–11, legs 12–13).
// It is the notebook's agency: born from an ink dot, it acts out what OpenNote does.
export const BLUE = '#2F8CFF', BLUE_D = '#1B5FC4', BLUE_L = '#8CC3FF', EYE = '#0B1020', WHITE = '#FFFFFF';
export const GW = 14, GH = 14;

const BODY = [
  '......##......',
  '.....####.....',
  '....######....',
  '...########...',
  '..##########..',
  '..##########..',
  '.############.',
  '.############.',
  '.############.',
  '.############.',
  '..##########..',
  '...########...',
];

// returns [[c, r, kind]], kind: 1 body, 2 eye white, 3 pupil, 4 shade, 5 shine
export function grid({ eyes = 'n', arms = 'down', legs = 'stand' } = {}) {
  const P = new Map(), put = (c, r, v = 1) => P.set(c + ',' + r, v);
  BODY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') put(c, r, r >= 10 ? 4 : 1); }));
  put(4, 3, 5); put(3, 4, 5); put(3, 5, 5);                       // shine
  if (arms === 'up') for (const r of [4, 5, 6]) { put(0, r); put(13, r); }
  else if (arms === 'wave') { put(0, 8); put(0, 9); for (const r of [4, 5, 6]) put(13, r); }
  else if (arms === 'tuck') { /* none */ }
  else { put(0, 8); put(0, 9); put(13, 8); put(13, 9); }
  const L = { stand: [[4, 2], [5, 2], [8, 2], [9, 2]], walkA: [[4, 2], [5, 2], [8, 1], [9, 1]], walkB: [[4, 1], [5, 1], [8, 2], [9, 2]],
    tuck: [[4, 1], [5, 1], [8, 1], [9, 1]], none: [] }[legs] || [];
  for (const [c, h] of L) for (let r = 12; r < 12 + h; r++) put(c, r, 4);
  // eyes: 2×2 whites at cols 4–5 and 8–9, rows 6–7; pupil position carries the look
  const W = (dx = 0, dy = 0) => { for (const [c0] of [[4], [8]]) for (const r of [6, 7]) for (const c of [c0, c0 + 1]) put(c + dx, r + dy, 2); };
  const pupil = (ox, oy) => { put(4 + ox, 6 + oy, 3); put(8 + ox, 6 + oy, 3); };
  switch (eyes) {
    case 'blink': case 'shut': for (const c of [4, 5, 8, 9]) put(c, 7, 3); break;
    case 'happy': put(4, 7, 3); put(5, 6, 3); put(8, 6, 3); put(9, 7, 3); break;
    case 'wide': for (const c0 of [4, 8]) for (const r of [5, 6, 7]) for (const c of [c0, c0 + 1]) put(c, r, 2); put(4, 6, 3); put(8, 6, 3); put(5, 6, 3); put(9, 6, 3); break;
    case 'l': W(); pupil(0, 1); break;
    case 'r': W(); pupil(1, 1); break;
    case 'u': W(); pupil(0, 0); put(5, 6, 3); put(9, 6, 3); break;
    case 'd': W(); pupil(0, 1); put(5, 7, 3); put(9, 7, 3); break;
    default: W(); pupil(1, 1); put(4, 7, 3); put(8, 7, 3);
  }
  return [...P].map(([k, v]) => { const [c, r] = k.split(',').map(Number); return [c, r, v]; });
}
const COL = { 1: BLUE, 2: WHITE, 3: EYE, 4: BLUE_D, 5: BLUE_L };

// x,y = midpoint under the feet (world coords); px = pixel side; sq>0 squash, <0 stretch
export function sprite({ x, y, px = 6, flip = false, sq = 0, rot = 0, op = 1, shadow = 0, col, ...pose }) {
  const G = grid(pose); let s = '';
  for (let [c, r, v] of G) { if (flip) c = GW - 1 - c; s += `<rect x="${c}" y="${r}" width="1.04" height="1.04" fill="${col && v !== 2 && v !== 3 ? col : COL[v]}"/>`; }
  const sy = 1 - sq, sx = 1 + sq * .7, w = GW * px * sx, h = GH * px * sy;
  const sh = shadow > 0 ? `<div style="position:absolute;left:${x - 5 * px}px;top:${y - px * .4}px;width:${10 * px}px;height:${px * .8}px;border-radius:50%;background:rgba(0,0,0,${.18 * shadow})"></div>` : '';
  return sh + `<svg class="px" viewBox="0 0 ${GW} ${GH}" width="${w}" height="${h}" style="left:${x - w / 2}px;top:${y - h}px;opacity:${op};transform:rotate(${rot}rad);transform-origin:50% 60%" shape-rendering="crispEdges">${s}</svg>`;
}
export function pixels(o) {
  const { x, y, px = 6, flip = false } = o;
  return grid(o).map(([c, r, v]) => ({ x: x + ((flip ? GW - 1 - c : c) - GW / 2 + .5) * px, y: y + (r - GH + .5) * px, v, col: COL[v] }));
}
export function pixart(rows, { x, y, px = 6, pal, op = 1 }) {
  let s = ''; rows.forEach((row, r) => [...row].forEach((ch, c) => { if (pal[ch]) s += `<rect x="${c}" y="${r}" width="1.04" height="1.04" fill="${pal[ch]}"/>`; }));
  const W = rows[0].length, H = rows.length;
  return `<svg class="px" viewBox="0 0 ${W} ${H}" width="${W * px}" height="${H * px}" style="left:${x}px;top:${y}px;opacity:${op}" shape-rendering="crispEdges">${s}</svg>`;
}
export const BANG = (x, y, px = 5, op = 1) => pixart(['.kkk.', 'kwwwk', 'kwkwk', 'kwkwk', 'kwwwk', 'kwkwk', 'kwwwk', '.kkk.'], { x, y, px, op, pal: { w: '#fff', k: EYE } });
export const SPARK = (x, y, px = 5, col = '#F5A524', op = 1) => pixart(['..y..', '..y..', 'yy.yy', '..y..', '..y..'], { x: x - 2.5 * px, y: y - 2.5 * px, px, op, pal: { y: col } });
export const Z = (x, y, px = 5, op = 1, col = '#8CC3FF') => pixart(['zzzz', '..z.', '.z..', 'zzzz'], { x, y, px, op, pal: { z: col } });
export const PEN = (x, y, px = 5, op = 1) => pixart(['......kk', '.....aak', '....aaa.', '...aaa..', '..aaa...', '.paa....', 'pp......', 'k.......'], { x, y, px, op, pal: { a: '#F5A524', k: EYE, p: '#F3F1EC' } });
export const QMARK = (x, y, px = 5, op = 1) => pixart(['.kkk.', 'k...k', '...k.', '..k..', '.....', '..k..'], { x, y, px, op, pal: { k: BLUE_L } });
export function dust(x, y, t, px = 5, n = 6, seed = 1, col = '#9AA3B5') {
  if (t <= 0 || t >= 1) return ''; let s = '';
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = (i >> 1) + 1, e = 1 - Math.pow(1 - t, 2);
    const dx = side * (16 + k * 14 + ((seed * 7 + i * 13) % 9)) * e, dy = -(7 + k * 5) * Math.sin(Math.PI * t * .9), sz = px * (1 - t * .7);
    s += `<div style="position:absolute;left:${x + dx - sz / 2}px;top:${y + dy - sz}px;width:${sz}px;height:${sz}px;background:${col};opacity:${1 - t}"></div>`;
  }
  return s;
}
