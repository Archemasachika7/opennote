import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeAttributes } from "@tiptap/core";

// Security review 2026-11-12, finding #1: GHSA-cp6q-959q-f8rh (prototype pollution -> DOM XSS in
// mergeAttributes), fixed in @tiptap/core 3.30.4.
describe("tiptap is past the mergeAttributes advisory", () => {
  it("installs @tiptap/core 3.30.4 or newer", () => {
    const { version } = JSON.parse(readFileSync("node_modules/@tiptap/core/package.json", "utf8")) as { version: string };
    const [maj, min, pat] = version.split(".").map((n) => parseInt(n, 10));
    expect(maj > 3 || (maj === 3 && (min > 30 || (min === 30 && pat >= 4)))).toBe(true);
  });

  it("does not turn a __proto__ key into inherited attributes", () => {
    const hostile = JSON.parse('{"__proto__": {"onerror": "alert(1)"}}') as Record<string, unknown>;
    const merged = mergeAttributes({ class: "a" }, hostile);
    expect((merged as Record<string, unknown>).onerror).toBeUndefined();
    expect(({} as Record<string, unknown>).onerror).toBeUndefined();
  });
});
