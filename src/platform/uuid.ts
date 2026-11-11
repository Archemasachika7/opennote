/**
 * `crypto.randomUUID()` only exists in secure contexts (https, localhost, the native apps). Opened over
 * plain http on a network address (a phone or tablet on the same Wi-Fi as the dev machine), it is
 * missing, and every new notebook, page, stroke and object failed to get an id. This installs a
 * standards-shaped v4 UUID in its place, from `crypto.getRandomValues` (available everywhere).
 * Imported first by main.tsx and by the store, so it runs before anything makes an id.
 */
export function uuidV4(): string {
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function installUuid(): void {
  const c = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  if (!c) {
    (globalThis as { crypto?: unknown }).crypto = { randomUUID: uuidV4, getRandomValues: <T extends ArrayBufferView>(a: T) => a };
    return;
  }
  if (typeof c.randomUUID === "function") return;
  try {
    Object.defineProperty(c, "randomUUID", { value: uuidV4, configurable: true, writable: true });
  } catch {
    (c as { randomUUID?: () => string }).randomUUID = uuidV4;
  }
}

installUuid();
