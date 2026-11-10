import { render, screen } from "@testing-library/react";
import { detectPlatform, GetOpenNote, parseRelease } from "../../src/landing/GetOpenNote";

const RELEASE = {
  tag_name: "v0.2.0",
  assets: [
    { name: "OpenNote-android.apk", size: 6_900_000, browser_download_url: "https://github.com/x/releases/download/v0.2.0/OpenNote-android.apk" },
    { name: "OpenNote-windows-setup.exe", size: 4_200_000, browser_download_url: "https://github.com/x/releases/download/v0.2.0/OpenNote-windows-setup.exe" },
  ],
};

beforeEach(() => { try { sessionStorage.clear(); } catch { /* none */ } });

describe("platform", () => {
  it("tells Android, Windows and everything else apart", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("other");
  });
});

describe("release", () => {
  it("picks the APK and EXE out of the latest GitHub release", () => {
    expect(parseRelease(RELEASE)).toEqual({
      tag: "v0.2.0",
      apk: { url: RELEASE.assets[0].browser_download_url, mb: 6.9 },
      exe: { url: RELEASE.assets[1].browser_download_url, mb: 4.2 },
    });
    expect(parseRelease({ message: "Not Found" })).toBeNull();
  });
});

describe("Get OpenNote section", () => {
  it("before the first release: Continue on web works, downloads say 'coming soon' (no dead links)", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })) as unknown as typeof fetch;
    render(<GetOpenNote />);
    expect(screen.getByRole("button", { name: /continue on the web/i })).toBeTruthy();
    expect((await screen.findAllByText(/first release coming soon/i)).length).toBe(2);
    expect(document.querySelector('a[href*="/download/"]')).toBeNull();
  });

  it("with a release: real download links with version and size", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(RELEASE))) as unknown as typeof fetch;
    render(<GetOpenNote />);
    const apk = await screen.findByRole("link", { name: /download for android/i });
    expect(apk.getAttribute("href")).toBe(RELEASE.assets[0].browser_download_url);
    expect(screen.getByRole("link", { name: /download for windows/i }).getAttribute("href")).toBe(RELEASE.assets[1].browser_download_url);
    expect(screen.getAllByText(/v0\.2\.0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/6\.9 MB/)).toBeTruthy();
  });
});
