import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// User rule (2026-11-10): no decorative gradients, no neon glow, no green/red lights.
// Paper ruling, board grids, ruler ticks and tape hatching are patterns, not decoration, and live
// in notebook/ink/board/library CSS; the surfaces below must stay flat.
const FLAT = ["src/landing", "src/ui"];
const files = FLAT.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".css")).map((f) => join(d, f)));

it("landing and UI styles have no gradients", () => {
  for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/gradient\(/);
});

it("nothing glows (no blurred coloured halos)", () => {
  // a glow has three lengths with a blur (0 0 10px colour); a solid ring (0 0 0 2px colour) is fine
  const glow = /box-shadow:(?:[^;]*,)?\s*0 0 [1-9]\d*px\s+(?:var\(--(?:live|accent|danger)\)|#|rgb|color-mix)|text-shadow:[^;]*var\(--(?:live|accent)\)/;
  for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(glow);
});

it("the sync error state is not a red light", () => {
  expect(readFileSync("src/ui/account.css", "utf8")).not.toMatch(/#e5484d|#ff2a2a|var\(--danger\)/);
});

it("headline colours come from theme tokens, so light mode can't make them vanish", () => {
  const css = readFileSync("src/landing/landing.css", "utf8");
  expect(css).not.toMatch(/color:\s*#f4f1ea/i);
  const tokens = readFileSync("src/ui/tokens.css", "utf8");
  expect(tokens.match(/--display:/g)?.length).toBe(2); // dark and light
});

it("the landing page has no green or teal (mint/cyan) anywhere", () => {
  const dir = "src/landing";
  for (const f of readdirSync(dir).map((x) => join(dir, x))) {
    expect(readFileSync(f, "utf8"), f).not.toMatch(/3ddc97|4fd1c5|0d7a4e|0e7490|var\(--live\)|var\(--study\)/i);
  }
});
