import * as FM from './film.js';
const q = new URLSearchParams(location.search);
await Promise.all([document.fonts.load('80px Caveat'), document.fonts.load('600 80px Caveat'), document.fonts.load('80px "Reenie Beanie"')]);
const words = await (await fetch('voices/words.json')).json(), durs = await (await fetch('voices/dur.json')).json();
FM.build(words, durs);
if (q.has('ev')) { const s = document.createElement('canvas'); s.width = s.height = 4; FM.sweep(s.getContext('2d')); }
window.DUR = FM.DUR;
window.EV = FM.EV.slice().sort((a, b) => a.t - b.t);
window.SUBS = FM.SUBS.map(s => ({ t0: s.t0, t1: s.t1, text: s.text }));
window.T = FM.T;
const ctx = document.getElementById('c').getContext('2d');
window.render = t => FM.render(ctx, t);
window.TEXTS = () => [];
window.render(+(q.get('t') || 0));
window.READY = true;
