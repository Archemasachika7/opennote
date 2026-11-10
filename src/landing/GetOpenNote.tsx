import { useEffect, useState } from "react";
import { Globe, Monitor, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { navigate } from "../App";

const REPO = "Archemasachika7/opennote";
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
const CACHE = "opennote:latest-release";

export type Platform = "android" | "windows" | "other";
export function detectPlatform(ua: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): Platform {
  if (/android/i.test(ua)) return "android";
  if (/windows/i.test(ua)) return "windows";
  return "other";
}

export interface ReleaseInfo { tag: string; apk: { url: string; mb: number } | null; exe: { url: string; mb: number } | null }

type GhAsset = { name?: string; size?: number; browser_download_url?: string };
export function parseRelease(json: unknown): ReleaseInfo | null {
  const r = json as { tag_name?: string; assets?: GhAsset[] };
  if (!r || typeof r.tag_name !== "string" || !Array.isArray(r.assets)) return null;
  const pick = (name: string) => {
    const a = r.assets!.find((x) => x.name === name && typeof x.browser_download_url === "string");
    return a ? { url: a.browser_download_url!, mb: Math.round((a.size ?? 0) / 100_000) / 10 } : null;
  };
  return { tag: r.tag_name, apk: pick("OpenNote-android.apk"), exe: pick("OpenNote-windows-setup.exe") };
}

const LATEST = `https://github.com/${REPO}/releases/latest/download`;
/** Version and size unknown, but these redirect to the newest release's files without the API. */
const FALLBACK: ReleaseInfo = {
  tag: "latest",
  apk: { url: `${LATEST}/OpenNote-android.apk`, mb: 0 },
  exe: { url: `${LATEST}/OpenNote-windows-setup.exe`, mb: 0 },
};

/** The latest GitHub release (CI attaches the APK and EXE to every v* tag). null = none yet. */
function useLatestRelease(): { loading: boolean; release: ReleaseInfo | null } {
  const [state, setState] = useState<{ loading: boolean; release: ReleaseInfo | null }>({ loading: true, release: null });
  useEffect(() => {
    let alive = true;
    try {
      const hit = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as { at: number; release: ReleaseInfo | null } | null;
      if (hit && Date.now() - hit.at < 10 * 60_000) { setState({ loading: false, release: hit.release }); return; }
    } catch { /* no cache */ }
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
      // only a 404 means "no release yet"; a rate limit (60/hour per IP, easy on campus Wi-Fi) or being
      // offline must not hide real downloads, so fall back to the redirect links that need no API
      .then(async (res) => (res.ok ? parseRelease(await res.json()) : res.status === 404 ? null : FALLBACK))
      .catch(() => FALLBACK)
      .then((release) => {
        if (!alive) return;
        setState({ loading: false, release });
        try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), release })); } catch { /* private mode */ }
      });
    return () => { alive = false; };
  }, []);
  return state;
}

function QR({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 132, color: { dark: "#09090b", light: "#fafafa" } })
      .then((d) => { if (alive) setSrc(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, [url]);
  return src ? <img className="get-qr" src={src} width={132} height={132} alt="QR code: scan with your phone to download the Android app" /> : null;
}

export function GetOpenNote() {
  const platform = detectPlatform();
  const { loading, release } = useLatestRelease();

  const native = (kind: "windows" | "android") => {
    const file = kind === "windows" ? release?.exe : release?.apk;
    const recommended = platform === kind;
    return (
      <article className={`get-card${recommended ? " is-rec" : ""}`}>
        {recommended && <span className="get-badge">For this device</span>}
        <span className="get-icon">{kind === "windows" ? <Monitor size={22} strokeWidth={1.5} /> : <Smartphone size={22} strokeWidth={1.5} />}</span>
        <h3>{kind === "windows" ? "Windows" : "Android"}</h3>
        <p className="dim small">{kind === "windows" ? "Laptops and pen tablets. Windows 10 and 11." : "Phones and tablets, with stylus support."}</p>
        {file ? (
          <>
            <a className="btn get-btn" href={file.url} aria-label={`Download for ${kind === "windows" ? "Windows" : "Android"}`}>
              Download {kind === "windows" ? ".exe" : ".apk"}
            </a>
            <span className="dim small mono">{file.mb > 0 ? `${release!.tag} · ${file.mb} MB` : "Latest release"}</span>
            {kind === "android" && platform !== "android" && <QR url={file.url} />}
          </>
        ) : (
          <>
            <span className="btn get-btn is-off" aria-disabled="true">{loading ? "Checking..." : "First release coming soon"}</span>
            {!loading && <a className="small" href={RELEASES_PAGE} target="_blank" rel="noreferrer">Watch releases on GitHub</a>}
          </>
        )}
      </article>
    );
  };

  return (
    <section id="lp-download" className="lp-section get" aria-label="Get OpenNote">
      <div className="lp-section-head">
        <span className="lp-sec-kicker">Get OpenNote</span>
        <div className="lp-sec-title-row">
          <h2>Use it in the browser now, or install it.</h2>
          <p>Free on every device. Your notes stay on the device you write on.</p>
        </div>
      </div>
      <div className="get-grid">
        <article className={`get-card get-web${platform === "other" ? " is-rec" : ""}`}>
          {platform === "other" && <span className="get-badge">For this device</span>}
          <span className="get-icon"><Globe size={22} strokeWidth={1.5} /></span>
          <h3>Web</h3>
          <p className="dim small">Nothing to install. Works offline once opened, in Chrome or Edge.</p>
          <button type="button" className="btn primary get-btn" onClick={() => navigate("/")}>Continue on the web</button>
          <span className="dim small">Tip: install it from the address bar for an app window.</span>
        </article>
        {native("windows")}
        {native("android")}
      </div>
    </section>
  );
}
