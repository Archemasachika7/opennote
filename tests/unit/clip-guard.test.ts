import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipBlockedError, fetchPageHtml, isPrivateHost } from "../../src/clip/clip";

const cap = vi.hoisted(() => ({ native: false, get: vi.fn() }));
vi.mock("@capacitor/core", async (orig) => {
  const real = await orig<typeof import("@capacitor/core")>();
  return { ...real, Capacitor: { ...real.Capacitor, isNativePlatform: () => cap.native }, CapacitorHttp: { get: cap.get } };
});

afterEach(() => { vi.unstubAllGlobals(); cap.native = false; cap.get.mockReset(); });

describe("clip fetch guard (security review #6)", () => {
  it.each([
    "http://localhost/", "http://foo.localhost/", "http://printer.local/", "http://db.internal/",
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://0.0.0.0/",
    "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.255.255/", "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/",
    "http://[::1]/", "http://[fe80::1]/", "http://[fd00::1]/", "http://[::ffff:192.168.0.1]/",
  ])("treats %s as private", (url) => {
    expect(isPrivateHost(new URL(url).hostname)).toBe(true);
  });

  it.each(["https://example.com/", "https://172.32.0.1/", "https://8.8.8.8/", "https://[2606:4700::1111]/", "https://en.wikipedia.org/wiki/X"])(
    "allows public %s", (url) => {
      expect(isPrivateHost(new URL(url).hostname)).toBe(false);
    });

  it("refuses a private address without fetching it", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(fetchPageHtml("http://192.168.1.1/admin")).rejects.toBeInstanceOf(ClipBlockedError);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses links that aren't web pages (file:, data:, ...)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(fetchPageHtml("file:///etc/passwd")).rejects.toBeInstanceOf(ClipBlockedError);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a public link that redirects to a private address", async () => {
    const res = new Response("<html><title>router</title></html>", { headers: { "content-type": "text/html" } });
    Object.defineProperty(res, "url", { value: "http://192.168.1.1/" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
    await expect(fetchPageHtml("https://short.example/abc")).rejects.toBeInstanceOf(ClipBlockedError);
  });

  describe("Android native HTTP (no CORS)", () => {
    const native = async (responses: Array<{ status: number; headers?: Record<string, string>; data?: string }>) => {
      cap.native = true;
      for (const r of responses) cap.get.mockResolvedValueOnce({ url: "", headers: {}, data: "", ...r });
      return cap.get;
    };

    it("checks a redirect target before requesting it", async () => {
      const get = await native([{ status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data/" } }]);
      await expect(fetchPageHtml("https://short.example/abc")).rejects.toBeInstanceOf(ClipBlockedError);
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0][0]).toMatchObject({ url: "https://short.example/abc", disableRedirects: true });
    });

    it("follows public redirects hop by hop", async () => {
      const get = await native([
        { status: 301, headers: { location: "/post" } },
        { status: 200, data: "<html>moved ok</html>" },
      ]);
      await expect(fetchPageHtml("http://example.com/old")).resolves.toContain("moved ok");
      expect(get.mock.calls[1][0]).toMatchObject({ url: "http://example.com/post", disableRedirects: true });
    });

    it("gives up after too many redirects", async () => {
      await native(Array.from({ length: 10 }, (_, i) => ({ status: 302, headers: { Location: `https://example.com/${i}` } })));
      await expect(fetchPageHtml("https://example.com/start")).rejects.toBeInstanceOf(ClipBlockedError);
    });
  });

  it("still clips an ordinary public page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>ok</html>", { headers: { "content-type": "text/html" } })));
    await expect(fetchPageHtml("https://example.com/post")).resolves.toContain("ok");
  });
});
