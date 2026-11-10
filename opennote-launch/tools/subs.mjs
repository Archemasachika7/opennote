// burned-in caption timing (+ the last line, spoken over the on-screen title) → out/subs.json, then core/render/srt.py makes the .srt
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { openDemo, closeServer } = await import(pathToFileURL(path.join(process.env.LIB, 'core/render/page.mjs')).href);
const { browser, page } = await openDemo(dir);
const subs = await page.evaluate(() => window.SUBS.map(s => ({ t0: +s.t0.toFixed(2), t1: +s.t1.toFixed(2), text: s.text })));
fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
fs.writeFileSync(path.join(dir, 'out/subs.json'), JSON.stringify(subs, null, 1)); console.log('subs', subs.length);
await browser.close(); closeServer();
