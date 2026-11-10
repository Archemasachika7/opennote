import { clamp, seg, eo, lerp, hash } from '/core/lib.js';
import * as UI from './ui.js';
import * as BL from './blot.js';
import * as FM from './film.js';

const Q = new URLSearchParams(location.search), NOSUBS = Q.has('nosubs');
const wL = document.getElementById('wL'), wD = document.getElementById('wD'), spr = document.getElementById('spr'), hudEl = document.getElementById('hud');
const mbg = document.getElementById('mbg'), mbw = document.getElementById('mbw');

const words = await (await fetch('voices/words.json')).json();
words.__dur = await (await fetch('voices/dur.json')).json();
FM.build(words);
window.DUR = FM.DUR;
window.EV = FM.EV.slice().sort((a, b) => a.t - b.t);
window.SUBS = FM.SUBS.map(s => ({ t0: s.t0, t1: s.t1, text: s.text.replace(/[{}]/g, '') }))
  .concat([{ t0: FM.VO.v14 - .05, t1: FM.VO.v14 + words.__dur.v14 + .6, text: 'OpenNote. Notes that run.' }]);   // spoken over the search-box title; in the .srt only
window.T = FM.T;

const DEV = [{ id: 'web', x: 70, y: 210, w: 650, h: 620, kind: 'browser' }, { id: 'and', x: 815, y: 160, w: 300, h: 650, kind: 'phone' }, { id: 'win', x: 1210, y: 210, w: 650, h: 620, kind: 'windows' }];
function world(F) {
  const S = F.S, t = F.t; let inner = '';
  if (F.split > .001) {
    let h = '';
    const cards = [{ name: 'Physics 201', meta: '3 pages · edited now', live: true, cover: '#0e3328' }, { name: 'Exam prep board', meta: 'Whiteboard', cover: '#3a2a10' }];
    for (const d of DEV) {
      const k = F.split, x = lerp(UI.WIN.x, d.x, k), y = lerp(UI.WIN.y, d.y, k), w = lerp(UI.WIN.w, d.w, k), hh = lerp(UI.WIN.h, d.h, k);
      const lib = UI.library({ cards, narrow: true }, '-' + d.id);
      if (d.kind === 'phone') h += `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px;opacity:${clamp(k * 3)}"><div class="scr"><div class="app" style="top:18px">${lib}</div></div></div>`;
      else h += UI.win(S, lib, { x, y, w, h: hh, kind: d.kind, id: 'win-' + d.id });
    }
    return UI.desk(F.desk) + h;
  }
  if (S.view === 'library') inner = UI.library(S.lib) + (S.sync ? UI.syncPanel(S.sync) : '');
  if (S.view === 'notebook') inner = UI.notebook(S.nb, t);
  if (S.view === 'study') inner = UI.study(S.study);
  if (S.view === 'board') inner = UI.board(S.board);
  return UI.desk(F.desk) + UI.win(S, inner, { dim: F.dim });
}

const tf = ([cx, cy, z]) => `translate(960px,540px) scale(${z}) translate(${-cx}px,${-cy}px)`;
function render(t) {
  const F = FM.frame(t), [cx, cy, z] = F.cam;
  const html = world(F);
  const D = F.dark, base = D.base === 'L' ? wL : wD, over = D.over ? (D.over === 'L' ? wL : wD) : null;
  base.innerHTML = html; base.style.display = ''; base.style.clipPath = ''; base.style.zIndex = 1;
  if (over) { over.innerHTML = html; over.style.display = ''; over.style.zIndex = 2; } else (base === wL ? wD : wL).style.display = 'none';
  for (const el of [wL, wD, spr]) el.style.transform = tf(F.cam);
  const cache = {}, root = over || base;
  const A = (key, fx = .5, fy = 0) => { const el = cache[key] !== undefined ? cache[key] : (cache[key] = root.querySelector(`[data-a="${key}"]`));
    if (!el) return null; const r = el.getBoundingClientRect(); return { x: (r.left + r.width * fx - 960) / z + cx, y: (r.top + r.height * fy - 540) / z + cy, w: r.width / z, h: r.height / z }; };
  if (over) { const c = A(D.at, .5, .5) || { x: 1700, y: 15 }; over.style.clipPath = `circle(${D.r}px at ${c.x}px ${c.y}px)`; }
  const [px, py] = FM.camAt(t - 1 / 30), vx = (cx - px) * z, vy = (cy - py) * z;
  const bx = Math.min(34, Math.max(0, Math.abs(vx) - 30) * .3), by = Math.min(34, Math.max(0, Math.abs(vy) - 30) * .3);
  mbg.setAttribute('stdDeviation', `${bx.toFixed(2)} ${by.toFixed(2)}`); mbw.style.filter = bx > .6 || by > .6 ? 'url(#mb)' : '';
  spr.innerHTML = sprites(F, t, A, z) + F.fx.map(f => f(A)).join('');
  hud(F, t, A, z, cx, cy);
}

function sprites(F, t, A, z) {
  const T = FM.T; let h = '';
  const draw = act => {
    const c = act.eval(t, A); if (!c) return null;
    h += BL.sprite(c);
    for (const j of act.jumps) if (t >= j.t1 && t < j.t1 + .4) { const L = act.eval(j.t1 + .001, A); if (L) h += BL.dust(L.x, L.y, seg(t, j.t1, j.t1 + .4), Math.max(3, L.px * .7), 6, j.t1 * 10); }
    return c;
  };
  const [c1] = F.actors.map(draw);
  // birth: the full stop at the end of the equation becomes Blot's pixels
  if (t >= T.born0 && t < T.born1 + .02) {
    const eq = A('eq', 1, .78), p = seg(t, T.born0, T.born1);
    if (eq) { const dst = BL.pixels({ x: eq.x - 14, y: eq.y - 46, px: 6, eyes: 'wide' });
      dst.forEach((d, i) => { const k = eo(clamp((p - hash(i * 1.7) * .35) / .65)), ax = Math.sin(k * Math.PI) * (hash(i * 3.1) - .5) * 50, ay = -Math.sin(k * Math.PI) * 50 * hash(i * 5.3);
        const x = lerp(eq.x - 6, d.x - 3, k) + ax, y = lerp(eq.y - 6, d.y - 3, k) + ay, s = lerp(4, 6, k);
        h += `<div style="position:absolute;left:${x}px;top:${y}px;width:${s + .4}px;height:${s + .4}px;background:${k > .6 ? d.col : '#1e2a44'}"></div>`; }); }
  }
  if (c1) {
    const top = c1.y - c1.px * 14;
    if (t > T.born1 && t < T.born1 + .6) h += BL.SPARK(c1.x + 50, top - 10, 5, '#F5A524', 1 - seg(t, T.born1 + .3, T.born1 + .6));
    if (t > T.snap && t < T.snap + .6) { const k = seg(t, T.snap, T.snap + .6); h += BL.SPARK(c1.x - 70 - k * 30, top - k * 20, 5, '#F5A524', 1 - k) + BL.SPARK(c1.x + 70 + k * 30, top - 10 - k * 20, 5, '#F5A524', 1 - k); }
    if (t > T.cut && t < T.cut + .5) h += BL.BANG(c1.x + 30, top - 50, 5);
    if (t > T.tap && t < T.tap + .7) h += BL.BANG(c1.x + 32, top - 52, 5, 1 - seg(t, T.tap + .5, T.tap + .7));
    if (t > T.good && t < T.good + .7) { const k = seg(t, T.good, T.good + .7); h += BL.SPARK(c1.x + 50, top - 20 - k * 30, 5, '#3ddc97', 1 - k); }
    if (t > T.sleep) for (let i = 0; i < 3; i++) { const k = ((t - T.sleep) * .55 + i / 3) % 1; h += BL.Z(c1.x - 70 - k * 40 - i * 4, top - 10 - k * 70, 3 + k * 2, Math.sin(k * Math.PI)); }
  }
  // pixel bursts at the split and the merge
  const burst = (x, y, k, n = 16) => { let s = ''; for (let i = 0; i < n; i++) { const a = hash(i * 2.3) * Math.PI * 2, r = (20 + hash(i * 7.7) * 70) * eo(k), sz = 7 * (1 - k * .6);
    s += `<div style="position:absolute;left:${x + Math.cos(a) * r}px;top:${y + Math.sin(a) * r * .7}px;width:${sz}px;height:${sz}px;background:${i % 3 ? BL.BLUE : '#F5A524'};opacity:${1 - k}"></div>`; } return s; };
  for (const x of T.wd) if (t > x && t < x + .45) { const p = A(['card-0-web', 'card-0-and', 'card-0-win'][T.wd.indexOf(x)], .5, 0); if (p) h += burst(p.x, p.y - 30, seg(t, x, x + .45), 10); }
  if (t > T.merge1 && t < T.merge1 + .6) h += burst(960, 300, seg(t, T.merge1, T.merge1 + .6), 22);
  // cursor
  const cu = F.cursor.eval(t, A);
  if (cu) {
    if (cu.kind === 'pen') h += `<div style="position:absolute;left:${cu.x - 7 / z}px;top:${cu.y - 7 / z}px;width:${14 / z}px;height:${14 / z}px;border-radius:50%;border:${2 / z}px solid #f5a524;background:rgba(245,165,36,.25);opacity:${cu.op}"></div>`;
    else {
      if (cu.sp > 900) for (let i = 1; i <= 4; i++) { const g = F.cursor.eval(t - i * .012, A); if (g) h += cursorSvg(g.x, g.y, 1, cu.op * .16 * (5 - i) / 4, z); }
      if (cu.ring > 0) h += `<div class="ring" style="left:${cu.x - 26 * cu.ring - 4}px;top:${cu.y - 26 * cu.ring - 4}px;width:${52 * cu.ring + 8}px;height:${52 * cu.ring + 8}px;opacity:${(1 - cu.ring) * .8};border-width:${3 / z}px"></div>`;
      h += cursorSvg(cu.x, cu.y, cu.sc, cu.op, z);
    }
  }
  return h;
}
const cursorSvg = (x, y, sc, op, z) => { const s = 1.5 * sc / z;
  return `<svg style="position:absolute;left:${x - 2 * s}px;top:${y - 2 * s}px;opacity:${op};filter:drop-shadow(0 ${2 / z}px ${3 / z}px rgba(0,0,0,.35))" width="${22 * s}" height="${30 * s}" viewBox="0 0 22 30"><path d="M2 2 L2 24 L7.5 18.5 L11 27 L15 25.2 L11.6 17 L19 17 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`; };

function hud(F, t, A, z, cx, cy) {
  const H = F.hud; let h = '';
  const scr = p => ({ x: (p.x - cx) * z + 960, y: (p.y - cy) * z + 540 });
  if (H.spot) { const p = A(H.spot.key, .5, .5); if (p) { const s = scr(p), r = Math.max(p.w, p.h) * z * .62 + 40;
    h += `<div class="spot" style="opacity:${H.spot.op};background:radial-gradient(ellipse ${r * 1.25}px ${r * .55}px at ${s.x}px ${s.y}px, transparent 55%, rgba(8,9,12,.62) 100%)"></div>`; } }
  if (H.chap && !H.wipe) h += `<div class="chap ${H.dark ? 'dk' : ''}" style="opacity:${H.chap.op}"><b>${H.chap.no}</b>${H.chap.nm}</div>`;
  if (H.ramp) h += `<div class="ramp" style="opacity:${H.ramp.op}">${H.ramp.blink ? '▶▶' : '▷▷'} 4×</div>`;
  if (H.keys) h += `<div class="keys" style="opacity:${H.keys.op};transform:translateY(${H.keys.y}px)">${H.keys.keys.map(k => `<i class="${H.keys.dn ? 'dn' : ''}">${k}</i>`).join('')}<span>${H.keys.label}</span></div>`;
  if (H.cap && !NOSUBS) h += `<div class="cap ${H.dark ? 'dk' : ''}" style="opacity:${H.cap.op};transform:translate(-50%,${H.cap.y}px)">${H.cap.text.replace(/\{([^}]*)\}/g, '<em>$1</em>')}</div>`;
  if (H.wipe) h += wipe(H.wipe, t);
  if (H.fade) h += `<div class="fade" style="opacity:${H.fade}"></div>`;
  if (t < .5) h += `<div class="fade" style="opacity:${1 - eo(t / .5)}"></div>`;
  hudEl.innerHTML = h;
}
// chapter transition: square pixels (OpenNote's dark surface + an amber seam) sweep across, the chapter title, then reveal; a white Blot runs across
function wipe(W, t) {
  const S = 60, cols = 32, rows = 18, p = W.p; let s = '<div class="wipe">';
  const pal = ['#121318', '#1a1c23', '#22252e', '#1e2028'];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = (c / cols) * .55 + ((rows - r) / rows) * .2 + hash(c * 13.1 + r * 7.7) * .12;
    const a = clamp((p / .42 - d) / .18), b = clamp(((p - .55) / .42 - d) / .18), k = a * (1 - b);
    if (k <= 0) continue; const sz = S * k, edge = k < .55 && hash(c * 5.1 + r) > .7;
    s += `<b style="left:${c * S + (S - sz) / 2}px;top:${r * S + (S - sz) / 2}px;width:${sz + .5}px;height:${sz + .5}px;background:${edge ? '#f5a524' : pal[Math.floor(hash(c * 3.7 + r * 11.3) * 4)]}"></b>`;
  }
  const lo = clamp(Math.min((p - .3) / .12, (.82 - p) / .1));
  if (lo > 0) {
    s += `<div class="wlabel" style="opacity:${lo};transform:translateY(calc(-50% + ${(1 - lo) * 16}px))"><div class="no">${W.no}</div><div class="nm">${W.nm}</div></div>`;
    s += BL.sprite({ x: 300 + p * 1320, y: 800, px: 6, legs: Math.floor(t * 12) % 2 ? 'walkA' : 'walkB', op: lo });
  }
  return s + '</div>';
}
window.TEXTS = t => {
  const F = FM.frame(t), H = F.hud, out = [];
  if (H.chap && !H.wipe && H.chap.op > .99) out.push({ id: 'chap', text: H.chap.no + ' ' + H.chap.nm, x0: 56, y0: 46, x1: 400, y1: 100 });
  if (H.keys && H.keys.op > .99) out.push({ id: 'keys', text: H.keys.keys.join(' ') + ' ' + H.keys.label, x0: 1500, y0: 970, x1: 1860, y1: 1030, pass: true });
  if (H.wipe) { const lo = clamp(Math.min((H.wipe.p - .3) / .12, (.82 - H.wipe.p) / .1)); if (lo > .99) out.push({ id: 'wipe', text: H.wipe.nm, x0: 500, y0: 420, x1: 1420, y1: 660, pass: true }); }
  return out;
};
window.render = render;
await document.fonts.load('16px Inter'); await document.fonts.load('40px SG'); await document.fonts.load('40px Hand'); await document.fonts.load('14px Mono');
render(+(Q.get('t') || 0));
window.READY = true;
