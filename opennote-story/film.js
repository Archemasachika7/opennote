// "The One Coloured Thing" — OpenNote founder story in Urban Sketch · Pen & Wash.
// Every frame is drawn on a 2D canvas with the style's engine: fineliner strokes that draw on, washes, sketched figures, handwriting.
// Colour is withheld: only the AI's visualiser has it, until OpenNote runs and colour arrives over the whole sketchbook.
import { clamp, lerp, ss, TAU, rng, n2, fbm, hex, mix3, INK, PAPER, rgba, rough, penStroke, drawPen, wash, reserve, figure, drawPrims, handwrite, ellipse, R3 } from './engine.js';
import { stand, wave, mixPose } from './poses.js';
const { V } = R3;

export const W = 2400, H = 1350, DUR = 150;
export const BPM = 112, BEAT = 60 / BPM, BAR = BEAT * 3;
export const VO = { v01: 2.0, v02: 11.5, v03: 22.0, v04: 31.0, v05: 37.0, v06: 45.5, v07: 50.0, v08: 56.0, v09: 67.5, v10: 71.0, v11: 84.0, v12: 92.0, v13: 104.5, v14: 110.5, v15: 123.5, v16: 131.5, v17: 139.0 };
let WORDS = {}, DURS = {};
const nrm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const Wd = (id, word, n = 0) => { let k = 0; for (const [w, a] of WORDS[id] || []) if (nrm(w) === nrm(word) && k++ === n) return VO[id] + Math.max(0, a); throw new Error(`word ${word} not in ${id}`); };

const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eo = t => 1 - Math.pow(1 - clamp(t), 3);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const hsh = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100003; return h; };

// ───────── colours
const COL = { amber: hex('#f2a33a'), mint: hex('#5fc79a'), hoodie: hex('#5f7fa3'), skin: hex('#c38a66'), hair: hex('#2a211d'), pants: hex('#4a4f5c'), wood: hex('#c79a68'),
  lamp: hex('#f0cf7a'), screen: hex('#d9e2e6'), dark: hex('#3a3f4c'), sky: hex('#f4c99a'), sky2: hex('#a9c3d8'), wall: hex('#e6d6b8'), plant: hex('#7fa04a'), tape: hex('#f0b23e'), red: hex('#c9573f'), phone: hex('#2f3440') };
const LOOK = { skin: COL.skin, top: COL.hoodie, bottom: COL.pants, hair: COL.hair, pants: 1, sleeve: 'long', hairVol: 1.05, torso: [.08, .086, .106], shoe: hex('#e8e4da') };

// ───────── events + subtitles
export const EV = [], SUBS = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });

// ───────── stroke cache and drawing helpers (world coordinates)
const SK = new Map();
const stk = (key, pts, o = {}) => { let s = SK.get(key); if (!s) { s = penStroke(pts, { w: o.w ?? 2.3, wob: o.wob ?? 1, seed: o.seed ?? hsh(key), over: o.over ?? 5, gap: o.gap ?? .35, smooth: o.smooth }); SK.set(key, s); } return s; };
const ln = (c, key, pts, p = 1, o = {}) => { if (p > 0) drawPen(c, stk(key, pts, o), p, INK, o.alpha ?? 1); };
const loop = (c, key, pts, p = 1, o = {}) => ln(c, key, [...pts, pts[0], pts[1]], p, { smooth: false, ...o });
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const rrect = (x, y, w, h, r) => { const P = []; for (const [cx, cy, a0] of [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]]) for (let k = 0; k <= 4; k++) { const a = a0 + k / 4 * Math.PI / 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return P; };
// a timed draw-on: fraction of a stroke drawn between t0 and t0+d; sound event registered once per stroke
const PEN_EV = new Set();
const dp = (t, t0, d, key) => { if (key && !PEN_EV.has(key)) { PEN_EV.add(key); ev(t0, 'pen', { d }); } return seg(t, t0, t0 + d); };

// ───────── colour state for the current frame: washes are drawn only inside the coloured region
let CLR = null;   // { kind: 'none' | 'all' | 'circle', x, y, r }
function noisyCircle(c, x, y, r, seed = 3) {
  c.beginPath();
  for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU, k = 1 + .14 * (n2(Math.cos(a) * 2 + 9, Math.sin(a) * 2, seed) - .5) * 2 + .05 * (n2(Math.cos(a) * 9, Math.sin(a) * 9, seed + 4) - .5);
    const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath();
}
const clipFn = cl => cl && cl.kind === 'circle' ? (c => noisyCircle(c, cl.x, cl.y, cl.r, cl.seed ?? 3)) : null;
function W8(c, poly, col, o = {}, cl = CLR) {      // a wash under the current colour state
  if (!cl || cl.kind === 'none') return;
  c.save(); if (cl.kind === 'circle') { noisyCircle(c, cl.x, cl.y, cl.r, cl.seed ?? 3); c.clip(); }
  wash(c, poly, col, { a: o.a ?? .5, j: o.j ?? 5, layers: o.layers ?? 3, edge: o.edge ?? .3, seed: o.seed ?? 7, dx: o.dx ?? 3, dy: o.dy ?? 2 });
  c.restore();
}
function wetFront(c, cl) {                      // darker band where the colour front is still wet
  if (!cl || cl.kind !== 'circle' || cl.r <= 0 || cl.r > 3200) return;
  c.save(); noisyCircle(c, cl.x, cl.y, cl.r, cl.seed ?? 3); c.strokeStyle = rgba(mix3(cl.col ?? COL.amber, [60, 50, 40], .25), .16); c.lineWidth = 22; c.stroke();
  c.strokeStyle = rgba(mix3(cl.col ?? COL.amber, [60, 50, 40], .3), .22); c.lineWidth = 4; c.stroke(); c.restore();
}

// ───────── paper (one texture for every page)
let PAPERC = null;
function makePaper() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  c.fillStyle = rgba(PAPER); c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 12) for (let x = 0; x < W; x += 12) { const v = fbm(x * .0016, y * .0016, 3) - .5, u = fbm(x * .012, y * .012, 9) - .5;
    c.fillStyle = v + u * .4 > 0 ? `rgba(255,252,240,${Math.min(.18, (v + u * .4) * .5)})` : `rgba(150,120,80,${Math.min(.08, -(v + u * .4) * .22)})`; c.fillRect(x, y, 12, 12); }
  const r = rng(11); for (let i = 0; i < 90000; i++) { c.fillStyle = r() < .5 ? 'rgba(120,95,60,.07)' : 'rgba(255,255,250,.18)'; c.fillRect(r() * W, r() * H, 1 + r() * 1.4, 1 + r()); }
  // the gutter between the two pages of a spread
  const g = c.createLinearGradient(W / 2 - 60, 0, W / 2 + 60, 0); g.addColorStop(0, 'rgba(120,95,60,0)'); g.addColorStop(.5, 'rgba(120,95,60,.13)'); g.addColorStop(1, 'rgba(120,95,60,0)');
  c.fillStyle = g; c.fillRect(W / 2 - 60, 0, 120, H);
  return cv;
}

// ───────── people: one student, sketched (face left blank, as the style asks)
function seatedPose(t, o = {}) {
  const slump = o.slump ?? 0;
  return { hipY: .27, hipZ: 0, lean: .18 + slump * .2, side: o.side ?? 0, nod: -.15 - slump * .35 + (o.nod ?? 0), headYaw: o.headYaw ?? 0,
    footL: V(-.1, .02, .24), footR: V(.1, .02, .27), kneePole: V(0, .3, 1),
    handL: o.handL ?? V(-.13, .44, .36), handR: o.handR ?? V(.15, .44, .38 + .02 * Math.sin(t * 2.1)), elbL: V(-1, -.4, -.2), elbR: V(1, -.4, -.2) };
}
const boil = t => Math.floor(t * 12);
function student(c, t, place, pose, o = {}) {
  const prims = figure(LOOK, pose, place, { seed: 21, boil: o.still ? 0 : boil(t) % 3 });
  drawPrims(c, prims, { color: o.color ?? 0, ink: o.ink ?? 1, clip: o.clip, knock: 1 });
  return prims;
}
// a stylus seen from above, tip at (x, y)
function stylus(c, key, x, y, ang = -2.3, len = 150) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy * 6, ny = dx * 6, b = [x - dx * len, y - dy * len];
  ln(c, key + 'a', [[x, y], [b[0] + nx, b[1] + ny]], 1, { w: 1.8, over: 2, gap: 0, smooth: false });
  ln(c, key + 'b', [[x, y], [b[0] - nx, b[1] - ny]], 1, { w: 1.8, over: 2, gap: 0, smooth: false });
}

// ═════════════ SPREAD 1 · the desk at night (ink only; one coloured thing)
const DESK = { gx: 640, gy: 930, S: 560 };
function proj(gx, gy, S) { return (x, y, z) => [gx + x * S, gy - (y + z * .28) * S]; }
function spread1(c, t, T) {
  const P = proj(DESK.gx, DESK.gy, DESK.S);
  // corner note
  handwrite(c, '11:40 pm · two days before the exam', 90, 120, 46, dp(t, .4, 1.8, 's1note'), { font: '"Reenie Beanie"' });
  // desk (top surface seen from behind), lamp, laptop, tablet
  const desk = [P(-.62, .44, .22), P(.66, .44, .22), P(.66, .44, .82), P(-.62, .44, .82)];
  loop(c, 'desk', desk, dp(t, 1.4, 1.1, 'desk'), { w: 2.6 });
  ln(c, 'deskL1', [P(-.6, .44, .22), P(-.6, 0, .22)], dp(t, 2.3, .5), { w: 2.2 });
  ln(c, 'deskL2', [P(.64, .44, .22), P(.64, 0, .22)], dp(t, 2.4, .5), { w: 2.2 });
  // laptop: screen faces the student
  const lap = [P(-.28, .44, .62), P(.2, .44, .62), P(.2, .74, .7), P(-.28, .74, .7)];
  W8(c, lap, COL.screen, { a: .35 }); loop(c, 'laptop', lap, dp(t, 2.9, .8, 'laptop'), { w: 2.2 });
  ln(c, 'lapbase', [P(-.3, .44, .58), P(.22, .44, .58)], dp(t, 3.4, .4), { w: 2 });
  // tablet lying on the desk to the right
  const tab = [P(.3, .44, .36), P(.56, .44, .36), P(.56, .44, .58), P(.3, .44, .58)];
  loop(c, 'tablet', tab, dp(t, 3.8, .6, 'tablet'), { w: 2 });
  // desk lamp: base, arm, shade, and the light as a few ink rays
  ln(c, 'lampArm', [P(-.5, .44, .7), P(-.5, .7, .72), P(-.36, .86, .66)], dp(t, 4.3, .7, 'lamp'), { w: 2.2 });
  loop(c, 'lampShade', [P(-.42, .9, .62), P(-.26, .84, .62), P(-.3, .76, .62), P(-.42, .8, .62)], dp(t, 4.8, .5), { w: 2.2 });
  W8(c, [P(-.32, .78, .6), P(-.05, .44, .4), P(-.5, .44, .4)], COL.lamp, { a: .25 });
  for (let k = 0; k < 3; k++) ln(c, 'ray' + k, [P(-.3 + k * .05, .76, .6), P(-.25 + k * .1, .6, .55)], dp(t, 5.2 + k * .1, .3), { w: 1.2, alpha: .6 });
  // the student, from behind, at the desk
  const slump = T.slump(t);
  student(c, t, { x: DESK.gx, y: DESK.gy + 40, S: DESK.S * 1.02, yaw: 0 }, seatedPose(t, { slump }), { ink: seg(t, 5.4, 8.4), color: 0 });
  // chair back
  ln(c, 'chair', [P(-.2, .27, -.05), P(-.22, .66, -.08)], dp(t, 7.6, .4), { w: 2.4 });
  ln(c, 'chair2', [P(.2, .27, -.05), P(.22, .66, -.08)], dp(t, 7.8, .4), { w: 2.4 });

  // ── vignette A: the tablet up close (a paid notebook app, unnamed)
  vignetteA(c, t, T);
  // ── vignette B: the laptop chat with the AI, and the one coloured thing
  vignetteB(c, t, T);
  // ── vignette C: his notes, where the screenshot ends up
  vignetteC(c, t, T);
}
const VA = { x: 1300, y: 120, w: 980, h: 560 };
function vignetteA(c, t, T) {
  const { x, y, w, h } = VA, p0 = T.va0;
  loop(c, 'vaFrame', rrect(x, y, w, h, 36), dp(t, p0, .9, 'vaF'), { w: 2.6 });
  loop(c, 'vaScreen', rrect(x + 34, y + 34, w - 68, h - 68, 10), dp(t, p0 + .5, .7), { w: 1.6 });
  handwrite(c, 'My notebooks', x + 70, y + 100, 44, dp(t, p0 + .8, .6, 'vaT'), { font: 'Caveat', weight: 600 });
  for (let i = 0; i < 3; i++) { const bx = x + 70 + i * 205, by = y + 140; loop(c, 'nb' + i, rect(bx, by, 170, 220), dp(t, p0 + 1 + i * .15, .4), { w: 1.8 });
    handwrite(c, ['Physics', 'Maths', 'Algorithms'][i], bx + 14, by + 260, 30, dp(t, p0 + 1.2 + i * .15, .4)); }
  // "+ New notebook" tile, dashed
  const nx = x + 70 + 3 * 205, ny = y + 140;
  for (let k = 0; k < 8; k++) { const pts = rect(nx, ny, 170, 220); const a = pts[Math.floor(k / 2) % 4], b = pts[(Math.floor(k / 2) + 1) % 4], u0 = (k % 2) * .5, u1 = u0 + .32;
    ln(c, 'dash' + k, [[lerp(a[0], b[0], u0), lerp(a[1], b[1], u0)], [lerp(a[0], b[0], u1), lerp(a[1], b[1], u1)]], dp(t, p0 + 1.5, .3), { w: 1.4, over: 1, gap: 0 }); }
  handwrite(c, '+ New notebook', nx + 8, ny + 120, 32, dp(t, p0 + 1.6, .4));
  // stylus taps "+ New notebook", then later "Import PDF"
  if (t > T.tap1 - .6 && t < T.card1) stylus(c, 'styA', nx + 85 + 20 * (1 - seg(t, T.tap1 - .6, T.tap1)), ny + 110 - 30 * (1 - seg(t, T.tap1 - .6, T.tap1)));
  // card 1: the paywall (erased from the tail before card 2)
  const card = (key, l1, l2, t0, erase) => {
    const cw = 640, ch = 260, cx = x + (w - cw) / 2, cy = y + 150;
    if (t < t0) return; const e = erase ? seg(t, erase, erase + .5) : 0;
    c.save(); c.fillStyle = rgba(PAPER, .94 * (1 - e) * seg(t, t0, t0 + .35)); c.beginPath(); rrect(cx, cy, cw, ch, 14).forEach(([a, b], i) => i ? c.lineTo(a, b) : c.moveTo(a, b)); c.fill(); c.restore();
    if (e < 1) { drawPen(c, stk(key + 'b', [...rrect(cx, cy, cw, ch, 14), [cx + cw - 14, cy]], { w: 2.4, smooth: false }), seg(t, t0, t0 + .5), INK, 1, e);
      handwrite(c, l1, cx + 40, cy + 80, 44, seg(t, t0 + .3, t0 + .9) * (1 - e), { font: 'Caveat', weight: 700 });
      handwrite(c, l2, cx + 40, cy + 135, 36, seg(t, t0 + .7, t0 + 1.3) * (1 - e));
      loop(c, key + 'btn', rrect(cx + 40, cy + 170, 190, 58, 10), seg(t, t0 + 1, t0 + 1.3) * (1 - e), { w: 2 });
      handwrite(c, 'Upgrade', cx + 70, cy + 210, 34, seg(t, t0 + 1.2, t0 + 1.6) * (1 - e), { weight: 700 });
      for (let k = 0; k < 4; k++) ln(c, key + 'lock' + k, [[cx + cw - 90 + k * 6, cy + 40], [cx + cw - 90 + k * 6, cy + 60]], seg(t, t0 + .2, t0 + .5) * (1 - e), { w: 1.4 });
      loop(c, key + 'lk', rect(cx + cw - 100, cy + 58, 44, 36), seg(t, t0 + .2, t0 + .5) * (1 - e), { w: 2 }); }
  };
  card('c1', 'Notebook limit reached.', 'Upgrade to keep writing.', T.card1, T.card1x);
  if (t > T.tap2 - .6 && t < T.card2) stylus(c, 'styA2', x + w - 160, y + 70 + 20 * (1 - seg(t, T.tap2 - .6, T.tap2)));
  if (t > T.card1x) handwrite(c, 'Import PDF', x + w - 230, y + 85, 30, seg(t, T.card1x + .3, T.card1x + .8));
  card('c2', 'Importing PDFs is a', 'Premium feature.', T.card2, null);
  // margin note: "again?" with an arrow
  handwrite(c, 'again?', x + w - 120, y + h + 70, 50, dp(t, T.again, .7, 'again'), { font: '"Reenie Beanie"', rot: -.08 });
  ln(c, 'againArrow', [[x + w - 70, y + h + 20], [x + w - 120, y + h - 60]], dp(t, T.again + .5, .4), { w: 2 });
}
const VB = { x: 1300, y: 780, w: 980, h: 500 };
export const waveY = (u, f, ph) => Math.exp(-u * 1.6) * Math.sin(u * f * TAU + ph);
function wavePts(x, y, w, h, f, ph, n = 90) { const P = []; for (let i = 0; i <= n; i++) { const u = i / n; P.push([x + u * w, y + h / 2 - waveY(u, f, ph) * h * .45]); } return P; }
function vignetteB(c, t, T) {
  const { x, y, w, h } = VB, p0 = T.vb0;
  loop(c, 'vbFrame', rrect(x, y, w, h, 18), dp(t, p0, .8, 'vbF'), { w: 2.6 });
  ln(c, 'vbBar', [[x, y + 54], [x + w, y + 54]], dp(t, p0 + .4, .4), { w: 1.6 });
  for (let k = 0; k < 3; k++) loop(c, 'vbDot' + k, ellipse(x + 30 + k * 26, y + 27, 7, 7, 10), dp(t, p0 + .5, .3), { w: 1.4 });
  // his message (typed: handwriting appears character by character)
  const msg = 'visualise a damped oscillator';
  loop(c, 'vbU', rrect(x + w - 560, y + 80, 520, 70, 22), dp(t, T.type0 - .3, .4), { w: 1.8 });
  handwrite(c, msg, x + w - 535, y + 128, 36, seg(t, T.type0, T.type1));
  // the reply: the visualiser (wave + slider). This is the only colour in the film so far.
  const bx = x + 40, by = y + 175, bw = w - 80, bh = 270;
  loop(c, 'vbR', rrect(bx, by, bw, bh, 16), dp(t, T.reply, .6, 'vbR'), { w: 2 });
  const f = 3 + 2.2 * ss(seg(t, T.drag0, T.drag1)) * (t < T.shot ? 1 : 1);
  const ph = T.live(t);
  const wp = wavePts(bx + 30, by + 20, bw - 60, 170, f, ph);
  const bloom = { kind: 'circle', x: bx + bw / 2, y: by + 100, r: 900 * eo(seg(t, T.bloom, T.bloom + 1.2)), seed: 5, col: COL.amber };
  
  // wave: an amber wash band along the line, then the ink line drawn on
  if (t > T.bloom) { const band = [...wp.map(([a, b]) => [a, b - 7]), ...wp.slice().reverse().map(([a, b]) => [a, b + 7])]; W8(c, band, COL.amber, { a: .85, j: 2, edge: .4 }, bloom);
    const env = [...wp.map(([a], i) => [a, by + 105 - Math.exp(-i / 90 * 1.6) * 80]), ...wp.slice().reverse().map(([a], i) => [a, by + 105 + Math.exp(-(90 - i) / 90 * 1.6) * 80])];
    W8(c, env, COL.mint, { a: .3, j: 5 }, bloom); }
  const waveP = dp(t, T.wave0, 1.4, 'wave');
  drawPen(c, penStroke(wp, { w: 2.4, wob: .6, seed: 77, over: 2, smooth: false }), waveP, INK, 1);
  // slider
  const sx = bx + 60, sy = by + 230, sw = 420, k = .25 + .5 * ss(seg(t, T.drag0, T.drag1));
  ln(c, 'slTrack', [[sx, sy], [sx + sw, sy]], dp(t, T.wave0 + .8, .5), { w: 2 });
  if (t > T.wave0 + 1.2) { const hx = sx + sw * k; loop(c, 'slH' + Math.round(k * 40), ellipse(hx, sy, 14, 14, 14), 1, { w: 2 });
    W8(c, ellipse(hx, sy, 13, 13, 14), COL.amber, { a: .9, j: 1.5 }, bloom); }
  handwrite(c, `frequency  ${f.toFixed(1)} Hz`, sx + sw + 40, sy + 10, 30, seg(t, T.wave0 + 1, T.wave0 + 1.6));
  if (t > T.drag0 - .5 && t < T.drag1 + .6) stylus(c, 'styB', sx + sw * k + 4, sy + 6, -2.0, 160);
}
const VC = { x: 120, y: 1010, w: 980, h: 290 };
function vignetteC(c, t, T) {
  const { x, y, w, h } = VC, p0 = T.vc0;
  loop(c, 'vcFrame', rect(x, y, w, h), dp(t, p0, .7, 'vcF'), { w: 2.2 });
  for (let k = 0; k < 5; k++) ln(c, 'vcRule' + k, [[x + 20, y + 50 + k * 48], [x + w - 20, y + 50 + k * 48]], dp(t, p0 + .3 + k * .05, .4), { w: .9, alpha: .45 });
  handwrite(c, 'Damped oscillations', x + 30, y + 40, 38, dp(t, p0 + .5, .7, 'vcT'), { font: 'Caveat', weight: 600 });
  handwrite(c, 'x(t) = A·e^−γt · cos ωt', x + 30, y + 132, 34, dp(t, p0 + .9, .8));
  // the screenshot flies from the chat to the notes, then its colour drains away
  if (t > T.shot) {
    const k = eio(seg(t, T.shot + .15, T.shot + .95));
    const sx = lerp(VB.x + 40, x + 520, k), sy = lerp(VB.y + 175, y + 20, k), sc = lerp(1, .44, k), bw = (VB.w - 80) * sc, bh = 270 * sc;
    c.save(); c.fillStyle = rgba(PAPER, .97); c.fillRect(sx, sy, bw, bh); c.restore();
    loop(c, 'shotFrame' + Math.round(k * 20), rect(sx, sy, bw, bh), 1, { w: 1.8 });
    const drain = seg(t, T.drain0, T.drain1);
    const wp = wavePts(sx + 30 * sc, sy + 20 * sc, bw - 60 * sc, 170 * sc, 5.2, T.live(T.shot));
    const col = mix3(COL.amber, [150, 140, 130], drain);
    const band = [...wp.map(([a, b]) => [a, b - 6 * sc]), ...wp.slice().reverse().map(([a, b]) => [a, b + 6 * sc])];
    c.save(); wash(c, band, col, { a: .85 * (1 - drain * .75), j: 1.5, layers: 2, edge: .3, seed: 9 }); c.restore();
    drawPen(c, penStroke(wp, { w: 2 * Math.max(.6, sc), wob: .5, seed: 78, over: 1, smooth: false }), 1, INK, 1);
    if (drain > .9) handwrite(c, '(just a picture now)', sx + 10, sy + bh + 34, 26, seg(t, T.drain1, T.drain1 + .8), { font: '"Reenie Beanie"' });
  }
}

// ═════════════ SPREAD 2 · the question
function spread2(c, t, T) {
  handwrite(c, '12:20 am', 90, 120, 46, dp(t, T.s2 + .2, .6, 's2note'), { font: '"Reenie Beanie"' });
  const x = 160, y = 230, w = 1300, h = 820;
  loop(c, 's2lap', rrect(x, y, w, h, 24), dp(t, T.s2 + .3, 1, 's2lap'), { w: 2.8 });
  loop(c, 's2scr', rrect(x + 40, y + 40, w - 80, h - 80, 10), dp(t, T.s2 + .8, .8), { w: 1.6 });
  ln(c, 's2base', [[x - 120, y + h + 40], [x + w + 120, y + h + 40], [x + w + 40, y + h], [x - 40, y + h]], dp(t, T.s2 + 1, .7), { w: 2.4, smooth: false });
  // the question, typed into the chat
  const q1 = 'Can we build a notebook that is free,', q2 = 'works offline, and lets these run', q3 = 'inside my pages?';
  loop(c, 's2in', rrect(x + 90, y + 420, w - 180, 260, 26), dp(t, T.q0 - .4, .5), { w: 2 });
  const L = [q1, q2, q3], tot = q1.length + q2.length + q3.length, n = Math.floor(tot * seg(t, T.q0, T.q1));
  let used = 0; L.forEach((s, i) => { const k = clamp((n - used) / s.length); used += s.length; handwrite(c, s, x + 130, y + 500 + i * 66, 50, k, { weight: 500 }); });
  if (t > T.send) { loop(c, 's2rep', rrect(x + 90, y + 120, 640, 120, 26), dp(t, T.send + .4, .5), { w: 2 }); handwrite(c, "Let's build it together.", x + 130, y + 196, 48, seg(t, T.send + .7, T.send + 1.6), { weight: 600 }); }
  // right page: him, thinking, pencil in hand
  student(c, t, { x: 1880, y: 1180, S: 640, yaw: -.5 }, seatedPose(t, { slump: 0, nod: .1, headYaw: -.3 }), { ink: seg(t, T.s2 + 1.2, T.s2 + 3.5), color: 0 });
}
// ═════════════ the nights (a page each)
function night(c, t, T, i) {
  const t0 = T.nights[i], notes = ['night 1 · the ink lags behind the pen', 'night 9 · pages turn black', 'night 17 · paste → Save → ?', 'night 23 · 5:10 am'];
  handwrite(c, notes[i], 140, 190, 92, dp(t, t0 + .25, 1, 'nn' + i), { font: '"Reenie Beanie"' });
  if (i === 0) { // wireframe of the app: toolbar, sidebar, page
    loop(c, 'wf0', rect(300, 260, 1800, 900), dp(t, t0 + .4, .9, 'wf0'), { w: 2.4 });
    ln(c, 'wf1', [[300, 360], [2100, 360]], dp(t, t0 + .9, .5), { w: 2 }); ln(c, 'wf2', [[620, 360], [620, 1160]], dp(t, t0 + 1.1, .5), { w: 2 });
    for (let k = 0; k < 3; k++) loop(c, 'wft' + k, rect(360, 420 + k * 240, 200, 200), dp(t, t0 + 1.3 + k * .15, .3), { w: 1.6 });
    loop(c, 'wfp', rect(900, 420, 900, 700), dp(t, t0 + 1.4, .5), { w: 2 });
    // the lag: a pen stroke with its ink trailing behind
    const sq = []; for (let k = 0; k <= 60; k++) sq.push([980 + k * 12, 760 + Math.sin(k * .35) * 80]);
    ln(c, 'lagInk', sq, dp(t, t0 + 1.6, 1.2), { w: 3 }); stylus(c, 'styN', 980 + 720 * seg(t, t0 + 1.6, t0 + 2.4), 760 + Math.sin(60 * seg(t, t0 + 1.6, t0 + 2.4) * .35) * 80);
  }
  if (i === 1) { // a page gone black, cross-hatched; then a tick: fixed
    loop(c, 'bk', rect(700, 280, 1000, 820), dp(t, t0 + .4, .7, 'bk'), { w: 2.4 });
    c.save(); c.beginPath(); c.rect(700, 280, 1000, 820); c.clip();
    for (let k = 0; k < 60; k++) ln(c, 'hatch' + k, [[700 + k * 22, 280], [700 + k * 22 - 320, 1100]], seg(t, t0 + .7 + k * .01, t0 + .9 + k * .01), { w: 1.8, alpha: .85, over: 0, gap: 0 });
    for (let k = 0; k < 60; k++) ln(c, 'hatchB' + k, [[380 + k * 22, 280], [380 + k * 22 + 320, 1100]], seg(t, t0 + 1.1 + k * .01, t0 + 1.3 + k * .01), { w: 1.6, alpha: .7, over: 0, gap: 0 });
    c.restore();
    if (t > t0 + 1.9) { ln(c, 'tick', [[1820, 760], [1900, 860], [2120, 560]], dp(t, t0 + 1.9, .5, 'tick'), { w: 4, smooth: false }); handwrite(c, 'fixed', 1860, 980, 72, seg(t, t0 + 2.2, t0 + 2.8), { font: '"Reenie Beanie"' }); }
  }
  if (i === 2) { // code in the margin
    const code = ['<iframe sandbox="allow-scripts"', '        srcdoc={artifact} />', '', 'paste  →  Save  →  it runs?'];
    code.forEach((s, k) => handwrite(c, s, 420, 420 + k * 120, 70, dp(t, t0 + .5 + k * .45, .7, 'code' + k)));
  }
  if (i === 3) { // the pen hovers, then starts a tablet outline
    loop(c, 'n23tab', rrect(700, 300, 1000, 760, 40), dp(t, t0 + 1.4, 1.6, 'n23'), { w: 2.6 });
    stylus(c, 'styN3', 700 + 1000 * seg(t, t0 + 1.4, t0 + 2.2), 300 + 20 * Math.sin(t * 3));
  }
}

// ═════════════ SPREAD 3 · dawn: OpenNote runs, colour arrives
const TB = { x: 200, y: 140, w: 1250, h: 1080 };
function spread3(c, t, T) {
  const { x, y, w, h } = TB, p0 = T.s3;
  handwrite(c, '6:05 am', 90, 110, 46, dp(t, p0 + .2, .6, 's3note'), { font: '"Reenie Beanie"' });
  // dawn window (top right of the left page) and the plant: they only show their colour once it arrives
  const wx0 = 1600, wy0 = 120, ww = 640, wh = 300;
  W8(c, rect(wx0 + 8, wy0 + 8, ww - 16, wh * .55), COL.sky2, { a: .45, j: 8 }); W8(c, rect(wx0 + 8, wy0 + wh * .45, ww - 16, wh * .5), COL.sky, { a: .55, j: 8 });
  loop(c, 'win', rect(wx0, wy0, ww, wh), dp(t, p0 + .3, .8, 'win'), { w: 2.4 }); ln(c, 'winM', [[wx0 + ww / 2, wy0], [wx0 + ww / 2, wy0 + wh]], dp(t, p0 + .8, .4), { w: 2 });
  ln(c, 'sun', ellipse(wx0 + 470, wy0 + 200, 40, 40, 20), dp(t, p0 + 1, .4), { w: 1.6 }); W8(c, ellipse(wx0 + 470, wy0 + 200, 40, 40, 20), hex('#f6b85a'), { a: .7, j: 3 });
  // plant on the sill and a mug
  const pot = [[1660, 400], [1760, 400], [1745, 470], [1675, 470]]; W8(c, pot, COL.red, { a: .55 }); loop(c, 'pot', pot, dp(t, p0 + 1.2, .4), { w: 2 });
  for (let k = 0; k < 7; k++) { const a = -2.6 + k * .32, lf = ellipse(1710 + Math.cos(a) * 55, 380 + Math.sin(a) * 60, 26, 11, 12, a); W8(c, lf, COL.plant, { a: .6, j: 2, seed: 40 + k }); loop(c, 'leaf' + k, lf, dp(t, p0 + 1.4 + k * .05, .3), { w: 1.4 }); }
  const mug = rrect(2140, 330, 70, 84, 8); W8(c, mug, COL.hoodie, { a: .5 }); loop(c, 'mug', mug, dp(t, p0 + 1.6, .4), { w: 2 }); ln(c, 'mugH', ellipse(2215, 372, 18, 22, 14, -1.4).slice(0, 9), dp(t, p0 + 1.9, .3), { w: 2 });
  // the tablet with OpenNote, drawn as a sketch of the real UI
  loop(c, 's3tab', rrect(x, y, w, h, 40), dp(t, p0, 1, 's3tab'), { w: 2.8 });
  const sx = x + 40, sy = y + 40, sw = w - 80, sh = h - 80;
  loop(c, 's3scr', rect(sx, sy, sw, sh), dp(t, p0 + .4, .8), { w: 1.6 });
  ln(c, 's3bar', [[sx, sy + 64], [sx + sw, sy + 64]], dp(t, p0 + .6, .5), { w: 1.6 });
  handwrite(c, 'Physics 201', sx + 30, sy + 46, 36, dp(t, p0 + .7, .5), { weight: 700 });
  for (let k = 0; k < 7; k++) loop(c, 's3tool' + k, ellipse(sx + 330 + k * 52, sy + 32, 13, 13, 10), dp(t, p0 + .8 + k * .04, .2), { w: 1.4 });
  ln(c, 's3side', [[sx + 200, sy + 64], [sx + 200, sy + sh]], dp(t, p0 + .7, .5), { w: 1.6 });
  for (let k = 0; k < 3; k++) loop(c, 's3th' + k, rect(sx + 30, sy + 100 + k * 190, 140, 170), dp(t, p0 + .9 + k * .1, .3), { w: 1.4 });
  W8(c, rect(sx + 30, sy + 290, 140, 170), COL.mint, { a: .3 });
  // the page column: handwritten notes above, the live page below
  const px = sx + 250, pw = sw - 290;
  handwrite(c, 'Damped oscillations', px + 20, sy + 130, 40, dp(t, p0 + 1, .7), { weight: 600 });
  handwrite(c, 'x(t) = A·e^−γt · cos ωt', px + 20, sy + 190, 34, dp(t, p0 + 1.3, .8));
  // the live page (after Save): mint edge, LIVE tag, the running wave and its slider
  const ly = sy + 250, lh = 560;
  if (t > T.save) {
    const lp = dp(t, T.save + .1, .8, 'livepage');
    loop(c, 's3live', rect(px, ly, pw, lh), lp, { w: 2.2 });
    W8(c, rect(px - 4, ly, 10, lh), COL.mint, { a: .9, j: 1.5 });
    loop(c, 's3tag', rrect(px + 20, ly + 18, 86, 40, 8), lp, { w: 1.6 }); handwrite(c, 'LIVE', px + 32, ly + 50, 30, lp, { weight: 700 });
    W8(c, rrect(px + 20, ly + 18, 86, 40, 8), COL.mint, { a: .5 });
    handwrite(c, 'Damped oscillator', px + 130, ly + 50, 32, lp, { weight: 600 });
    const wy = ly + 90, wh = 300, f = 3 + 1.4 * Math.sin((t - T.save) * .5) * .5;
    
    const wp = wavePts(px + 40, wy + 30, pw - 80, wh - 60, f, T.live(t));
    W8(c, [...wp.map(([a, b]) => [a, b - 7]), ...wp.slice().reverse().map(([a, b]) => [a, b + 7])], COL.amber, { a: .85, j: 2 });
    drawPen(c, penStroke(wp, { w: 2.4, wob: .6, seed: 79, over: 2, smooth: false }), lp, INK, 1);
    ln(c, 's3sl', [[px + 60, wy + wh + 70], [px + 480, wy + wh + 70]], lp, { w: 2 }); loop(c, 's3slh', ellipse(px + 60 + 420 * (.4 + .2 * Math.sin(t * .8)), wy + wh + 70, 13, 13, 12), lp, { w: 2 });
    // he writes on top of the running wave
    const pk = wp[Math.round(wp.length * .08)];
    loop(c, 'maxC', ellipse(pk[0] + 8, pk[1], 46, 40, 24), dp(t, T.ann0, .8, 'maxC'), { w: 2.6 });
    handwrite(c, 'max!', pk[0] + 70, pk[1] - 10, 54, seg(t, T.ann0 + .8, T.ann0 + 1.5), { font: '"Reenie Beanie"' });
    if (t > T.ann0 - .5 && t < T.ann0 + 1.8) { const k = seg(t, T.ann0, T.ann0 + 1.5); stylus(c, 'styS3', pk[0] + 8 + Math.cos(k * TAU * 1.2) * 46 + k * 80, pk[1] + Math.sin(k * TAU * 1.2) * 40); }
  }
  // the paste sheet before Save
  if (t > T.sheet0 && t < T.save + .4) {
    const e = seg(t, T.save + .05, T.save + .4), qx = sx + 300, qy = sy + 300, qw = 760, qh = 420;
    c.save(); c.fillStyle = rgba(PAPER, .95 * (1 - e)); c.fillRect(qx, qy, qw, qh); c.restore();
    if (e < 1) { drawPen(c, stk('sheetB', [...rect(qx, qy, qw, qh), [qx, qy]], { w: 2.2, smooth: false }), seg(t, T.sheet0, T.sheet0 + .4), INK, 1, e);
      handwrite(c, 'New live page', qx + 30, qy + 56, 40, seg(t, T.sheet0 + .2, T.sheet0 + .7) * (1 - e), { weight: 700 });
      ['<!DOCTYPE html>', '<canvas id="plot">', '<script> draw(t) …'].forEach((s, k) => handwrite(c, s, qx + 40, qy + 130 + k * 52, 32, seg(t, T.sheet0 + .4 + k * .12, T.sheet0 + .8 + k * .12) * (1 - e)));
      loop(c, 'saveB', rrect(qx + qw - 190, qy + qh - 90, 150, 60, 10), seg(t, T.sheet0 + .6, T.sheet0 + .9) * (1 - e), { w: 2.2 });
      handwrite(c, 'Save', qx + qw - 155, qy + qh - 47, 38, seg(t, T.sheet0 + .8, T.sheet0 + 1.1) * (1 - e), { weight: 700 });
      if (t > T.save - .6) stylus(c, 'stySave', qx + qw - 115, qy + qh - 60 + 20 * (1 - seg(t, T.save - .6, T.save)), -2.2, 170); }
  }
  // the right page: him, now in colour, and three small vignettes
  vLecture(c, t, T); vTape(c, t, T); vSync(c, t, T);
}
function vLecture(c, t, T) {
  const x = 1560, y = 470, p0 = T.vl0;
  handwrite(c, 'γ = b / 2m', x, y + 60, 52, dp(t, p0, .7, 'vl'), { weight: 600 });
  loop(c, 'vlBar', rrect(x, y + 100, 700, 70, 14), dp(t, p0 + .3, .6), { w: 2 });
  for (let k = 0; k < 30; k++) { const v = .3 + .7 * Math.abs(Math.sin(k * 1.7) * Math.cos(k * .43)); ln(c, 'vlb' + k, [[x + 90 + k * 14, y + 135 - v * 22], [x + 90 + k * 14, y + 135 + v * 22]], dp(t, p0 + .5 + k * .01, .2), { w: 2.4, over: 0, gap: 0 }); }
  if (t > p0 + .6) W8(c, rect(x + 80, y + 108, 14 * 30 * (t > T.tapL ? .55 : .2), 54), COL.amber, { a: .45, j: 3 });
  handwrite(c, 'Tap ink to seek', x + 520, y + 146, 28, dp(t, p0 + .7, .5));
  if (t > T.tapL) for (let k = 0; k < 3; k++) { const u = seg(t, T.tapL + k * .12, T.tapL + .6 + k * .12); ln(c, 'snd' + k, [[x + 120, y + 50 - k * 10], [x + 200 + k * 40, y + 80], [x + 300, y + 110]], u, { w: 1.6, alpha: .7 }); }
  if (t > T.tapL - .6 && t < T.tapL + .8) stylus(c, 'styL', x + 110, y + 40 + 20 * (1 - seg(t, T.tapL - .6, T.tapL)), -2.2, 150);
}
function vTape(c, t, T) {
  const x = 1560, y = 720, p0 = T.vt0;
  handwrite(c, 'ζ < 1  →  underdamped', x, y + 60, 50, dp(t, p0, .8, 'vt'));
  const k = ss(seg(t, T.tapeD0, T.tapeD1)); if (k > 0) { const tp = rect(x + 200, y + 18, 330 * k, 58); W8(c, tp, COL.tape, { a: .95, j: 2, edge: .4 }); loop(c, 'tapeO' + Math.round(k * 10), tp, 1, { w: 1.4, alpha: .7 }); }
  if (t > T.card) { loop(c, 'fc', rrect(x + 120, y + 120, 420, 150, 14), dp(t, T.card, .5, 'fc'), { w: 2.2 }); handwrite(c, 'ζ < 1 → ?', x + 160, y + 210, 48, seg(t, T.card + .3, T.card + .9)); handwrite(c, 'flashcard', x + 380, y + 255, 26, seg(t, T.card + .5, T.card + 1), { font: '"Reenie Beanie"' }); }
}
function vSync(c, t, T) {
  const x = 1600, y = 1050, p0 = T.vs0;
  const cloud = [...ellipse(x + 90, y + 50, 70, 40, 18, Math.PI), ...ellipse(x + 170, y + 30, 60, 50, 16, Math.PI), ...ellipse(x + 250, y + 55, 60, 35, 14, Math.PI)];
  ln(c, 'cloud', [[x + 30, y + 90], [x + 20, y + 50], [x + 60, y + 20], [x + 120, y + 15], [x + 160, y - 20], [x + 220, y - 10], [x + 250, y + 20], [x + 300, y + 40], [x + 310, y + 90], [x + 30, y + 90]], dp(t, p0, .8, 'cloud'), { w: 2.2 });
  if (t > p0 + .3) W8(c, [[x + 40, y + 85], [x + 30, y + 50], [x + 120, y + 20], [x + 220, y - 5], [x + 300, y + 45], [x + 300, y + 85]], COL.sky2, { a: .4 });
  loop(c, 'lockB', rect(x + 140, y + 40, 60, 46), dp(t, p0 + .5, .4), { w: 2 }); ln(c, 'lockS', [[x + 150, y + 40], [x + 150, y + 20], [x + 170, y + 8], [x + 190, y + 20], [x + 190, y + 40]], dp(t, p0 + .7, .3), { w: 2 });
  loop(c, 'unl', rrect(x + 360, y + 25, 230, 62, 12), dp(t, p0 + .6, .4), { w: 2 }); handwrite(c, 'Unlock sync', x + 380, y + 66, 34, dp(t, p0 + .8, .5), { weight: 700 });
  if (t > T.syncOk) ln(c, 'syncTick', [[x + 610, y + 50], [x + 630, y + 75], [x + 670, y + 20]], dp(t, T.syncOk, .3, 'syncTick'), { w: 3.4, smooth: false });
  handwrite(c, 'encrypted on your device first', x + 30, y + 150, 30, dp(t, p0 + 1, .8), { font: '"Reenie Beanie"' });
}

// ═════════════ SPREAD 4 · the reveal
function spread4(c, t, T) {
  const p0 = T.s4;
  handwrite(c, 'That student is Archishman.', 150, 230, 96, dp(t, T.name, 1.6, 'name'), { font: 'Caveat', weight: 700 });
  handwrite(c, 'He asked Claude, and together they built OpenNote.', 150, 330, 52, dp(t, T.name + 1.6, 1.8, 'name2'), { font: 'Caveat', weight: 500 });
  // him, standing, waving (colour arrives from his feet)
  const k = seg(t, T.waveHi, T.waveHi + .4);
  const pose = k > 0 ? mixPose(stand(), wave((t - T.waveHi) * 7), ss(k)) : stand();
  student(c, t, { x: 640, y: 1260, S: 800, yaw: Math.PI * .92 }, pose, { ink: seg(t, p0 + .4, p0 + 3.2), color: 1, clip: clipFn(CLR) });
  // three devices: a browser window, a phone, a laptop — each with a tiny live page
  const dev = (key, poly, wx, wy, ww, wh, t0) => { const p = dp(t, t0, .7, key); loop(c, key, poly, p, { w: 2.4 }); if (t > t0 + .3) { const wp = wavePts(wx, wy, ww, wh, 3, T.live(t), 40);
    W8(c, [...wp.map(([a, b]) => [a, b - 4]), ...wp.slice().reverse().map(([a, b]) => [a, b + 4])], COL.amber, { a: .85, j: 1.5 }); drawPen(c, penStroke(wp, { w: 1.8, wob: .4, seed: hsh(key), over: 1, smooth: false }), seg(t, t0 + .3, t0 + .9), INK, 1); W8(c, rect(wx - 14, wy - 8, 8, wh + 16), COL.mint, { a: .9, j: 1 }); } };
  dev('dWeb', rrect(1300, 520, 420, 300, 12), 1340, 600, 340, 160, T.dev[0]); handwrite(c, 'web', 1440, 880, 40, dp(t, T.dev[0] + .3, .4), { font: '"Reenie Beanie"' });
  dev('dAnd', rrect(1790, 470, 190, 360, 26), 1815, 580, 140, 140, T.dev[1]); handwrite(c, 'Android', 1800, 880, 40, dp(t, T.dev[1] + .3, .4), { font: '"Reenie Beanie"' });
  dev('dWin', [[2040, 520], [2330, 520], [2330, 760], [2040, 760]], 2070, 580, 230, 120, T.dev[2]); ln(c, 'dWinB', [[2000, 800], [2370, 800], [2330, 760], [2040, 760]], dp(t, T.dev[2] + .3, .4), { w: 2.2, smooth: false });
  handwrite(c, 'Windows', 2110, 880, 40, dp(t, T.dev[2] + .3, .4), { font: '"Reenie Beanie"' });
  // colophon
  handwrite(c, 'OpenNote · free · no ads · no account', 1300, 1030, 50, dp(t, T.col0, 1.2, 'col0'), { weight: 600 });
  handwrite(c, 'opennote-neon-nine.vercel.app', 1300, 1110, 42, dp(t, T.col1, 1.0, 'col1'));
  handwrite(c, 'github.com/Archemasachika7/opennote', 1300, 1180, 42, dp(t, T.col2, 1.1, 'col2'));
}

// ═════════════ timeline
export const T = {};
export function build(words, durs) {
  WORDS = words; DURS = durs; EV.length = 0; SUBS.length = 0; PEN_EV.clear();
  const caps = { v01: 'Two days before the exam. One student, one tablet, and a notebook app he was paying for.', v02: 'Every new notebook was behind a paywall.', v03: 'Bringing in his lecture PDFs? Premium too.',
    v04: 'Then, one night, he asked Claude to visualise a damped oscillator.', v05: 'And for the first time, he could see it.', v06: "But his notes couldn't hold it. A screenshot froze it.", v07: 'The part that made it click was gone.',
    v08: 'So he asked a different question.', v09: 'Night after night, they built it together.', v10: 'Ink that keeps up with a pen. Pages that never go black.', v11: 'Then the first live page ran, right between his notes.',
    v12: 'And he could still write on top of it.', v13: 'Record a lecture, and tap any stroke to hear that moment.', v14: 'Hide a word under tape, and it becomes a flashcard. Sync only if you want, encrypted first.',
    v15: 'That student is Archishman. He asked Claude, and together they built OpenNote.', v16: 'Free. No ads. No account. On the web, Android and Windows.', v17: 'And the code is on GitHub, for the next student who hits the same wall.' };
  for (const [id, t] of Object.entries(VO)) { ev(t, 'vo', { id }); SUBS.push({ id, t0: t - .05, t1: Math.max(t + durs[id] + .6, t + 1.8), text: caps[id] }); }
  for (let i = 0; i < SUBS.length - 1; i++) SUBS[i].t1 = Math.min(SUBS[i].t1, SUBS[i + 1].t0 - .05);

  // spread 1
  T.va0 = 9.6; T.tap1 = Wd('v02', 'new') + .1; T.card1 = Wd('v02', 'paywall') - .25; T.card1x = 20.6; T.tap2 = 21.5; T.card2 = Wd('v03', 'premium') - .3; T.again = T.card2 + 2.6;
  T.vb0 = 28.6; T.type0 = 29.6; T.type1 = Wd('v04', 'oscillator') + .3; T.reply = T.type1 + .3; T.wave0 = T.reply + .4; T.bloom = Wd('v05', 'first') - .1; T.drag0 = Wd('v05', 'see') + .3; T.drag1 = T.drag0 + 1.8;
  T.vc0 = 43.2; T.shot = Wd('v06', 'screenshot') + .05; T.drain0 = T.shot + 1.1; T.drain1 = T.drain0 + 2.0;
  T.slump = t => .8 * ss(seg(t, T.card1 + .4, T.card1 + 1.4)) * (1 - ss(seg(t, T.bloom - .4, T.bloom + .4))) + .6 * ss(seg(t, T.drain0, T.drain1));
  T.live = t => t * 2.4;
  ev(T.tap1, 'tap'); ev(T.card1, 'thud'); ev(T.tap2, 'tap'); ev(T.card2, 'thud'); ev(T.bloom, 'bloom'); ev(T.shot, 'shutter'); ev(T.drain0, 'drain', { d: 2 });
  for (let i = 0; i < 28; i++) ev(T.type0 + (T.type1 - T.type0) * i / 28 + .02 * Math.sin(i * 7), 'key', { v: .5 + .4 * ((i * 37) % 10) / 10 });
  for (let k = 0; k < 8; k++) ev(T.drag0 + k * T.drag1 / 8 - k * T.drag0 / 8, 'tick');
  T.silence = [T.drain1 - .3, T.drain1 + BAR];
  // spread 2 and the nights
  T.turn1 = 54.0; T.s2 = T.turn1 + .8; T.q0 = Wd('v08', 'question') + .5; T.q1 = T.q0 + 4.6; T.send = T.q1 + .4;
  for (let i = 0; i < 90; i++) ev(T.q0 + (T.q1 - T.q0) * i / 90, 'key', { v: .45 + .4 * ((i * 53) % 10) / 10 });
  ev(T.send, 'enter');
  T.nights = [66.0, 69.4, 72.8, 76.2]; T.turns = [T.nights[0] - .8, T.nights[1] - .8, T.nights[2] - .8, T.nights[3] - .8];
  // spread 3
  T.turn3 = 80.6; T.s3 = T.turn3 + .8; T.sheet0 = 83.0; T.save = Wd('v11', 'live') - .35; T.arrive = T.save + .9; T.ann0 = Wd('v12', 'write') - .2;
  T.vl0 = 99.5; T.tapL = Wd('v13', 'tap'); T.vt0 = 106.5; T.tapeD0 = Wd('v14', 'tape') + .3; T.tapeD1 = T.tapeD0 + .9; T.card = Wd('v14', 'flashcard') - .2; T.vs0 = Wd('v14', 'sync') - .6; T.syncOk = Wd('v14', 'encrypted') + .1;
  ev(T.save, 'tap'); ev(T.arrive, 'arrive'); ev(T.tapL, 'tap'); ev(T.tapeD0, 'tape'); ev(T.card, 'flip'); ev(T.syncOk, 'chime');
  // spread 4
  T.turn4 = 121.6; T.s4 = T.turn4 + .8; T.name = VO.v15 + .1; T.dev = [Wd('v16', 'web'), Wd('v16', 'android'), Wd('v16', 'windows')]; T.waveHi = Wd('v16', 'free') - .3;
  T.col0 = Wd('v16', 'no') + .2; T.col1 = Wd('v17', 'code') - .2; T.col2 = Wd('v17', 'github') - .1; T.close = 145.4;
  for (const tt of [T.turn1, ...T.turns, T.turn3, T.turn4]) ev(tt, 'turn');
  ev(T.close, 'close');
}

// spreads in time: [start, draw fn]
function spreadAt(t) {
  if (t < T.turn1) return 's1'; if (t < T.turns[0]) return 's2'; if (t < T.turns[1]) return 'n0'; if (t < T.turns[2]) return 'n1'; if (t < T.turns[3]) return 'n2';
  if (t < T.turn3) return 'n3'; if (t < T.turn4) return 's3'; return 's4';
}
// sweep the timeline once (only when exporting events) so every pen stroke registers its sound
export function sweep(ctx) { for (let t = 0; t < DUR; t += 1 / 12) { const id = spreadAt(t); CLR = colourFor(id, t); DRAW[id](ctx, t, T); } }
const DRAW = { s1: spread1, s2: spread2, s3: spread3, s4: spread4, n0: (c, t) => night(c, t, T, 0), n1: (c, t) => night(c, t, T, 1), n2: (c, t) => night(c, t, T, 2), n3: (c, t) => night(c, t, T, 3) };
function colourFor(id, t) {
  if (id === 's3') return t < T.arrive ? { kind: 'none' } : { kind: 'circle', x: TB.x + 650, y: TB.y + 700, r: 3400 * Math.pow(seg(t, T.arrive, T.arrive + 5), 1.3), seed: 6, col: COL.amber };
  if (id === 's4') return { kind: 'circle', x: 640, y: 1240, r: 3400 * Math.pow(seg(t, T.s4 + 1, T.s4 + 4.5), 1.2), seed: 8, col: COL.amber };
  return { kind: 'none' };
}

// ───────── camera (cubic easing between keys; spread-local)
const FIT = { cx: W / 2, cy: H / 2, z: 1920 / W };
function camFor(id, t) {
  const K = {
    s1: [[0, [330, 150, 2.1]], [2.6, [330, 150, 2.1]], [5.2, [860, 640, 1.15]], [9.4, [880, 640, 1.12]], [10.8, [1790, 410, 1.6]], [27.6, [1790, 430, 1.6]], [28.7, [1790, 1030, 1.6]],
      [36.5, [1790, 1020, 1.65]], [T.shot, [1790, 1020, 1.75]], [T.shot + 1.0, [820, 1000, 1.55]], [T.drain1 + 1, [700, 1020, 1.7]], [53.6, [1200, 675, .8]]],
    s2: [[T.turn1, [1200, 675, .8]], [T.s2 + 1.6, [820, 640, .95]], [T.q0, [830, 800, 1.2]], [T.send + 1.8, [900, 700, 1.0]], [T.turns[0], [1200, 675, .8]]],
    n0: [[0, [1200, 675, .8]]], n1: [[0, [1200, 675, .8]]], n2: [[0, [1200, 675, .8]]], n3: [[T.nights[3], [1200, 675, .8]]],
    s3: [[T.turn3, [1200, 675, .8]], [T.s3 + 2, [1010, 690, .95]], [T.save - 1, [1000, 700, 1.0]], [T.arrive + .5, [1000, 700, 1.0]], [T.arrive + 4, [1200, 675, .8]], [T.ann0 - .8, [700, 520, 1.45]],
      [T.ann0 + 2.5, [700, 520, 1.45]], [T.vl0 - .2, [1900, 600, 1.35]], [T.tapL + 1.2, [1900, 620, 1.35]], [T.vt0, [1900, 860, 1.35]], [T.vs0, [1960, 1060, 1.3]], [T.turn4 - .6, [1200, 675, .8]]],
    s4: [[T.turn4, [1200, 675, .8]], [T.name - .2, [1010, 600, .95]], [VO.v15 + 5.6, [1010, 600, .95]], [VO.v16 + .8, [1750, 700, 1.0]], [T.col1 - .5, [1750, 1080, 1.15]], [T.col2 + 1.5, [1750, 1080, 1.15]], [141.5, [1200, 675, .8]]],
  }[id];
  let a = K[0], b = K[0];
  for (let i = 0; i < K.length; i++) { if (K[i][0] <= t) { a = K[i]; b = K[i + 1] || K[i]; } }
  const u = b === a ? 0 : eio(seg(t, a[0], b[0]));
  const v = [lerp(a[1][0], b[1][0], u), lerp(a[1][1], b[1][1], u), Math.exp(lerp(Math.log(a[1][2]), Math.log(b[1][2]), u))];
  const z = Math.max(.8, v[2]), hx = 960 / z, hy = 540 / z;
  return { cx: clamp(v[0] + Math.sin(t * .6) * 2, hx, W - hx), cy: clamp(v[1] + Math.sin(t * .47 + 1) * 1.5, hy, H - hy), z };
}
export function camAt(t) { const c = camFor(spreadAt(t), t); return [c.cx, c.cy, c.z]; }

// ───────── draw one spread into a context
function drawSpread(ctx, id, t) {
  const cam = camFor(id, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d9cdb2'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.setTransform(cam.z, 0, 0, cam.z, 960 - cam.cx * cam.z, 540 - cam.cy * cam.z);
  // the page's frayed edge and the paper
  ctx.save(); ctx.fillStyle = 'rgba(80,60,40,.18)'; ctx.fillRect(10, 14, W, H); ctx.restore();
  ctx.drawImage(PAPERC, 0, 0);
  CLR = colourFor(id, t);
  DRAW[id](ctx, t, T);
  wetFront(ctx, CLR);
  return cam;
}
// ───────── page turn: the right page of A folds over the gutter, revealing B
let BUF = null;
export function render(ctx, t) {
  if (!PAPERC) PAPERC = makePaper();
  if (!BUF) { BUF = document.createElement('canvas'); BUF.width = 1920; BUF.height = 1080; }
  const turns = [[T.turn1, 's1', 's2'], [T.turns[0], 's2', 'n0'], [T.turns[1], 'n0', 'n1'], [T.turns[2], 'n1', 'n2'], [T.turns[3], 'n2', 'n3'], [T.turn3, 'n3', 's3'], [T.turn4, 's3', 's4']];
  const tr = turns.find(([t0]) => t >= t0 && t < t0 + .8);
  if (!tr) { drawSpread(ctx, spreadAt(t), t); }
  else {
    const [t0, A, B] = tr, p = eio((t - t0) / .8), b = BUF.getContext('2d');
    drawSpread(b, A, t0); drawSpread(ctx, B, t);         // A is held still while it turns
    const cam = camFor(B, t), gx = (W / 2 - cam.cx) * cam.z + 960;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // left half of A stays until the turning page lands on it; the right half folds toward the gutter
    if (p < .5) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, gx, 1080); ctx.clip(); ctx.drawImage(BUF, 0, 0); ctx.restore();
      const k = 1 - p * 2, wR = (1920 - gx) * k;
      ctx.save(); ctx.beginPath(); ctx.rect(gx, 0, wR, 1080); ctx.clip(); ctx.translate(gx, 0); ctx.scale(k, 1); ctx.drawImage(BUF, -gx, 0); ctx.restore();
      const g = ctx.createLinearGradient(gx, 0, gx + wR, 0); g.addColorStop(0, 'rgba(60,45,30,.0)'); g.addColorStop(1, `rgba(60,45,30,${.25 * (1 - k)})`); ctx.fillStyle = g; ctx.fillRect(gx, 0, wR, 1080);
    } else {
      const k = (p - .5) * 2, wL = gx * k;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, gx - wL, 1080); ctx.clip(); ctx.drawImage(BUF, 0, 0); ctx.restore();
      const g = ctx.createLinearGradient(gx - wL, 0, gx, 0); g.addColorStop(0, `rgba(60,45,30,${.22 * (1 - k)})`); g.addColorStop(1, 'rgba(60,45,30,0)'); ctx.fillStyle = g; ctx.fillRect(gx - wL, 0, wL, 1080);
    }
  }
  // the sketchbook closes at the end: the cover swings over from the right
  if (t > T.close) {
    const p = eio(seg(t, T.close, T.close + 1.6)); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const x0 = 1920 - 1920 * p; ctx.fillStyle = '#5b3f2c'; ctx.fillRect(x0, 0, 1920 * p + 2, 1080);
    const g = ctx.createLinearGradient(x0, 0, x0 + 80, 0); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x0, 0, 80, 1080);
    if (p > .95) { ctx.save(); ctx.globalAlpha = seg(t, T.close + 1.6, T.close + 2.4); ctx.fillStyle = '#f1e6cf'; ctx.font = '600 92px Caveat'; ctx.textAlign = 'center'; ctx.fillText('notes that run.', 960, 560); ctx.restore(); }
  }
  caption(ctx, t);
  if (t < .6) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(245,238,222,${1 - eo(t / .6)})`; ctx.fillRect(0, 0, 1920, 1080); }
}
// handwritten subtitles, written into the lower margin on a lifted strip of paper
const NOSUBS = new URLSearchParams(location.search).has('nosubs');
function caption(ctx, t) {
  if (NOSUBS) return; const s = SUBS.find(x => t >= x.t0 && t < x.t1); if (!s) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '500 44px Caveat'; const w = ctx.measureText(s.text).width, x = 960 - w / 2, y = 1022, fade = 1 - seg(t, s.t1 - .2, s.t1);
  ctx.save(); ctx.globalAlpha = fade; reserve(ctx, rect(x - 34, y - 46, w + 68, 66), .82, 6, hsh(s.id)); ctx.restore();
  handwrite(ctx, s.text, x, y, 44, seg(t, s.t0, s.t0 + Math.min(.9, s.text.length * .02)), { weight: 500, alpha: .95 * fade });
}
