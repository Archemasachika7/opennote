import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipBlockedError, fetchPageHtml, isPrivateHost } from "../../src/clip/clip";

afterEach(() => vi.unstubAllGlobals());

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

  it("still clips an ordinary public page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>ok</html>", { headers: { "content-type": "text/html" } })));
    await expect(fetchPageHtml("https://example.com/post")).resolves.toContain("ok");
  });
});
