import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { insertPage, updatePage } from "../store/pages";
import type { Page } from "../store/schema";
import { extractArticle, toTextDoc, type Article } from "./extract";

const MAX_HTML = 6 * 1024 * 1024;

export class ClipBlockedError extends Error {}

/**
 * Downloads the page's HTML. In the Android app this uses native HTTP, which any site answers; a browser (web, and the
 * Windows app's web view) may only read sites that allow it (CORS), so many sites refuse there.
 */
export async function fetchPageHtml(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: "text", connectTimeout: 15000, readTimeout: 20000,
      headers: { Accept: "text/html,application/xhtml+xml" } });
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
