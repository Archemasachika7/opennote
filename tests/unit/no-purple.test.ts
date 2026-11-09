import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(css|ts|tsx)$/.test(p) ? [p] : [];
  });
}
function hsl(hex: string): { h: number; s: number; l: number } {
  const n = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

it("the app uses no purple/violet/magenta colours (brand rule)", () => {
  const offenders: string[] = [];
  for (const f of files("src")) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const { h, s } = hsl(m[0]);
      if (s > 0.2 && h >= 240 && h <= 330) offenders.push(`${f}: ${m[0]}`);
    }
    if (/\b(purple|violet|indigo|magenta)\b/i.test(text)) offenders.push(`${f}: named purple colour`);
  }
  expect(offenders).toEqual([]);
});
