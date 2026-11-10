// "Notes that run." — one student's day in OpenNote. Timeline: VO word anchors, camera, Blot, cursor, UI state, sound events.
import { clamp, lerp, seg, ss, eio, eo, ei, back, hash } from '/core/lib.js';
import { WIN, PAGE, P1Y, GAPY, LIVEY, LIVEH, page2Y } from './ui.js';
import * as BL from './blot.js';

export const BPM = 100, B = 60 / BPM;
export const DUR = 73.6;
export const VO = { v01: .8, v02: 5.2, v03: 8.8, v04: 12.6, v05: 17.3, v06: 23.4, v07: 29.4, v08: 34.4, v09: 40.8, v10: 45.6, v11: 51.8, v12: 56.4, v13: 62.6, v14: 68.9 };
let WORDS = {};
const nrm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const W = (id, word, n = 0) => { const ws = WORDS[id] || []; let k = 0;
  for (const [w, a] of ws) if (nrm(w) === nrm(word) && k++ === n) return VO[id] + Math.max(0, a);
  throw new Error(`word ${word} not in ${id}`); };

export const EV = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });
function typing(t0, n, cps = 13, seed = 1, kind = 'key') {
  const T = []; let t = t0;
  for (let i = 0; i < n; i++) { const r = hash(seed * 31 + i * 7.3); t += (1 / cps) * (.55 + r * .9); T.push(t); ev(t, kind, { v: .5 + r * .4 }); }
  return T;
}
const count = (T, t) => { let n = 0; while (n < T.length && T[n] <= t) n++; return n; };

// ───────── camera (screen-recorder single take; moves chain continuously)
const EASE = { eio, ss, eo, whip: x => { x = clamp(x); return x < .5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2; } };
const CAM0 = [960, 547, 1.0], MOVES = [];
const cam = (t0, d, to, e = 'eio') => MOVES.push({ t0, d, to, e });
export function camAt(t) {
  let v = CAM0.slice(); v[2] = Math.log(v[2]);
  for (const m of MOVES) { if (t <= m.t0) break; const p = EASE[m.e]((t - m.t0) / m.d);
    v = [lerp(v[0], m.to[0], p), lerp(v[1], m.to[1], p), lerp(v[2], Math.log(m.to[2]), p)]; }
  return [v[0] + Math.sin(t * .7) * 1.1, v[1] + Math.sin(t * .53 + 1) * .8, Math.exp(v[2])];
}

// ───────── Blot
class Actor {
  constructor(px = 6) { this.px = px; this.segs = []; this.jumps = []; }
  add(s) { this.segs.push(s); return this; }
  stand(t0, t1, at, o = {}) { return this.add({ k: 'stand', t0, t1, at, ...o }); }
  walk(t0, t1, from, to, o = {}) { for (let t = t0 + .06; t < t1; t += .11) ev(t, 'step', { v: .5 }); return this.add({ k: 'walk', t0, t1, from, to, ...o }); }
  jump(t0, t1, from, to, h = 110, o = {}) { this.jumps.push({ t0, t1 }); ev(t0 - .02, 'jump', { d: t1 - t0 }); ev(t1, 'land', { v: o.big ? 1 : .6 }); return this.add({ k: 'jump', t0, t1, from, to, h, ...o }); }
  hide(t0, t1) { return this.add({ k: 'hide', t0, t1 }); }
  seg(t) { let s = null; for (const x of this.segs) { if (x.t0 <= t && t < x.t1) return x; if (x.t0 <= t) s = x; } return s; }
  eval(t, A) {
    const s = this.seg(t); if (!s || s.k === 'hide' || t >= s.t1 && s.end) return null;
    const px = s.px || this.px; let pos, legs = 'stand', flip = s.flip || false, sq = 0, rot = 0, arms = 'down', eyes = 'n';
    const P = f => typeof f === 'function' ? f(A, t) : f;
    if (s.k === 'stand') pos = P(s.at);
    if (s.k === 'walk') { const a = P(s.from), b = P(s.to); if (!a || !b) return null; const p = (s.ease || ss)(seg(t, s.t0, s.t1));
      pos = { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) }; legs = Math.floor(t * 9) % 2 ? 'walkA' : 'walkB'; flip = b.x < a.x; }
    if (s.k === 'jump') { const a = P(s.from), b = P(s.to); if (!a || !b) return null; const p = seg(t, s.t0, s.t1);
      const ap = Math.min(a.y, b.y) - s.h, cy = 2 * ap - (a.y + b.y) / 2;
      pos = { x: lerp(a.x, b.x, p), y: (1 - p) ** 2 * a.y + 2 * (1 - p) * p * cy + p * p * b.y }; legs = 'tuck';
      flip = b.x < a.x - 2; sq = p < .5 ? -.22 * (1 - p * 2) : -.12 * (p * 2 - 1); arms = 'up'; if (s.spin) rot = p * Math.PI * 2 * (b.x < a.x ? -1 : 1); }
    if (!pos) return null;
    for (const j of this.jumps) {
      if (t >= j.t0 - .14 && t < j.t0) sq = Math.max(sq, .28 * ss(seg(t, j.t0 - .14, j.t0)));
      if (t >= j.t1 && t < j.t1 + .22) { const k = seg(t, j.t1, j.t1 + .22); sq = .34 * (1 - k) * Math.cos(k * 7); }
    }
    if (s.k === 'stand' && !s.still) { const bp = ((t % B) + B) % B; if (bp < .12) sq += .07 * Math.sin(bp / .12 * Math.PI); }
    const bl = Math.floor(t / 2.7), bt = t - bl * 2.7 - hash(bl * 3.7 + px) * 1.8;
    if (bt > 0 && bt < .1) eyes = 'blink';
    if (s.eyes) { const e = typeof s.eyes === 'function' ? s.eyes(t) : s.eyes; if (e && !(eyes === 'blink' && 'nlrd'.includes(e))) eyes = e; }
    if (s.arms) arms = typeof s.arms === 'function' ? s.arms(t) : s.arms;
    if (s.legs) legs = s.legs;
    if (s.sq) sq += s.sq(t);
    const x = Math.round(pos.x / (px / 2)) * (px / 2);
    return { x, y: pos.y, px, flip, sq, rot, legs, arms, eyes, op: s.op ? s.op(t) : 1, shadow: s.k === 'jump' ? 0 : 1 };
  }
}

// ───────── cursor: arrow (the user) or pen dot (while writing); segments: move (eased, arced) or track (follows a moving point)
class Cursor {
  constructor() { this.segs = []; this.clicks = []; this.vis = []; }
  show(t0, t1, kind = 'arrow') { this.vis.push([t0, t1, kind]); return this; }
  move(t0, t1, to, arc = 36) { this.segs.push({ k: 'move', t0, t1, to, arc }); return this; }
  track(t0, t1, fn) { this.segs.push({ k: 'track', t0, t1, fn }); return this; }
  click(t) { this.clicks.push(t); ev(t, 'click'); return this; }
  posAt(i, A, t) {
    const s = this.segs[i]; if (!s) return null;
    if (s.k === 'track') return s.fn(A, Math.min(t, s.t1));
    const to = s.to(A, t); const prev = i > 0 ? this.posAt(i - 1, A, s.t0) : null;
    if (!prev || t >= s.t1) return to; if (!to) return prev;
    const k = seg(t, s.t0, s.t1), e = eio(k), dx = to.x - prev.x, dy = to.y - prev.y, L = Math.hypot(dx, dy) || 1;
    return { x: lerp(prev.x, to.x, e) - dy / L * s.arc * Math.sin(Math.PI * e), y: lerp(prev.y, to.y, e) + dx / L * s.arc * Math.sin(Math.PI * e), sp: Math.abs(Math.sin(Math.PI * k)) * L / (s.t1 - s.t0) };
  }
  eval(t, A) {
    let op = 0, kind = 'arrow'; for (const [a, b, k] of this.vis) { const o = Math.min(seg(t, a, a + .15), 1 - seg(t, b - .2, b)); if (o > op) { op = o; kind = k; } }
    if (op <= 0) return null;
    let i = -1; this.segs.forEach((s, j) => { if (s.t0 <= t) i = j; });
    if (i < 0) i = 0;
    const p = this.posAt(i, A, t); if (!p) return null;
    let sc = 1, ring = 0; for (const c of this.clicks) { if (t >= c && t < c + .1) sc = .82; if (t >= c && t < c + .45) ring = seg(t, c, c + .45); }
    return { ...p, op, sc, ring, kind };
  }
}

const at = (key, fx = .5, fy = 0, dx = 0, dy = 0) => { let last = null; return A => { const p = A(key, fx, fy); if (p) last = { x: p.x + dx, y: p.y + dy }; return last; }; };
const pt = (x, y) => () => ({ x, y });

export const SUBS = [], T = {};
let C, CW2, CW3, CUR, TY = {};
export function build(words) {
  WORDS = words; EV.length = 0; MOVES.length = 0; SUBS.length = 0;
  C = new Actor(6); CW2 = new Actor(4); CW3 = new Actor(4); CUR = new Cursor();
  const cap = { v01: 'This is {OpenNote}. A free notebook where notes can run.', v02: 'Write with a stylus, a pen tablet, or a mouse.', v03: 'Hold still, and a rough circle {snaps} into a clean shape.',
    v04: '{Lasso} your work, and move it to any page.', v05: 'Now the good part. Copy an artifact from your AI chat, paste it, and press {Save}.',
    v06: 'It {runs}, right between your pages. And you can still write on top of it.', v07: 'It lives in a {sandbox}, so it never touches your notes.',
    v08: 'Record the lecture while you write. Later, {tap any stroke} to hear that exact moment.', v09: 'Transcripts are made {on your device}, even offline.',
    v10: 'Hide key terms under {tape}, then turn them into flashcards that know when you’ll forget.', v11: 'Need more room? Open an endless {whiteboard}.',
    v12: 'Sign in if you like. Everything is {encrypted} on your device before it is uploaded.', v13: 'Web, Android and Windows. {No charges. No ads.}' };
  const dur = words.__dur;
  for (const [id, t] of Object.entries(VO)) { ev(t, 'vo', { id }); if (cap[id]) SUBS.push({ id, t0: t - .05, t1: Math.max(t + dur[id] + .6, t + 1.8), text: cap[id] }); }
  // keep captions from overlapping
  for (let i = 0; i < SUBS.length - 1; i++) SUBS[i].t1 = Math.min(SUBS[i].t1, SUBS[i + 1].t0 - .05);

  // ═════ A. morning: empty library → new notebook (0–5.0)
  T.click0 = W('v01', 'notebook') + .1;
  CUR.show(1.3, 4.0).move(1.3, 1.3, pt(1250, 640)).move(1.5, T.click0 - .08, at('newnb', .5, .5), 50).click(T.click0);
  ev(T.click0 + .02, 'pop');
  T.nb = T.click0 + .3; ev(T.nb, 'pane');
  TY.title = typing(T.nb + .35, 11, 12, 2);
  cam(.2, 2.4, [1180, 420, 1.28], 'ss');
  cam(T.nb, 1.0, [1066, 470, 1.18], 'eio');

  // ═════ B. 01 Write (5.0–12.4)
  T.eq0 = VO.v02 + .1; T.eq1 = 7.3; T.dot = 7.36; T.born0 = 7.48; T.born1 = 7.98;
  T.spr0 = 7.7; T.spr1 = 8.6;
  for (let t = T.eq0; t < T.eq1; t += .085) ev(t, 'scratch', { v: .5 + .4 * hash(t * 13) });
  for (let t = T.spr0; t < T.spr1; t += .1) ev(t, 'scratch', { v: .4 });
  ev(T.dot, 'tick'); ev(T.born0, 'morph');
  cam(4.3, 1.2, [1000, 340, 1.7], 'eio');
  CUR.show(4.9, 8.75, 'pen').move(4.9, T.eq0, at('eq', 0, .62), 30)
    .track(T.eq0, T.eq1, (A, t) => { const p = A('eq', seg(t, T.eq0, T.eq1), .62 + .12 * Math.sin(t * 31)); return p && { x: p.x, y: p.y }; })
    .move(T.eq1 + .02, T.spr0, at('diag-p1', .5, .04), 20)
    .track(T.spr0, T.spr1, (A, t) => { const p = A('diag-p1', .5 + .17 * Math.sin(seg(t, T.spr0, T.spr1) * 6 * Math.PI) * (seg(t, T.spr0, T.spr1) > .14 && seg(t, T.spr0, T.spr1) < .9 ? 1 : 0), .04 + .55 * seg(t, T.spr0, T.spr1)); return p; });
  cam(T.spr0 - .2, 1.3, [1040, 520, 1.55], 'eio');

  // snap
  T.c0 = VO.v03 + .55; T.c1 = T.c0 + .8; T.snap = W('v03', 'snaps'); ev(T.snap, 'snap');
  for (let t = T.c0; t < T.c1; t += .09) ev(t, 'scratch', { v: .45 });
  const massC = (A, k) => { const p = A('mass-p1', .5, .5); if (!p) return null; const a = -Math.PI / 2 + k * Math.PI * 2.08; return { x: p.x + Math.cos(a) * 57, y: p.y + Math.sin(a) * 52 }; };
  CUR.show(8.85, 11.8, 'pen').move(8.85, T.c0, A => massC(A, 0), 30).track(T.c0, T.c1, (A, t) => massC(A, seg(t, T.c0, T.c1))).track(T.c1, 11.8, (A) => massC(A, 1));
  cam(VO.v03, 1.0, [1066, 600, 1.6], 'eio');

  // Blot: born from the full stop at the end of the equation; stands on the equation; jumps onto the snapped circle
  C.hide(0, T.born1)
   .stand(T.born1, T.snap - .3, at('eq', .9, 0, 0, 2), { eyes: t => t < T.born1 + .5 ? 'wide' : t < T.spr1 ? 'd' : t < T.c1 ? 'd' : 'r' })
   .jump(T.snap - .3, T.snap + .02, at('eq', .9, 0, 0, 2), at('mass-p1', .5, 0, 0, 2), 90, { big: true })
   .stand(T.snap + .02, 13.42, at('mass-p1', .5, 0, 0, 2), { eyes: t => t < T.snap + .7 ? 'happy' : 'l' });

  // lasso → cut → page 2 → paste (12.4–16.2)
  T.lassoKey = 12.4; ev(T.lassoKey, 'key', { v: .9 });
  T.l0 = VO.v04 + .1; T.l1 = T.l0 + .75; T.sel = T.l1 + .05;
  for (let t = T.l0; t < T.l1; t += .1) ev(t, 'scratch', { v: .25 });
  const lassoPt = (A, k) => { const p = A('diag-p1', .5, .55); if (!p) return null; const a = -Math.PI / 2 + k * Math.PI * 2; return { x: p.x + Math.cos(a) * 118, y: p.y + Math.sin(a) * 170 }; };
  CUR.show(12.2, 16.0).move(12.2, T.l0, A => lassoPt(A, 0), 20).track(T.l0, T.l1, (A, t) => lassoPt(A, seg(t, T.l0, T.l1)));
  T.cut = 13.95; ev(T.cut, 'key', { v: 1 }); ev(T.cut + .04, 'cut');
  T.thumbClick = 14.75; CUR.move(T.cut + .15, T.thumbClick - .05, at('thumb-1', .5, .5), 40).click(T.thumbClick);
  T.scr0 = T.thumbClick + .05; T.scr1 = T.scr0 + .5; ev(T.scr0, 'whoosh', { d: 1 });
  T.paste1 = 15.4; ev(T.paste1, 'key', { v: 1 }); ev(T.paste1 + .03, 'pop');
  CUR.move(T.thumbClick + .1, T.paste1 - .1, A => { const p = A('p2', .5, .45); return p; }, 20);
  cam(T.l0 - .3, .6, [1066, 560, 1.45], 'eio');
  cam(T.cut + .05, .6, [760, 520, 1.12], 'eio');
  cam(T.paste1 - .3, .7, [900, 520, 1.2], 'eio');
  C.jump(13.42, T.sel + .05, at('mass-p1', .5, 0, 0, 2), at('diag-p1', .5, 0, 0, -14), 60)
   .stand(T.sel + .05, T.cut + .1, at('diag-p1', .5, 0, 0, -14), { eyes: 'd' })
   .jump(T.cut + .1, T.cut + .62, at('diag-p1', .5, 0, 0, -14), at('thumb-1', .5, 0, 0, 2), 150)
   .stand(T.cut + .62, T.paste1 + .1, at('thumb-1', .5, 0, 0, 2), { eyes: t => t < T.scr0 ? 'r' : 'r' })
   .jump(T.paste1 + .1, T.paste1 + .58, at('thumb-1', .5, 0, 0, 2), at('mass-p2', .5, 0, 0, 2), 120)
   .stand(T.paste1 + .58, 16.4, at('mass-p2', .5, 0, 0, 2), { eyes: 'happy', arms: t => t < T.paste1 + 1.1 ? 'up' : 'down' });

  // ═════ C. 02 Live pages (16.2–33.4)
  T.wipe2 = 16.2; ev(T.wipe2, 'wipe');
  cam(16.45, .1, [1066, 500, 1.45], 'eio');
  T.gapClick = 17.55; T.menuOpen = T.gapClick + .04; T.liveHl = 18.0; T.liveClick = W('v05', 'copy') + .1; ev(T.menuOpen, 'pop'); ev(T.liveHl, 'tick'); ev(T.liveClick, 'pop');
  T.sheet0 = T.liveClick + .1; T.sheet1 = T.sheet0 + .4; ev(T.sheet0, 'pane');
  T.codeClick = 19.4; T.paste = W('v05', 'paste') - .02; T.save = W('v05', 'save') + .05;
  ev(T.paste, 'key', { v: 1 }); for (let i = 0; i < 14; i++) ev(T.paste + .03 + i * .02, 'tick', { v: .15 });
  T.sheetX = T.save + .12; ev(T.sheetX, 'pane');
  T.liveIn = T.sheetX + .15; T.whip = T.liveIn + .25; ev(T.whip - .05, 'whoosh', { d: 1 });
  CUR.show(16.9, 22.4).move(16.9, 16.9, pt(1300, 760)).move(17.0, T.gapClick - .05, at('gap', .5, .5), 40).click(T.gapClick)
    .move(T.gapClick + .2, T.liveClick - .05, at('menu-live', .3, .5), 20).click(T.liveClick)
    .move(T.sheet1, T.codeClick - .05, at('code', .45, .3), 40).click(T.codeClick)
    .move(T.paste + .3, T.save - .07, at('save', .5, .5), 40).click(T.save);
  cam(17.0, .7, [1066, 520, 1.3], 'eio');
  cam(T.sheet0, .7, [960, 520, 1.12], 'eio');
  cam(T.paste - .3, .5, [820, 460, 1.3], 'eio');
  cam(T.save - .6, .5, [1100, 600, 1.2], 'eio');
  cam(T.whip, .45, [1066, 470, 1.42], 'whip');
  // it runs: Blot drops in from above onto the live page header, then rides the Carrier Frequency slider
  T.drop0 = T.whip + .55; T.drop1 = T.drop0 + .5;
  T.toSl = W('v06', 'runs') + .05; T.sl0 = T.toSl + .45; T.sl1 = T.sl0 + 1.4;
  T.modeClick = W('v06', 'still') - .25; ev(T.modeClick + .02, 'tick');
  T.a0 = T.modeClick + .45; T.a1 = T.a0 + .75; T.w0 = T.a1 + .1; T.w1 = T.w0 + .6;
  for (let t = T.a0; t < T.w1; t += .09) ev(t, 'scratch', { v: .45 });
  for (let t = T.sl0; t < T.sl1; t += .12) ev(t, 'tick', { v: .2 });
  C.hide(16.4, T.drop0)
   .jump(T.drop0, T.drop1, at('livehead', .82, 0, 0, -420), at('livehead', .82, 0, 0, 1), 10, { big: true })
   .stand(T.drop1, T.toSl, at('livehead', .82, 0, 0, 1), { eyes: 'd' })
   .jump(T.toSl, T.sl0, at('livehead', .82, 0, 0, 1), at('thumb-sl-0', .5, 0, 0, 1), 70, { px: 4 })
   .stand(T.sl0, T.sl1, at('thumb-sl-0', .5, 0, 0, 1), { px: 4, legs: 'walkA', still: true, eyes: 'r', sq: t => .05 * Math.sin(t * 40) })
   .stand(T.sl1, 33.6, at('thumb-sl-0', .5, 0, 0, 1), { px: 4, eyes: t => t < T.a0 ? 'happy' : t < T.w1 + .4 ? 'u' : t < 30 ? 'happy' : 'shut' });
  const peak = (A, k) => { const p = A('peak', .5, .5); if (!p) return null; const a = -Math.PI / 2 + k * Math.PI * 2.08; return { x: p.x + Math.cos(a) * 36, y: p.y + Math.sin(a) * 34 }; };
  CUR.show(25.4, 28.6).move(25.4, 25.4, pt(1500, 380)).move(25.5, T.modeClick - .05, at('mode-write', .5, .5), 40).click(T.modeClick);
  CUR.show(T.modeClick + .15, 28.6, 'pen').move(T.modeClick + .15, T.a0, A => peak(A, 0), 40).track(T.a0, T.a1, (A, t) => peak(A, seg(t, T.a0, T.a1)))
    .track(T.w0, T.w1, (A, t) => { const p = A('plot', 0, 0); const q = A('peak', .5, .5); return q && { x: q.x + 52 + 95 * seg(t, T.w0, T.w1), y: q.y - 22 + 6 * Math.sin(t * 30) }; });
  cam(T.sl0 - .3, .8, [1066, 560, 1.55], 'eio');
  cam(T.modeClick - .7, .6, [1150, 420, 1.3], 'eio');
  cam(T.a0 - .25, .6, [1066, 500, 1.65], 'eio');
  // freeze on the promise: the sandboxed live page header
  T.spot = VO.v07 - .3; T.spotEnd = VO.v07 + 3.4;
  cam(T.spot, 1.0, [1066, 300, 2.2], 'eio');

  // ═════ D. 03 Lecture (33.4–44.4)
  T.wipe3 = 33.4; ev(T.wipe3, 'wipe');
  cam(33.65, .1, [1066, 520, 1.15], 'eio');
  T.mic = VO.v08 + .15; T.rec0 = T.mic + .2; ev(T.rec0, 'rec');
  T.i10 = T.rec0 + .25; T.i11 = T.i10 + .6; T.i20 = T.i11 + .05; T.i21 = T.i20 + .75; T.i30 = T.i21 + .1; T.i31 = T.i30 + .55;
  for (let t = T.i10; t < T.i31; t += .085) ev(t, 'scratch', { v: .5 });
  T.stop = W('v08', 'later') - .05; T.seekBtn = W('v08', 'tap') - .2; T.tap = W('v08', 'stroke') + .1; ev(T.tap + .02, 'seek');
  const handPt = (key, k) => A => { const p = A(key, k, .65); return p; };
  CUR.show(33.9, 39.4).move(33.9, 33.9, pt(1500, 600)).move(34.0, T.mic - .05, at('mic', .5, .5), 30).click(T.mic);
  CUR.show(T.i10 - .1, T.i31 + .1, 'pen').move(T.mic + .1, T.i10, handPt('l1a', 0), 30)
    .track(T.i10, T.i11, (A, t) => handPt('l1a', seg(t, T.i10, T.i11))(A)).track(T.i20, T.i21, (A, t) => handPt('ud', seg(t, T.i20, T.i21))(A))
    .track(T.i30, T.i31, (A, t) => handPt('l2', seg(t, T.i30, T.i31))(A));
  CUR.show(T.i31 + .1, 40.7).move(T.i31 + .1, T.stop - .05, at('abar', .06, .5), 30).click(T.stop)
    .move(T.stop + .1, T.seekBtn - .05, at('seekbtn', .5, .5), 20).click(T.seekBtn)
    .move(T.seekBtn + .1, T.tap - .03, at('ud', .5, .55), 40).click(T.tap);
  ev(T.stop, 'tick');
  cam(VO.v08, .9, [1066, 430, 1.25], 'eio');
  cam(T.stop - .4, .6, [1000, 380, 1.3], 'eio');
  T.trans = VO.v09 - .35; T.tpan = T.trans + .15; ev(T.tpan, 'pane');
  T.rows = [0, 1, 2, 3].map(i => T.tpan + .5 + i * .38); T.rows.forEach((x, i) => ev(x, 'read', { i }));
  CUR.show(T.trans - .7, T.trans + .5).move(T.trans - .7, T.trans - .05, at('transbtn', .5, .5), 30).click(T.trans);
  cam(T.trans - .4, .7, [1290, 470, 1.25], 'eio');
  C.hide(33.6, T.rec0 + .3)
   .jump(T.rec0 + .3, T.rec0 + .75, at('p2', .95, 0, 0, -460), at('p2', .95, 0, 0, 1), 10)
   .stand(T.rec0 + .75, T.tap + .02, at('p2', .95, 0, 0, 1), { eyes: t => t < T.stop ? 'l' : t < T.tap - .3 ? 'u' : 'l' })
   .stand(T.tap + .02, T.tpan + .3, at('p2', .95, 0, 0, 1), { eyes: 'wide', arms: t => t < T.tap + .8 ? 'up' : 'down' })
   .jump(T.tpan + .3, T.tpan + .75, at('p2', .95, 0, 0, 1), at('ttitle', .95, 0, 0, 1), 90)
   .stand(T.tpan + .75, 44.3, at('ttitle', .95, 0, 0, 1), { eyes: t => t < 43.6 ? 'd' : 'u' });
  const fr = at('ttitle', .95, 0, 0, 1);

  // ═════ E. night: the clock jumps, the theme turns dark from the menu-bar clock (44.4)
  T.clock = 43.9; T.dark0 = 44.25; T.dark1 = 45.4; ev(T.dark0, 'darkon');
  cam(43.3, 1.0, [1080, 500, 1.02], 'eio');
  // ═════ F. 04 Revise (45.6–51.8)
  T.tapeKey = 45.25; ev(T.tapeKey, 'key', { v: .9 });
  T.t0 = W('v10', 'under') - .15; T.t1 = W('v10', 'tape') + .2; ev(T.t0, 'tape');
  cam(44.9, .8, [1000, 330, 1.6], 'eio');
  T.menu2 = 47.35; T.flHl = 47.75; T.flClick = W('v10', 'flashcards') - .05; ev(T.menu2, 'pop'); ev(T.flHl, 'tick');
  T.study = T.flClick + .25; ev(T.study, 'pane');
  T.space = W('v10', 'know') - .15; T.flip0 = T.space + .05; T.flip1 = T.flip0 + .4; ev(T.space, 'key', { v: 1 }); ev(T.flip0, 'flip');
  T.good = W('v10', 'forget') + .1; ev(T.good, 'key', { v: 1 }); ev(T.good + .02, 'ding');
  CUR.show(45.6, T.flClick + .3).move(45.6, T.t0 - .02, at('ud', 0, .2), 30).track(T.t0, T.t1, (A, t) => { const p = A('ud', seg(t, T.t0, T.t1), .45); return p; })
    .move(T.t1 + .2, T.menu2 - .05, at('nbmenu', .5, .5), 40).click(T.menu2)
    .move(T.menu2 + .1, T.flClick - .05, at('menu-flash', .4, .5), 20).click(T.flClick);
  cam(T.menu2 - .45, .5, [1290, 300, 1.4], 'eio');
  cam(T.study - .05, .6, [960, 470, 1.25], 'eio');
  C.jump(44.3, 44.8, fr, at('ud', .5, 0, 0, -2), 120)
   .stand(44.8, T.t1 + .05, at('ud', .5, 0, 0, -2), { eyes: 'd' })
   .stand(T.t1 + .05, T.study, at('tape', .5, 0, 0, 1), { eyes: 'happy', arms: t => t < T.t1 + .6 ? 'up' : 'down' })
   .hide(T.study, T.study + .35)
   .jump(T.study + .35, T.study + .8, at('flash', .9, 0, 0, -380), at('flash', .9, 0, 0, 1), 10)
   .stand(T.study + .8, T.flip0, at('flash', .9, 0, 0, 1), { eyes: 'd' })
   .jump(T.flip0, T.flip1 + .05, at('flash', .9, 0, 0, 1), at('flash', .9, 0, 0, 1), 80, { spin: true })
   .stand(T.flip1 + .05, 53.0, at('flash', .9, 0, 0, 1), { eyes: t => t < T.good ? 'd' : 'happy', arms: t => t > T.good && t < T.good + .8 ? 'up' : 'down' });

  // ═════ G. whiteboard (51.8–55.4)
  T.board = W('v11', 'open') - .1; ev(T.board, 'pane');
  cam(T.board, .1, [960, 540, 1.5], 'eio'); cam(T.board + .15, 2.2, [960, 547, 1.0], 'ss');
  C.hide(53.0, T.board + .3).stand(T.board + .3, 55.6, at('sticky2', .5, 0, 0, 1), { legs: 'walkA', eyes: 'r', sq: t => .05 * Math.sin(t * 36) });

  // ═════ H. 05 Everywhere (55.4–68.9)
  T.wipe5 = 55.4; ev(T.wipe5, 'wipe');
  cam(55.65, .1, [960, 470, 1.22], 'eio');
  T.pass = 56.6; TY.pass = typing(56.85, 12, 14, 7); T.enter = 57.85; ev(T.enter, 'key', { v: 1 }); ev(T.enter + .1, 'unlock');
  T.conn = [58.1, 58.25, 58.4]; T.conn.forEach(x => ev(x, 'tick', { v: .4 }));
  T.spot2 = W('v12', 'everything') - .3; T.spot2End = 61.6; ev(VO.v12 + 4.9 + .1, 'chime');
  CUR.show(55.9, 58.2).move(55.9, 55.9, pt(1400, 700)).move(56.0, T.pass - .05, at('pass', .3, .5), 30).click(T.pass);
  cam(T.spot2 - .2, 1.0, [960, 330, 1.9], 'eio');
  cam(T.spot2End, .7, [960, 547, 1.0], 'eio');
  C.hide(55.6, 56.2).jump(56.2, 56.7, at('syncp', .86, 0, 0, -400), at('syncp', .86, 0, 0, 1), 10)
   .stand(56.7, 62.62, at('syncp', .86, 0, 0, 1), { eyes: t => t < T.enter ? 'd' : t < 61 ? 'shut' : 'n', still: false });
  // cell division
  T.split = 62.62; ev(T.split, 'split'); T.wd = [62.95, W('v13', 'android') + .05, W('v13', 'windows') + .05];
  T.merge0 = 66.3; T.merge1 = 66.9; ev(T.merge1, 'merge');
  C.jump(T.split, T.wd[0], at('syncp', .86, 0, 0, 1), at('card-0-web', .5, .62, 0, 1), 140, { px: 4 })
   .stand(T.wd[0], T.merge0, at('card-0-web', .5, .62, 0, 1), { px: 4, eyes: 'r' }).hide(T.merge0, T.merge1);
  CW2.hide(0, T.wd[1] - .4).jump(T.wd[1] - .4, T.wd[1], at('card-0-web', .5, .62, 0, 1), at('card-0-and', .5, .62, 0, 1), 140)
   .stand(T.wd[1], T.merge0, at('card-0-and', .5, .62, 0, 1), { eyes: 'happy' }).hide(T.merge0, 99);
  CW3.hide(0, T.wd[2] - .4).jump(T.wd[2] - .4, T.wd[2], at('card-0-and', .5, .62, 0, 1), at('card-0-win', .5, .62, 0, 1), 140)
   .stand(T.wd[2], T.merge0, at('card-0-win', .5, .62, 0, 1), { eyes: 'l' }).hide(T.merge0, 99);
  T.wd.forEach(x => ev(x, 'mitosis'));
  // ending: the search box spells the slogan; Blot curls up and sleeps on the notebook card
  T.sr = 67.4; TY.sr = typing(67.5, 'Notes that run.'.length, 12, 11);
  T.sleep = 70.6; ev(T.sleep, 'zz');
  cam(T.merge1, 1.4, [760, 300, 1.55], 'ss');
  cam(68.5, 1.2, [640, 250, 2.1], 'eio');
  cam(70.3, 3.2, [700, 290, 1.8], 'ss');
  C.jump(T.merge1, T.merge1 + .55, pt(960, 300), at('card-0', .62, .73, 0, 1), 60, { big: true })
   .stand(T.merge1 + .55, T.sleep, at('card-0', .62, .73, 0, 1), { eyes: t => t < 68.6 ? 'u' : t < 69.6 ? 'happy' : 'blink' })
   .stand(T.sleep, 99, at('card-0', .62, .73, 0, 1), { eyes: 'shut', legs: 'tuck', arms: 'tuck', still: true, sq: t => .1 + .05 * Math.sin(t * 3) });
  T.fade = DUR - 1.4;
}

// ───────── per-frame state
const CH = [[4.6, '01', 'Write', false], [16.2, '02', 'Live pages', true], [33.4, '03', 'Lecture', true], [45.0, '04', 'Revise', false], [55.4, '05', 'Everywhere', true]];
const CARDS = [{ name: 'Physics 201', meta: '3 pages · edited now', live: true, cover: '#0e3328' }, { name: 'Exam prep board', meta: 'Whiteboard', cover: '#3a2a10' }, { name: 'Physics 201 · Damping', meta: 'Study set · 3 cards', cover: '#123a44' }];
export function frame(t) {
  const F = { t, hud: {}, fx: [], actors: [C, CW2, CW3], cursor: CUR, wins: [] };
  F.cam = camAt(t);
  F.desk = { clock: t < T.clock ? '4:58 PM' : '10:41 PM' };
  const S = {};
  // which view
  if (t < T.nb) S.view = 'library';
  else if (t < T.study) S.view = 'notebook';
  else if (t < T.board) S.view = 'study';
  else if (t < T.wipe5 + .42) S.view = 'board';
  else S.view = 'library';
  // ── library
  if (S.view === 'library') {
    const late = t > T.wipe5;
    S.lib = { cards: late ? CARDS : [], newHot: !late && t > T.click0 - .25 && t < T.click0 + .2 };
    if (late && t >= T.sr) { const n = count(TY.sr, t); S.lib.search = 'Notes that run.'.slice(0, n); S.lib.searchFocus = true; S.lib.searchCaret = Math.floor(t * 2.4) % 2 === 0 || n < 15; S.lib.big = true; }
    if (late && t < T.split + .2) S.sync = { p: Math.min(seg(t, T.wipe5 + .3, T.wipe5 + .7), 1 - seg(t, T.split - .5, T.split - .1)), dots: count(TY.pass, t), focus: t > T.pass, hot: t > T.enter - .1 && t < T.enter + .25,
      c: T.conn.map(x => seg(t, x, x + .15)) };
  }
  // ── notebook
  if (S.view === 'notebook') S.nb = nbState(t);
  if (S.view === 'study') S.study = { flip: t < T.flip0 ? 0 : -180 * eio(seg(t, T.flip0, T.flip1)), shown: t > T.flip0 + .2, gp: seg(t, T.flip0 + .2, T.flip0 + .45), showHot: t > T.space - .15 && t < T.space + .15,
    goodHot: t > T.good - .05, metrics: seg(t, W('v10', 'know') - .1, W('v10', 'know') + .3), sc: t > T.good && t < T.good + .3 ? 1 + .03 * Math.sin(seg(t, T.good, T.good + .3) * Math.PI) : 1 };
  if (S.view === 'board') S.board = { pan: 900 * ss(seg(t, T.board + .1, T.board + 3.4)) };
  F.S = S;
  // windows: one main window, or three devices during the cell division
  const k = t < T.split ? 0 : t < T.merge0 ? back(seg(t, T.split, T.split + .55), 1.1) : 1 - eio(seg(t, T.merge0, T.merge1));
  F.split = k;
  F.dim = seg(t, DUR - 2.6, DUR - .4) * .55;
  // ── light/dark (dark spreads from the menu-bar clock)
  if (t < T.dark0) F.dark = { base: 'L' };
  else if (t < T.dark1) F.dark = { base: 'L', over: 'D', at: 'clock', r: 3000 * ei(seg(t, T.dark0, T.dark1)) ** .85 + 10 };
  else F.dark = { base: 'D' };
  hud(F, t);
  return F;
}
function nbState(t) {
  const live = t >= T.liveIn;
  const N = { title: t < TY.title[0] ? 'Untitled' : 'Physics 201'.slice(0, count(TY.title, t)), titleCaret: t > T.nb + .3 && t < TY.title[10] + .6 && Math.floor(t * 2.4) % 2 === 0,
    tool: t < T.lassoKey ? 'pen' : t < T.wipe2 ? 'lasso' : t < T.tapeKey + .05 ? 'pen' : 'tape', scroll: 0, sel: 0 };
  if (t > T.lassoKey && t < T.l0) N.tool = 'lasso';
  // page 1 ink
  const p1 = { kind: 'ink', items: [
    { k: 'hand', id: 'eq', x: 56, y: 64, size: 60, w: 470, p: seg(t, T.eq0, T.eq1), html: 'x(t) = A e<sup style="font-size:.6em">−γt</sup> cos ωt<span style="opacity:' + (t < T.born0 ? 1 : 0) + '">.</span>' },
    { k: 'diagram', x: 330, y: 230, op: t < T.cut ? 1 : 1 - seg(t, T.cut, T.cut + .12), spring: seg(t, T.spr0, T.spr1), circ: seg(t, T.c0, T.c1), snap: seg(t, T.snap, T.snap + .33), sel: t > T.sel && t < T.cut ? 1 : 0 },
    { k: 'lasso', p: seg(t, T.l0, T.l1), op: t < T.sel + .1 ? 1 : 0 }] };
  const pasted = t >= T.paste1;
  const p2 = { kind: 'ink', items: [
    { k: 'diagram', x: 330, y: 230, op: pasted ? 1 : 0, spring: 1, circ: 1, snap: 1, sel: pasted && t < T.paste1 + .8 ? 1 - seg(t, T.paste1 + .5, T.paste1 + .8) : 0 },
    { k: 'hand', id: 'l1a', x: 56, y: 60, size: 54, w: 160, p: seg(t, T.i10, T.i11), html: 'ζ &lt; 1 →' },
    { k: 'hand', id: 'ud', x: 228, y: 60, size: 54, w: 250, p: seg(t, T.i20, T.i21), html: 'underdamped', col: t > T.tap && t < T.tap + .8 ? 'var(--accent)' : undefined },
    { k: 'hand', id: 'l2', x: 56, y: 140, size: 46, w: 200, p: seg(t, T.i30, T.i31), html: 'γ = b / 2m' },
    { k: 'tape', x: 228, y: 60, w: 250, h: 62, p: ss(seg(t, T.t0, T.t1)) }] };
  N.pages = live ? [p1, { kind: 'live' }, p2] : [p1, p2];
  // scroll
  if (t >= T.scr0 && t < T.wipe2 + .3) N.scroll = 924 * eio(seg(t, T.scr0, T.scr1));
  if (t >= T.wipe2 + .3) N.scroll = 600;
  if (t >= T.sheetX) N.scroll = lerp(600, 900, eio(seg(t, T.sheetX, T.whip + .45)));
  if (t >= T.wipe3 + .3) N.scroll = page2Y(true) - 70;
  N.sel = t >= T.thumbClick ? 1 : 0; if (live) N.sel = t >= T.wipe3 + .3 ? 2 : 1;
  // insert gap, menu, paste sheet
  if (t > 16.9 && t < T.sheet0 + .2) N.gap = Math.min(seg(t, 16.95, 17.2), 1 - seg(t, T.sheet0, T.sheet0 + .2));
  if (t > T.menuOpen && t < T.liveClick + .15) N.insert = { p: t < T.liveClick ? back(seg(t, T.menuOpen, T.menuOpen + .2)) : 1 - seg(t, T.liveClick, T.liveClick + .15), hl: t < T.liveHl ? 0 : 2 };
  if (t > T.sheet0 && t < T.sheetX + .3) N.paste = { p: t < T.sheetX ? eo(seg(t, T.sheet0, T.sheet1)) : 1 - eio(seg(t, T.sheetX, T.sheetX + .3)), focus: t > T.codeClick,
    caret: t > T.codeClick && Math.floor(t * 2.4) % 2 === 0, lines: Math.floor(14 * seg(t, T.paste + .03, T.paste + .32)), prev: seg(t, T.paste + .4, T.paste + .8), saveHot: t > T.save - .2 && t < T.save + .15 };
  // live page
  if (live) N.live = { f1: 2 + 1.4 * ss(seg(t, T.sl0, T.sl1)), ph: Math.min(t, T.modeClick) * 2.2, op: seg(t, T.liveIn, T.liveIn + .25), sc: .96 + .04 * eo(seg(t, T.liveIn, T.liveIn + .4)), peakX: 300,
    ann: { c: seg(t, T.a0, T.a1), w: seg(t, T.w0, T.w1) } };
  N.showMode = live && t > T.whip && t < T.wipe3;
  N.mode = t > T.modeClick ? 'annotate' : 'interact';
  if (t > T.modeClick && t < T.wipe3) N.tool = 'pen';
  // lecture
  N.micOn = t > T.mic && t < T.stop;
  if (t > T.rec0 && t < 44.9) {
    const rec = t < T.stop, sec = rec ? 151 * seg(t, T.rec0, T.stop) : 0;
    const play = t < T.tap ? 0 : .6 + (t - T.tap) * .01;
    N.audio = { op: Math.min(seg(t, T.rec0, T.rec0 + .3), 1 - seg(t, 44.5, 44.9)), rec, blink: Math.floor(t * 2) % 2 === 0, time: rec ? `0${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}` : t < T.tap ? '02:31' : '01:30',
      fill: rec ? seg(t, T.rec0, T.stop) : 1, play: rec ? 0 : play, seek: t > T.seekBtn, replay: false };
  }
  if (t > T.tpan && t < 44.9) N.trans = { p: Math.min(eo(seg(t, T.tpan, T.tpan + .45)), 1 - seg(t, 44.5, 44.9)), n: T.rows.filter(x => t > x - .2).length + (t > T.rows[3] ? .5 : 0) * 0, hl: t > T.rows[3] + .4 ? 2 : -1 };
  if (t > T.menu2 && t < T.flClick + .2) N.nbmenu = { p: t < T.flClick ? back(seg(t, T.menu2, T.menu2 + .2)) : 1 - seg(t, T.flClick, T.flClick + .2), hl: t > T.flHl };
  return N;
}
function hud(F, t) {
  const H = F.hud;
  H.dark = F.dark.base === 'D' || (F.dark.over === 'D' && F.dark.r > 1400);
  const s = SUBS.find(x => t >= x.t0 && t < x.t1);
  if (s) H.cap = { text: s.text, op: Math.min(seg(t, s.t0, s.t0 + .12), 1 - seg(t, s.t1 - .15, s.t1)), y: (1 - eo(seg(t, s.t0, s.t0 + .2))) * 10 };
  for (const [t0, no, nm, wipe] of CH) {
    if (wipe && t >= t0 && t < t0 + .85) H.wipe = { p: (t - t0) / .85, no, nm };
    const a = wipe ? t0 + .6 : t0;
    if (t >= a && t < a + 7.2) H.chap = { no, nm, op: Math.min(seg(t, a, a + .3), 1 - seg(t, a + 6.9, a + 7.2)) };
  }
  if (t > T.spot - .1 && t < T.spot2End + .4) H.chap = null;
  const KC = [[T.lassoKey - .2, ['L'], 'Lasso', [T.lassoKey]], [T.cut - .3, ['Ctrl', 'X'], 'cut', [T.cut]], [T.paste1 - .3, ['Ctrl', 'V'], 'paste', [T.paste1]],
    [T.paste - .35, ['Ctrl', 'V'], 'paste', [T.paste]], [T.tapeKey - .25, ['B'], 'Tape', [T.tapeKey]], [T.space - .3, ['Space'], 'show answer', [T.space]], [T.good - .35, ['3'], 'Good', [T.good]], [T.enter - .3, ['Enter'], 'unlock', [T.enter]]];
  for (const [t0, keys, label, press] of KC) if (t >= t0 && t < t0 + 1.4) { const nxt = KC.find(k => k[0] > t0); if (nxt && t >= nxt[0]) continue;
    H.keys = { keys, label, op: Math.min(seg(t, t0, t0 + .15), 1 - seg(t, t0 + 1.15, t0 + 1.4)), dn: press.some(p => t >= p && t < p + .18), y: (1 - back(seg(t, t0, t0 + .3))) * 20 }; }
  if (t > T.rows[0] - .5 && t < T.rows[3] + .5) H.ramp = { op: Math.min(seg(t, T.rows[0] - .5, T.rows[0] - .3), 1 - seg(t, T.rows[3] + .3, T.rows[3] + .5)), blink: Math.floor(t * 4) % 2 };
  if (t > T.spot && t < T.spotEnd + .4) H.spot = { key: 'livehead', op: Math.min(seg(t, T.spot, T.spot + .4), 1 - seg(t, T.spotEnd, T.spotEnd + .4)) };
  if (t > T.spot2 && t < T.spot2End + .4) H.spot = { key: 'encline', op: Math.min(seg(t, T.spot2, T.spot2 + .4), 1 - seg(t, T.spot2End, T.spot2End + .4)) };
  if (t > T.fade) H.fade = seg(t, T.fade, DUR);
}
