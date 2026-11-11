import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { insertPage, updatePage } from "../store/pages";
import type { Page } from "../store/schema";
import { extractArticle, toTextDoc, type Article } from "./extract";

const MAX_HTML = 6 * 1024 * 1024;

export class ClipBlockedError extends Error {}

const PRIVATE_NAMES = /(^|\.)(localhost|local|internal|intranet|home\.arpa|lan)$/i;

function privateV4(a: number, b: number): boolean {
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * True for hosts on the device's own network: loopback, private and link-local ranges (including the cloud
 * metadata address 169.254.169.254), and local-only names. Expects `URL.hostname`, which has already turned
 * odd IPv4 spellings (2130706433, 0x7f.1) into dotted form. Names that only resolve to a private address via
 * DNS can't be seen from here; the redirect check below still catches the common case.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || PRIVATE_NAMES.test(h)) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return privateV4(+v4[1], +v4[2]);
  if (h.includes(":")) {
    if (h === "::" || h === "::1") return true;
    const mapped = h.match(/^::ffff:(\d+)\.(\d+)\.\d+\.\d+$/) ?? h.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/);
    if (mapped) {
      if (mapped[0].includes(".")) return privateV4(+mapped[1], +mapped[2]);
      const hi = parseInt(mapped[1], 16);
      return privateV4(hi >> 8, hi & 0xff);
    }
    // fc00::/7 unique-local, fe80::/10 link-local
    return /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}

/** Only ordinary public web pages may be clipped: http(s) to a host outside the device's own network. */
function assertPublicWebUrl(url: string): void {
  let u: URL;
  try { u = new URL(url); } catch { throw new ClipBlockedError("That isn't a web link."); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ClipBlockedError("Only web links (http or https) can be clipped.");
  if (isPrivateHost(u.hostname)) throw new ClipBlockedError("Links to this device or your local network can't be clipped.");
}

/**
 * Downloads the page's HTML. In the Android app this uses native HTTP, which any site answers; a browser (web, and the
 * Windows app's web view) may only read sites that allow it (CORS), so many sites refuse there. Links to the local
 * network are refused before anything is fetched, and a redirect that lands there is refused too.
 */
export async function fetchPageHtml(url: string): Promise<string> {
  assertPublicWebUrl(url);
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: "text", connectTimeout: 15000, readTimeout: 20000,
      headers: { Accept: "text/html,application/xhtml+xml" } });
    if (r.url) assertPublicWebUrl(r.url);
    if (r.status >= 400) throw new ClipBlockedError(`The site answered ${r.status}.`);
    const body = typeof r.data === "string" ? r.data : "";
    if (!body) throw new ClipBlockedError("The site sent back no page.");
    return body.slice(0, MAX_HTML);
  }
  let res: Response;
  try {
    res = await fetch(url, { mode: "cors", credentials: "omit", redirect: "follow", headers: { Accept: "text/html,application/xhtml+xml" } });
  } catch {
    throw new ClipBlockedError("This site doesn't let browsers read it directly.");
  }
  if (res.url) assertPublicWebUrl(res.url);
  if (!res.ok) throw new ClipBlockedError(`The site answered ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|xml|text\/plain/i.test(type)) throw new ClipBlockedError("That link is not a web page.");
  return (await res.text()).slice(0, MAX_HTML);
}

export interface ClipResult { page: Page; article: Article | null; blocked?: string }

/**
 * Clips a link into the notebook as a new Text page at `index`. When the page can't be read, the Text page still keeps
 * the link (with a note saying why), so nothing the user shared is lost.
 */
export async function clipUrl(notebookId: string, index: number, url: string, fetchHtml = fetchPageHtml): Promise<ClipResult> {
  const now = new Date();
  let article: Article | null = null;
  let blocked: string | undefined;
  try {
    article = extractArticle(await fetchHtml(url), url);
  } catch (e) {
    blocked = e instanceof Error ? e.message : String(e);
  }
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
  const doc = article
    ? toTextDoc(article, url, now)
    : toTextDoc({ title: host, site: host, description: "", blocks: [] }, url, now,
      `Only the link was saved: ${blocked ?? "the page could not be read."} Open the link, copy the text you need and paste it here.`);
  const page = await insertPage(notebookId, index, { kind: "text" });
  await updatePage(page.id, { doc });
  return { page, article, blocked };
}
