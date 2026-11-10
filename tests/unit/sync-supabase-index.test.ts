// @vitest-environment node
import { fromPgBytea, supabaseIndex, toPgBytea } from "../../src/sync/supabaseIndex";

it("round-trips bytes through Postgres bytea hex text", () => {
  const u = Uint8Array.from([0, 1, 15, 16, 254, 255]);
  expect(toPgBytea(u)).toBe("\\x00010f10feff");
  expect(Array.from(fromPgBytea(toPgBytea(u)))).toEqual(Array.from(u));
  expect(() => fromPgBytea("\\xabc")).toThrow();
});

it("compare-and-swap only succeeds when the version still matches", async () => {
  const eqs: [string, unknown][] = [];
  let rows: unknown[] = [{ id: "n1" }];
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn((k: string, v: unknown) => { eqs.push([k, v]); return chain; }),
    select: vi.fn(async () => ({ data: rows, error: null })),
  };
  const client = { from: vi.fn(() => chain) } as never;
  const idx = supabaseIndex(client, "u1");
  expect(await idx.casUpdate("n1", 4, { version: 5 })).toBe(true);
  expect(eqs).toEqual([["id", "n1"], ["version", 4]]);
  rows = [];
  expect(await idx.casUpdate("n1", 4, { version: 5 })).toBe(false);
});

it("treats a duplicate insert as 'someone else created it'", async () => {
  const client = { from: () => ({ insert: async () => ({ error: { code: "23505", message: "dup" } }) }) } as never;
  expect(await supabaseIndex(client, "u1").insertRow({ id: "n1", title: "", kind: "notebook", version: 1, manifest_object: null, deleted_at: null })).toBe(false);
});
