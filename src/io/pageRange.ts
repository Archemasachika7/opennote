/** Parse "2-5, 8" (1-based) into sorted unique 0-based page indices; throws a readable error. */
export function parsePageRange(text: string, total: number): number[] {
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = 'Use page numbers like "2-5, 8"';
  if (parts.length === 0) throw new Error(bad);
  const out = new Set<number>();
  for (const part of parts) {
    const m = /^([0-9]+)(?:[ ]*-[ ]*([0-9]+))?$/.exec(part);
    if (!m) throw new Error(bad);
    let a = Number(m[1]);
    let b = m[2] ? Number(m[2]) : a;
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > total) throw new Error(`Pages go from 1 to ${total}`);
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}
