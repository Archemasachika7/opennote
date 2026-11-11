import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { installUuid, uuidV4 } from "../../src/platform/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it("makes valid, different v4 ids", () => {
  const a = uuidV4(), b = uuidV4();
  expect(a).toMatch(V4);
  expect(a).not.toBe(b);
});

it("creates a notebook when the browser has no crypto.randomUUID (plain http on a network address)", async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  const saved = Object.getOwnPropertyDescriptor(c, "randomUUID") ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(c), "randomUUID");
  Object.defineProperty(c, "randomUUID", { value: undefined, configurable: true, writable: true });
  try {
    installUuid();
    expect(c.randomUUID!()).toMatch(V4);
    const nb = await createNotebook({ title: "Over Wi-Fi" });
    expect(nb.id).toMatch(V4);
    expect(await getPages(nb.id)).toHaveLength(1);
  } finally {
    if (saved) Object.defineProperty(c, "randomUUID", saved); else delete (c as { randomUUID?: unknown }).randomUUID;
  }
});
