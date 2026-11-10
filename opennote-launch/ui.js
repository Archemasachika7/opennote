// OpenNote UI, redrawn: state → HTML. Every label matches the real app (src/library, src/notebook, src/live, src/study, src/ui).
import { ic } from './icons.js';

export const WIN = { x: 160, y: 92, w: 1600, h: 910 };          // main window on the desktop (world px)
export const PAGE = { x: 364, w: 660, h: 880 };                  // page column inside the notebook canvas
export const P1Y = 36, GAPY = P1Y + 880 + 8, LIVEY = GAPY + 36, LIVEH = 600;
export const page2Y = live => live ? LIVEY + LIVEH + 36 : GAPY + 36;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const caret = on => on ? '<span class="caret"></span>' : '';

// ───────── desktop
export function desk(D) {
  return `<div id="wall"></div><div id="menubar"><b>OpenNote</b><span>File</span><span>Edit</span><span>View</span><span>Window</span>
    <span class="r"><span>${ic('cloud', 15)}</span><span data-a="clock">${D.clock}</span></span></div>`;
}

// ───────── window chrome
export function win(S, inner, o = {}) {
  const w = o.w || WIN.w, h = o.h || WIN.h, x = o.x ?? WIN.x, y = o.y ?? WIN.y;
  const bar = o.kind === 'browser'
    ? `<div class="ttl"><span class="lights"><i></i><i></i><i></i></span><span class="url">${ic('lock', 12)} opennote · web</span></div>`
    : o.kind === 'windows'
      ? `<div class="ttl"><span style="font-weight:600;color:var(--text)">OpenNote</span><span class="wctl">— &nbsp;▢ &nbsp;✕</span></div>`
      : `<div class="ttl"><span class="lights"><i></i><i></i><i></i></span><span class="t">OpenNote</span></div>`;
  return `<div class="win" data-a="${o.id || 'win'}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;opacity:${o.op ?? 1};transform:${o.tf || 'none'};transform-origin:50% 50%">${bar}<div class="app">${inner}</div>
    ${o.dim ? `<div style="position:absolute;inset:0;background:#000;opacity:${o.dim}"></div>` : ''}</div>`;
}

// ───────── library
export function library(L, sfx = '') {
  const side = [['All', 'layout-grid'], ['Favourites', 'star'], ['Whiteboards', 'presentation'], ['Study sets', 'book-open'], ['Unfiled', null], ['Trash', 'trash-2']]
    .map(([n, i], k) => `<div class="${k === 0 ? 'on' : ''}">${i ? ic(i, 16) : '<span style="width:16px"></span>'}${n}</div>`).join('');
  const search = `<div class="input ${L.searchFocus ? 'focus' : ''}" data-a="search${sfx}" style="width:${L.narrow ? 220 : 420}px;margin-left:${L.narrow ? 8 : 28}px;font-size:${L.big ? 16 : 14}px">${ic('search', 15)}<span style="color:${L.search ? 'var(--text)' : 'var(--dim)'};font-weight:${L.big ? 600 : 400}">${L.search ? esc(L.search) : 'Search notes and live pages'}</span>${caret(L.searchCaret)}${L.search ? '' : '<span class="kb">/</span>'}</div>`;
  const head = L.narrow ? `<div class="lhead" style="padding:0 16px"><span class="wordmark">OpenNote</span><span class="btn primary icon" style="margin-left:auto">${ic('plus', 16)}</span></div>` : `<div class="lhead"><span class="wordmark">OpenNote</span>${L.narrow ? '' : '<span class="dim" style="font-size:13px">Overview</span>'}${search}
    <span style="margin-left:auto;display:flex;gap:8px;align-items:center">${L.narrow ? '' : `<span class="btn ghost icon">${ic('command', 16)}</span><span class="btn ghost icon">${ic('user', 16)}</span><span class="btn ghost icon">${ic('settings', 16)}</span>
    <span class="btn">${ic('upload', 15)}Import</span><span class="btn">${ic('folder-plus', 15)}New folder</span>`}
    <span class="btn primary ${L.newHot ? 'hot' : ''}" data-a="newnb${sfx}">${ic('plus', 15)}New notebook</span></span></div>`;
  let main;
  if (!L.cards || !L.cards.length) main = `<div class="empty"><h2>No notebooks yet</h2><p class="dim">Create one, then paste an AI artifact into it to make a live page.</p>
    <div class="acts"><span class="btn primary">${ic('plus', 15)}Create blank</span><span class="btn">${ic('sparkles', 15, 1.5, 'var(--live)')}Explore starter demo</span><span class="btn ghost">${ic('upload', 15)}Open PDF or backup</span></div></div>`;
  else main = `<div class="lmain" style="${L.narrow ? 'left:0;padding:16px' : ''}"><div class="lbar"><span class="input" style="color:var(--text)">Last modified ${ic('chevron-down', 14)}</span>
      <span class="btn icon on">${ic('layout-grid', 15)}</span><span class="btn icon ghost">${ic('list', 15)}</span><span class="btn ghost">${ic('square-check', 15)}Select</span></div>
      <div class="cards" style="${L.narrow ? 'flex-direction:column;gap:14px' : ''}">${L.cards.map((c, i) => card(c, i, sfx, L.narrow)).join('')}</div></div>`;
  return head + (L.narrow ? '' : `<div class="lside">${side}</div>`) + main;
}
function card(c, i, sfx, narrow) {
  const cover = `<div class="cv" style="background:${c.cover};${narrow ? 'height:120px' : ''}">
    <div style="position:absolute;left:18px;top:16px;width:46%;height:76%;background:var(--page);border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,.2)">
      <div class="hand" style="left:8px;top:10px;font-size:15px">x(t) = Ae<sup>−γt</sup>…</div></div>
    ${c.live ? `<span class="tag" style="position:absolute;right:10px;top:10px">LIVE</span>` : ''}</div>`;
  return `<div class="ncard" data-a="card-${i}${sfx}" style="${narrow ? 'width:100%' : ''}">${cover}<div class="nm">${esc(c.name)}</div><div class="mt">${c.meta}</div></div>`;
}

// ───────── notebook
const TOOLS = [['pen', 'pen-line'], ['highlighter', 'highlighter'], ['eraser', 'eraser'], ['lasso', 'lasso'], ['shape', 'shapes'], ['tape', 'rectangle-horizontal'], ['laser', 'presentation'], ['text', 'type'], ['image', 'image'], ['hand', 'hand']];
export function notebook(N, t) {
  const tools = TOOLS.map(([n, i]) => `<span class="tool ${N.tool === n ? 'on' : ''}" data-a="tool-${n}">${ic(i, 18)}</span>`).join('');
  const dots = ['var(--ink)', '#f5a524', '#3ddc97', '#4fd1c5', '#60a5fa', '#ff6b6b'].map((c, i) => `<span class="dot ${i === (N.color || 0) ? 'on' : ''}" style="background:${c}"></span>`).join('');
  const modeSw = N.showMode ? `<span class="seg2" data-a="modesw"><span class="${N.mode === 'interact' ? 'on' : ''}">Use page</span><span class="${N.mode === 'annotate' ? 'on' : ''}" data-a="mode-write">Write on page</span></span>` : '';
  const bar = `<div class="tbar"><span class="tool">${ic('arrow-left', 18)}</span><span class="tool on" style="box-shadow:none;background:none;color:var(--dim)">${ic('panel-left', 18)}</span>
    <span class="nt" data-a="nbtitle">${esc(N.title)}${caret(N.titleCaret)}</span>${tools}<span class="sep"></span>
    <span class="input" style="height:32px;color:var(--text)">Ballpoint ${ic('chevron-down', 13)}</span><span style="display:flex;margin-left:8px">${dots}</span><span class="sep"></span>${modeSw}
    <span style="margin-left:auto;display:flex;gap:2px;align-items:center"><span class="tool">${ic('ruler', 18)}</span><span class="tool ${N.micOn ? 'on' : ''}" data-a="mic">${ic('mic', 18)}</span><span class="tool">${ic('audio-waveform', 18)}</span>
    <span class="tool">${ic('columns-2', 18)}</span><span class="tool" data-a="nbmenu">${ic('ellipsis', 18)}</span><span class="tool">${ic('undo-2', 18)}</span></span></div>`;
  return bar + sidebar(N) + canvas(N, t) + (N.paste ? pasteSheet(N.paste, t) : '');
}
function sidebar(N) {
  const pages = N.pages.map((p, i) => {
    const h = p.kind === 'live' ? 120 : 200, inner = p.kind === 'live'
      ? `<div style="position:absolute;left:8px;top:8px;font-size:9px;font-weight:600">Harmonic Wave Superposition</div><span class="tag" style="position:absolute;right:6px;top:6px;font-size:8px">LIVE</span>
         <svg style="position:absolute;left:8px;top:34px" width="134" height="60"><path d="${wavePath(134, 60, 2, 0, 1)}" stroke="#f5a524" stroke-width="1.5" fill="none"/></svg>`
      : thumbInk(p);
    return `<div class="thumb ${p.kind === 'live' ? 'live' : ''} ${N.sel === i ? 'on' : ''}" data-a="thumb-${i}" style="height:${h}px;${p.kind === 'ink' ? 'background-image:linear-gradient(var(--rule) .5px,transparent .5px),linear-gradient(90deg,var(--rule) .5px,transparent .5px);background-size:6.4px 6.4px' : ''}">${inner}<span class="n">${i + 1}</span></div>`;
  }).join('');
  return `<div class="nside"><div class="ntabs"><span class="on">Pages</span><span>Bookmarks</span><span>Outline</span></div>
    <div class="input" style="margin-top:10px;height:30px;font-size:12.5px">Go to page (1–${N.pages.length})</div>${pages}</div>`;
}
function thumbInk(p) {
  let s = '', k = 150 / PAGE.w;
  for (const it of p.items || []) {
    if (it.k === 'hand' && it.p > 0) s += `<div style="position:absolute;left:${it.x * k}px;top:${(it.y + it.size * .35) * k}px;width:${it.w * k * Math.min(1, it.p)}px;height:${Math.max(2, it.size * k * .45)}px;background:${it.col || 'var(--ink)'};opacity:.55;border-radius:2px"></div>`;
    if (it.k === 'diagram' && it.op > 0) s += `<div style="position:absolute;left:${(it.x - 60) * k}px;top:${(it.y - 10) * k}px;width:${120 * k}px;height:${300 * k}px;opacity:${it.op}">
      <svg width="${120 * k}" height="${300 * k}" viewBox="0 0 120 300"><path d="M20 10 H100 M60 10 V40 l-22 10 44 14 -44 14 44 14 -44 14 44 14 -22 10 V160" stroke="var(--ink)" stroke-width="5" fill="none"/><circle cx="60" cy="214" r="52" stroke="var(--ink)" stroke-width="6" fill="none"/></svg></div>`;
    if (it.k === 'tape' && it.p > 0) s += `<div style="position:absolute;left:${it.x * k}px;top:${it.y * k}px;width:${it.w * k * it.p}px;height:${it.h * k}px;background:#f5a524"></div>`;
  }
  return s;
}
export function wavePath(w, h, f1, ph, depth = .65, ratio = 3.5, n = 160) {
  let d = '';
  for (let i = 0; i <= n; i++) { const x = i / n, a = 2 * Math.PI * f1 * x + ph;
    const y = (Math.sin(a) + depth * Math.sin(a * ratio * .5)) / (1 + depth);
    d += (i ? 'L' : 'M') + (x * w).toFixed(1) + ' ' + (h / 2 - y * h * .4).toFixed(1); }
  return d;
}
function canvas(N, t) {
  const live = N.pages.some(p => p.kind === 'live');
  let col = '';
  const p1 = N.pages[0], p2 = N.pages[N.pages.length - 1];
  col += inkPage(p1, P1Y, 'p1', N);
  if (N.gap) col += `<div class="gap" data-a="gap" style="left:${PAGE.x}px;top:${GAPY}px;width:${PAGE.w}px;opacity:${N.gap}"><i></i><b>${ic('plus', 16, 2)}</b></div>`;
  if (live) col += livePage(N.live, LIVEY, t);
  col += inkPage(p2, page2Y(live), 'p2', N);
  if (N.insert) col += `<div class="menu" style="left:${PAGE.x + PAGE.w / 2 - 20}px;top:${GAPY + 34}px;width:190px;opacity:${Math.min(1, N.insert.p * 3)};transform:scale(${.9 + .1 * N.insert.p})">
      <div class="${N.insert.hl === 0 ? 'hl' : ''}">${ic('pen-line', 15)}Ink page</div><div class="${N.insert.hl === 1 ? 'hl' : ''}">${ic('file-text', 15)}Text page</div>
      <div class="${N.insert.hl === 2 ? 'hl' : ''}" data-a="menu-live">${ic('sparkles', 15, 1.5, 'var(--live)')}Live page</div></div>`;
  let over = '';
  if (N.audio) over += audioBar(N.audio);
  if (N.trans) over += transcript(N.trans);
  if (N.nbmenu) over += `<div class="menu" style="right:14px;top:6px;width:300px;opacity:${Math.min(1, N.nbmenu.p * 3)};transform:scale(${.94 + .06 * N.nbmenu.p});transform-origin:100% 0">
      <div>Speech-to-text note (Sarvam AI)...</div><div class="${N.nbmenu.hl ? 'hl' : ''}" data-a="menu-flash">${ic('book-open', 15)}Generate flashcards from Tape</div><div>Export…</div><div>Export backup (.opennote)</div></div>`;
  return `<div class="canvas"><div class="pagecol" style="transform:translateY(${-N.scroll}px)">${col}</div>${over}</div>`;
}
function inkPage(p, y, id, N) {
  let s = '';
  for (const it of p.items || []) s += inkItem(it, id);
  return `<div class="page grid" data-a="${id}" style="left:${PAGE.x}px;top:${y}px;width:${PAGE.w}px;height:${PAGE.h}px">${s}</div>`;
}
// a handwritten line appears left → right like ink being written (clip), the pen tip at the edge
function inkItem(it, id) {
  if (it.k === 'hand') {
    if (it.p <= 0) return '';
    return `<div class="hand" data-a="${it.id || ''}" style="left:${it.x}px;top:${it.y}px;font-size:${it.size}px;color:${it.col || 'var(--ink)'};${it.p < 1 ? `clip-path:inset(-20px ${100 - it.p * 100}% -20px -10px)` : ''}">${it.html}</div>`;
  }
  if (it.k === 'diagram') {
    if (it.op <= 0) return '';
    const { x, y, spring = 1, circ = 0, snap = 0, sel = 0 } = it;
    // rough hand circle (wobbly), drawn progressively; at snap it morphs to a clean circle
    const rough = roughCircle(60, 214, 54, 9), clean = 'M60 162 A52 52 0 1 1 59.9 162';
    const sp = `<path d="M20 10 H100 M30 10 l-10 -10 M50 10 l-10 -10 M70 10 l-10 -10 M90 10 l-10 -10" stroke="var(--ink)" stroke-width="3" fill="none" stroke-linecap="round" opacity="${Math.min(1, spring * 6)}"/>
      <path d="M60 10 V40 l-22 10 44 14 -44 14 44 14 -44 14 44 14 -22 10 V160" stroke="var(--ink)" stroke-width="3.4" fill="none" stroke-linejoin="round" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - spring}"/>`;
    const c = snap > 0
      ? `<path d="${clean}" stroke="var(--ink)" stroke-width="4" fill="none" style="transform:scale(${1 + .08 * Math.sin(snap * Math.PI) * (1 - snap)});transform-origin:60px 214px"/>`
        + (snap < 1 ? `<path d="${rough}" stroke="var(--ink)" stroke-width="4" fill="none" opacity="${1 - snap}"/>` : '')
      : `<path d="${rough}" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - circ}"/>`;
    const selBox = sel ? `<rect x="-14" y="-14" width="148" height="296" rx="4" fill="var(--accentT)" stroke="var(--accent)" stroke-width="2" stroke-dasharray="7 5" opacity="${sel}"/>` : '';
    return `<svg data-a="diag-${id}" style="position:absolute;left:${x - 60}px;top:${y}px;overflow:visible;opacity:${it.op};transform:translate(${it.dx || 0}px,${it.dy || 0}px)" width="120" height="270" viewBox="0 0 120 270">${selBox}${sp}${circ > 0 || snap > 0 ? c : ''}
      <rect data-a="mass-${id}" x="8" y="162" width="104" height="104" fill="none"/></svg>`;
  }
  if (it.k === 'lasso') {
    if (it.p <= 0) return '';
    return `<svg style="position:absolute;left:0;top:0;overflow:visible" width="${PAGE.w}" height="${PAGE.h}"><path d="M330 236 C 440 226, 470 330, 452 430 S 440 560, 330 562 S 206 540, 214 420 S 220 246, 330 236" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="8 6" fill="none" pathLength="1" stroke-dashoffset="0" opacity="${it.op ?? 1}" style="clip-path:inset(0 0 ${100 - it.p * 100}% 0)"/></svg>`;
  }
  if (it.k === 'tape') {
    if (it.p <= 0) return '';
    return `<div class="tape" data-a="tape" style="left:${it.x - 6}px;top:${it.y}px;width:${(it.w + 12) * it.p}px;height:${it.h}px;opacity:${it.op ?? 1}"></div>`;
  }
  return '';
}
function roughCircle(cx, cy, r, wob) {
  let d = '';
  for (let i = 0; i <= 60; i++) { const a = -Math.PI / 2 + i / 60 * Math.PI * 2.08, rr = r + Math.sin(i * .9) * wob * .35 + Math.cos(i * .37) * wob * .5 + (i > 52 ? (i - 52) * 1.2 : 0);
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr * 1.05).toFixed(1) + ' ' + (cy + Math.sin(a) * rr * .96).toFixed(1); }
  return d;
}
function livePage(L, y, t) {
  const f1 = L.f1, ph = L.ph;
  // the highest point of the superposition in the middle of the plot (where the pen circles it)
  let pk = { x: 300, y: 50 }; for (let i = 0; i <= 200; i++) { const x = 600 * (.3 + .4 * i / 200), a = 2 * Math.PI * f1 * x / 600 + ph * .6, y = 125 - (Math.sin(a) + .65 * Math.sin(a * 1.75)) / 1.65 * 100; if (y < pk.y || i === 0) pk = { x, y }; }
  const W = 600, H = 250;
  const ann = L.ann || {};
  return `<div class="livepage" data-a="livepage" style="left:${PAGE.x}px;top:${y}px;width:${PAGE.w}px;height:${LIVEH}px;opacity:${L.op ?? 1};transform:scale(${L.sc ?? 1});transform-origin:50% 0">
    <div class="lph" data-a="livehead"><span class="tag">LIVE</span>Harmonic Wave Superposition<span class="r"><span>HTML</span><span data-a="globe">${ic('globe', 15)}</span>${ic('maximize-2', 15)}${ic('rotate-cw', 15)}</span></div>
    <div class="art"><h3>Harmonic Wave Superposition <small>Interactive Live Page</small></h3>
      <div class="plot" data-a="plot"><svg width="${W}" height="${H}" style="position:absolute;left:4px;top:0">
        <path d="M0 ${H / 2} H${W}" stroke="#2a2d37"/>
        <path d="${wavePath(W, H, f1, ph * .6, 0)}" stroke="#3ddc97" stroke-width="1.6" fill="none" opacity=".75"/>
        <path d="${wavePath(W, H, f1, ph * .6, .65)}" stroke="#f5a524" stroke-width="3.2" fill="none"/>
        <rect data-a="peak" x="${pk.x - 2}" y="${pk.y - 2}" width="4" height="4" fill="none"/>${ann.c > 0 ? `<path d="${roughCircle(pk.x, pk.y, 34, 6)}" stroke="#f5a524" stroke-width="3.4" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1 - ann.c}" stroke-linecap="round"/>` : ''}
      </svg>${ann.w > 0 ? `<div class="hand" style="left:${pk.x + 48}px;top:${Math.max(0, pk.y - 52)}px;font-size:40px;color:#f5a524;clip-path:inset(-20px ${100 - ann.w * 100}% -20px -10px)">max!</div>` : ''}</div>
      <div class="sliders">${[['Carrier Frequency (f1)', f1.toFixed(1) + ' Hz', (f1 - 1) / 4], ['Harmonic Ratio (f2)', '3.5 Hz', .5], ['Modulation Depth', '0.65', .65]]
        .map(([n, v, k], i) => `<div class="sl" data-a="sl-${i}">${n}<span class="v">${v}</span><div class="tr"><i style="width:${k * 100}%"></i><b data-a="thumb-sl-${i}" style="left:calc(${k * 100}% - 9px)"></b></div></div>`).join('')}</div>
    </div></div>`;
}
function pasteSheet(P, t) {
  const code = [
    '<span class="k">&lt;!DOCTYPE html&gt;</span>', '<span class="k">&lt;html&gt;</span>', '<span class="k">&lt;head&gt;</span>&lt;title&gt;Harmonic Wave Superposition&lt;/title&gt;',
    '<span class="k">&lt;style&gt;</span> body { background:#16171c; color:#e8e9ee }', '<span class="k">&lt;/head&gt;</span>', '<span class="k">&lt;body&gt;</span>',
    '  &lt;canvas id=<span class="s">"plot"</span>&gt;&lt;/canvas&gt;', '  &lt;input type=<span class="s">"range"</span> id=<span class="s">"f1"</span> min=<span class="s">"1"</span> max=<span class="s">"5"</span>&gt;',
    '<span class="k">&lt;script&gt;</span>', '  <span class="k">const</span> wave = (x, f) =&gt; Math.sin(2 * Math.PI * f * x);', '  <span class="c">// carrier + harmonic, redrawn every frame</span>',
    '  <span class="k">function</span> draw(t) { … requestAnimationFrame(draw) }', '<span class="k">&lt;/script&gt;</span>', '<span class="k">&lt;/body&gt;&lt;/html&gt;</span>'];
  const shown = code.slice(0, P.lines).join('\n');
  const prev = P.prev > 0 ? `<div style="position:absolute;inset:0;background:#16171c;color:#e8e9ee;padding:18px 20px;opacity:${P.prev}"><div style="font-weight:600;font-size:17px">Harmonic Wave Superposition</div>
      <svg width="420" height="200" style="margin-top:16px"><path d="${wavePath(420, 200, 2, t * 1.3, .65)}" stroke="#f5a524" stroke-width="2.6" fill="none"/></svg></div>` : `<div style="position:absolute;inset:0;display:grid;place-items:center" class="dim">Preview appears here.</div>`;
  return `<div class="scrim" style="opacity:${P.p}"></div><div class="sheet" style="left:${(WIN.w - 1100) / 2}px;top:70px;width:1100px;height:660px;opacity:${Math.min(1, P.p * 2)};transform:translateY(${(1 - P.p) * 40}px)">
    <div style="display:flex;align-items:center;height:58px;padding:0 22px;border-bottom:1px solid var(--line)"><h4>New live page</h4><span class="btn ghost icon" style="margin-left:auto">${ic('x', 16)}</span></div>
    <div style="position:absolute;left:22px;top:76px;width:560px">
      <div style="display:flex;gap:10px"><div class="input" style="flex:1;color:var(--text)">${P.lines ? 'Harmonic Wave Superposition' : '<span class="dim">Live page</span>'}</div><div class="input" style="width:130px;color:var(--text)">Auto (HTML) ${ic('chevron-down', 13)}</div></div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px"><span class="btn ghost" data-a="pasteclip">Paste clipboard</span><span class="btn ghost">Open file</span><span class="dim" style="margin-left:auto;font-size:12px">Tab indents · Ctrl+M toggles Tab focus</span></div>
    </div>
    <div class="codebox ${P.focus ? 'focus' : ''}" data-a="code" style="left:22px;top:172px;width:560px;height:370px;${P.focus ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accentT)' : ''}">${P.lines ? shown : '<span class="dim" style="font-family:Inter">Paste the artifact code from Claude, ChatGPT or any AI here</span>'}${caret(P.caret)}</div>
    <div style="position:absolute;left:22px;top:556px;display:flex;align-items:center;gap:8px;font-size:13.5px" data-a="allownet"><span style="width:15px;height:15px;border:1.5px solid var(--dim);border-radius:3px"></span>${ic('globe', 14)} Allow internet for this page</div>
    <div style="position:absolute;left:604px;top:76px;width:474px;height:466px;border:1px solid var(--line);border-radius:6px;overflow:hidden">${prev}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:64px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;padding:0 22px">
      <span class="dim" style="font-size:12.5px">Ctrl+Enter to save</span><span class="btn" style="margin-left:auto">Cancel</span><span class="btn primary ${P.saveHot ? 'hot' : ''}" data-a="save">Save</span></div></div>`;
}
function audioBar(A) {
  const bars = []; for (let i = 0; i < 56; i++) { const v = .25 + .75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * .43)); if (i / 56 <= A.fill) bars.push(`<i style="position:absolute;left:${i * 6.4}px;top:${17 - v * 15}px;width:3.4px;height:${v * 30}px;border-radius:2px;background:${i / 56 <= A.play ? 'var(--accent)' : 'var(--dim)'};opacity:${i / 56 <= A.play ? 1 : .55}"></i>`); }
  const ph = A.play > 0 && A.play < 1 ? `<b style="position:absolute;left:${A.play * 56 * 6.4}px;top:0;width:2px;height:34px;background:var(--text)"></b>` : '';
  return `<div class="abar" data-a="abar" style="opacity:${A.op};transform:translateY(${(1 - A.op) * -48}px)">
    ${A.rec ? `<span class="rec" style="opacity:${A.blink ? 1 : .35}"></span><b style="color:var(--danger)">Stop · ${A.time}</b>` : `<span class="btn icon primary" style="width:30px;height:30px">${ic('play', 14, 2)}</span><b class="mono" style="font-weight:600">${A.time}</b>`}
    <div class="wave">${bars.join('')}${ph}</div>
    <span class="chip ${A.replay ? 'on' : ''}">Ink replay</span><span class="chip ${A.seek ? 'on' : ''}" data-a="seekbtn">Tap ink to seek</span><span class="chip" data-a="transbtn">Transcribe lecture</span></div>`;
}
function transcript(T) {
  const rows = [['00:12', 'Today: the damped harmonic oscillator.'], ['00:48', 'Equation of motion: m x double-dot plus b x-dot plus k x equals zero.'], ['01:30', 'When gamma is below omega zero, it is underdamped.'], ['02:14', 'The envelope decays as A e to the minus gamma t.']];
  return `<div class="tpanel" data-a="tpanel" style="right:0;top:48px;bottom:0;width:420px;transform:translateX(${(1 - T.p) * 440}px)">
    <div data-a="ttitle" style="display:flex;align-items:center;gap:10px;font-family:SG;font-weight:600;font-size:17px;width:250px">${ic('file-text', 17)}Synced Lecture Transcript</div>
    <div style="height:14px"></div>
    ${rows.map(([ts, tx], i) => i < T.n ? `<div class="row ${T.hl === i ? 'hl' : ''}" data-a="trow-${i}" style="opacity:${Math.min(1, (T.n - i) * 2)}"><span class="ts">${ts}</span><span>${tx}</span></div>` : '').join('')}</div>`;
}

// ───────── study set
export function study(Q) {
  return `<div class="study"><div class="tbar"><span class="tool">${ic('arrow-left', 18)}</span><span class="nt" style="min-width:0">Physics 201 · Damping</span><span class="dim mono" style="font-size:13px">3 cards</span></div>
    <div class="prog" style="left:300px;right:300px;top:96px"><span style="flex:1;background:var(--live)"></span><span style="flex:1;background:var(--accent)"></span><span style="flex:1;background:var(--dim)"></span></div>
    <div class="mono dim" style="position:absolute;left:300px;right:300px;top:116px;display:flex;gap:18px;font-size:12.5px"><span>New 1</span><span>Learning 1</span><span>Mastered 1</span><span>Due now 1 of 3</span><span style="margin-left:auto">Scheduler: <b style="color:var(--text)">FSRS-4.5 (Adaptive)</b></span></div>
    <div class="mono dim" style="position:absolute;left:0;right:0;top:150px;text-align:center;font-size:12.5px;opacity:${Q.metrics}">Retention 91% · Stability 2.4d · Difficulty 5.1</div>
    <div class="flash" data-a="flash" style="left:${(WIN.w - 620) / 2}px;top:186px;width:620px;height:340px;transform:perspective(1200px) rotateY(${Q.flip}deg) scale(${Q.sc ?? 1})">
      ${Math.abs(Q.flip) < 90 ? `<div class="hand" style="position:relative;font-size:62px">ζ &lt; 1 → <span style="display:inline-block;width:250px;height:52px;vertical-align:-6px" class="tape"></span></div>`
        : `<div style="transform:scaleX(-1);text-align:center"><div class="hand" style="position:relative;font-size:62px">underdamped</div><div class="dim" style="font-size:14px;margin-top:12px">ζ &lt; 1 → underdamped</div></div>`}</div>
    ${!Q.shown ? `<span class="btn primary ${Q.showHot ? 'hot' : ''}" data-a="show" style="position:absolute;left:${WIN.w / 2 - 80}px;top:560px;width:160px;height:46px;justify-content:center;font-size:15px">Show answer</span>`
      : `<div class="grades" style="left:${WIN.w / 2 - 258}px;top:560px;opacity:${Q.gp}">${[['Again', '1 min'], ['Hard', '8 min'], ['Good', '2 d'], ['Easy', '5 d']].map(([g, n], i) => `<span class="btn ${i === 2 && Q.goodHot ? 'on' : ''}" data-a="grade-${i}">${g}<span>${n}</span></span>`).join('')}</div>`}
    <div class="dim" style="position:absolute;left:0;right:0;top:640px;text-align:center;font-size:13px">Space shows the answer. Keys 1-4 rate it.</div></div>`;
}

// ───────── whiteboard
export function board(B) {
  const ox = -B.pan, items = [
    `<div class="sticky" style="left:${180 + ox}px;top:120px;background:#ffe39a;transform:rotate(-3deg)">midterm: ch. 4–6</div>`,
    `<div class="sticky" data-a="sticky2" style="left:${980 + ox}px;top:420px;background:#b8f0d8;transform:rotate(2deg)">ask about Q-factor</div>`,
    `<div class="hand" style="left:${520 + ox}px;top:160px;font-size:52px">ω<sub>d</sub> = √(ω<sub>0</sub>² − γ²)</div>`,
    `<svg style="position:absolute;left:${380 + ox}px;top:330px" width="520" height="240"><path d="${wavePath(500, 220, 2.5, 0, 0)}" stroke="var(--inkG)" stroke-width="3" fill="none"/><path d="M0 110 H500 M0 10 V220" stroke="var(--ink)" stroke-width="2" fill="none"/></svg>`,
    `<div class="hand" style="left:${1480 + ox}px;top:200px;font-size:46px;color:var(--ink2)">Q = ω₀ / 2γ</div>`,
    `<svg style="position:absolute;left:${1500 + ox}px;top:360px" width="260" height="220"><rect x="10" y="10" width="220" height="140" rx="10" stroke="var(--ink)" stroke-width="3" fill="none"/><path d="M40 120 L90 60 L140 100 L200 40" stroke="var(--ink2)" stroke-width="3" fill="none"/></svg>`];
  return `<div class="tbar"><span class="tool">${ic('arrow-left', 18)}</span><span class="nt">Exam prep board</span>${TOOLS.slice(0, 6).map(([n, i]) => `<span class="tool ${n === 'pen' ? 'on' : ''}">${ic(i, 18)}</span>`).join('')}</div>
    <div class="board" style="top:56px;background-position:${ox}px 0">${items.join('')}
    <div class="mini" style="right:18px;bottom:18px"><i style="left:16px;top:20px;width:30px;height:12px"></i><i style="left:60px;top:30px;width:50px;height:30px"></i><i style="left:120px;top:50px;width:40px;height:30px"></i><b style="left:${10 + B.pan / 28}px;top:14px;width:84px;height:84px"></b></div></div>`;
}

// ───────── sync panel (Account · Sync)
export function syncPanel(Y) {
  return `<div class="scrim" style="opacity:${Y.p}"></div><div class="syncp" data-a="syncp" style="left:${(WIN.w - 620) / 2}px;top:90px;width:620px;opacity:${Math.min(1, Y.p * 2)};transform:translateY(${(1 - Y.p) * 30}px)">
    <div style="display:flex;align-items:center;gap:10px"><h4 style="font-family:SG;font-size:22px;font-weight:600">Sync</h4></div>
    <div style="margin-top:18px;font-size:13.5px;font-weight:600">Sync passphrase</div>
    <div class="input ${Y.focus ? 'focus' : ''}" data-a="pass" style="margin-top:8px;height:42px;font-size:20px;letter-spacing:4px;color:var(--text)">${'•'.repeat(Y.dots)}${caret(Y.focus && !Y.unlocked)}</div>
    <p class="dim" data-a="encline" style="margin-top:10px;font-size:14px;line-height:1.5">Everything is encrypted on this device before upload. First time on this account? This sets it.</p>
    <span class="btn primary ${Y.hot ? 'hot' : ''}" data-a="unlock" style="margin-top:14px;height:40px">${ic('lock', 15)}Unlock sync</span>
    <div style="margin-top:22px;font-size:13.5px;font-weight:600">Storage</div>
    <div class="tier">${ic('cloud', 17)}OpenNote cloud<span class="ok" style="opacity:${Y.c[0]}">Connected</span></div>
    <div class="tier">${ic('send', 17)}Your Telegram bot<span class="ok" style="opacity:${Y.c[1]}">Connected</span></div>
    <div class="tier">${ic('hard-drive', 17)}IPFS (Pinata)<span class="ok" style="opacity:${Y.c[2]}">Connected</span></div></div>`;
}
