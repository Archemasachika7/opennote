// Extracts the Lucide icons the real OpenNote UI uses (ISC licence) into ../icons.js
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
const names = ['pen-line','highlighter','eraser','lasso','shapes','rectangle-horizontal','presentation','type','image','hand','arrow-left','panel-left','undo-2','redo-2','mic','audio-waveform','columns-2','ruler','search','command','user','settings','upload','folder-plus','plus','star','trash-2','layout-grid','list','square-check','sparkles','file-text','globe','maximize-2','rotate-cw','ellipsis','play','square','circle','layers','book-open','presentation','lock','check','cloud','send','hard-drive','shield-check','chevron-down','zoom-in','zoom-out','x'];
let out = '// Lucide icons (ISC licence, lucide.dev), as used by the OpenNote UI\nexport const ICONS = {\n';
for (const n of [...new Set(names)]) {
  const f = path.join(dir, n + '.mjs'); if (!fs.existsSync(f)) { console.error('missing', n); continue; }
  const m = await import(pathToFileURL(f).href); if (!m.__iconData) { console.error('alias', n, fs.readFileSync(f,'utf8').match(/from '([^']+)'/g)); continue; }
  const inner = m.__iconData.node.map(([tag, a]) => `<${tag} ${Object.entries(a).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
  out += `  '${n}': '${inner}',\n`;
}
out += '};\nexport const ic = (n, s = 18, sw = 1.5, col = "currentColor") => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${ICONS[n] || ""}</svg>`;\n';
fs.writeFileSync(path.join(here, '..', 'icons.js'), out); console.log('icons.js written');
