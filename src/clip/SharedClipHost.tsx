"use client";
import { useEffect, useState } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { BookOpen, Plus } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import { useLive } from "../store/useLive";
import { createNotebook, getNotebook, listNotebooks } from "../store/notebooks";
import { insertPage, updatePage } from "../store/pages";
import type { Notebook } from "../store/schema";
import { navigate } from "../App";
import { clipUrl } from "./clip";
import { findUrl } from "./extract";
import "./clip.css";

/** Something shared into OpenNote from another app: a link, or plain text. */
export interface Shared { url: string | null; text: string; title: string }

interface ShareIntentPlugin {
  /** what the app was opened with (Android "Share → OpenNote"); empty when nothing was shared */
  getPending(): Promise<{ text?: string; subject?: string }>;
  addListener(event: "shared", f: (d: { text?: string; subject?: string }) => void): Promise<PluginListenerHandle>;
}
const ShareIntent = registerPlugin<ShareIntentPlugin>("ShareIntent");

export function toShared(text: string | undefined | null, title?: string | null, url?: string | null): Shared | null {
  const t = (text ?? "").trim();
  const link = (url && findUrl(url)) || findUrl(t);
  if (!link && !t) return null;
  return { url: link, text: t, title: (title ?? "").trim() };
}

/** The installed web app's share target (manifest share_target, GET): /?title=…&text=…&url=… */
export function readShareParams(loc: Pick<Location, "search">): Shared | null {
  const q = new URLSearchParams(loc.search);
  if (!q.has("text") && !q.has("url") && !q.has("title")) return null;
  return toShared(q.get("text"), q.get("title"), q.get("url"));
}

const CLIPS_TITLE = "Web clips";

/** Asks where a shared link (or text) should go, then clips it there and opens it. */
export function SharedClipHost() {
  const [shared, setShared] = useState<Shared | null>(null);
  const [target, setTarget] = useState<string>("new");
  const [busy, setBusy] = useState(false);
  const notebooks = useLive(async () => (await listNotebooks()).filter((n) => (n.kind ?? "notebook") === "notebook" && !n.trashedAt && !n.locked),
    [], [] as Notebook[]);

  useEffect(() => {
    const fromUrl = readShareParams(window.location);
    if (fromUrl) {
      setShared(fromUrl);
      // drop the share parameters so a reload doesn't clip it again
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    if (!Capacitor.isNativePlatform()) return;
    let handle: PluginListenerHandle | undefined;
    void ShareIntent.getPending().then((d) => { const s = toShared(d.text, d.subject); if (s) setShared(s); }).catch(() => undefined);
    void ShareIntent.addListener("shared", (d) => { const s = toShared(d.text, d.subject); if (s) setShared(s); })
      .then((h) => { handle = h; }).catch(() => undefined);
    return () => { void handle?.remove(); };
  }, []);

  // default to the notebook used for clips last, if it still exists
  useEffect(() => {
    if (!shared) return;
    const clips = notebooks.find((n) => n.title === CLIPS_TITLE);
    setTarget(clips ? clips.id : "new");
  }, [shared]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!shared || busy) return;
    setBusy(true);
    try {
      const nb = target === "new" ? await createNotebook({ title: CLIPS_TITLE }) : await getNotebook(target);
      if (!nb) { toast("That notebook is gone. Pick another."); return; }
      const end = nb.pageIds.length;
      let pageId: string;
      if (shared.url) {
        const r = await clipUrl(nb.id, end, shared.url);
        pageId = r.page.id;
        toast(r.article ? `Clipped "${r.article.title}"` : "Saved the link. The page itself could not be read here.");
      } else {
        const p = await insertPage(nb.id, end, { kind: "text" });
        await updatePage(p.id, { doc: { type: "doc", content: [
          ...(shared.title ? [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: shared.title }] }] : []),
          ...shared.text.split(/\n{2,}/).filter(Boolean).map((para) => ({ type: "paragraph", content: [{ type: "text", text: para }] })),
        ] } });
        pageId = p.id;
        toast("Saved the shared text");
      }
      setShared(null);
      navigate(`/nb/${nb.id}?p=${pageId}`);
    } catch (e) {
      toast(`Couldn't save it: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!shared} onClose={() => setShared(null)} title={shared?.url ? "Clip the shared page" : "Save the shared text"} width={520}>
      {shared && (
        <div className="clip-sheet">
          <div className="clip-shared mono small">{shared.url ?? shared.text.slice(0, 280)}</div>
          <span className="dim small">Put it in</span>
          <div className="clip-targets" role="radiogroup" aria-label="Notebook">
            {!notebooks.some((n) => n.title === CLIPS_TITLE) && (
              <button type="button" role="radio" aria-checked={target === "new"} className="clip-target" onClick={() => setTarget("new")}>
                <Plus size={16} strokeWidth={1.5} />New notebook &ldquo;{CLIPS_TITLE}&rdquo;
              </button>
            )}
            {notebooks.map((n) => (
              <button key={n.id} type="button" role="radio" aria-checked={target === n.id} className="clip-target" onClick={() => setTarget(n.id)}>
                <BookOpen size={16} strokeWidth={1.5} />{n.title}
              </button>
            ))}
          </div>
          <div className="row-end">
            <button type="button" className="btn ghost" onClick={() => setShared(null)}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving..." : shared.url ? "Clip page" : "Save text"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
