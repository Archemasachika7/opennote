import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Code2, Globe, Play, RotateCw, Square } from "lucide-react";
import { PAGE_SIZE, type HtmlPage } from "../store/schema";
import { updatePage } from "../store/pages";
import { buildSrcdoc } from "./srcdoc";
import { loadVendor } from "./vendor";
import { liveFrames } from "./registry";
import "./live.css";

export const LIVE_BAR = 36;
const MIN_H = 200;
const MAX_H = 20000;
const I = { size: 14, strokeWidth: 1.5 } as const;
export const clampHeight = (h: number): number => Math.min(MAX_H, Math.max(MIN_H, h));

export function LivePage({ page, mounted, width, priority, onEdit }: {
  page: HtmlPage; mounted: boolean; width: number; priority: number; onEdit: () => void;
}) {
  const scale = width / PAGE_SIZE.w;
  const [stopped, setStopped] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [doc, setDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const active = useSyncExternalStore(liveFrames.subscribe, () => liveFrames.active().includes(page.id));

  useEffect(() => {
    if (mounted && !stopped) liveFrames.request(page.id, priority);
    else liveFrames.release(page.id);
  }, [mounted, stopped, priority, page.id]);
  useEffect(() => () => liveFrames.release(page.id), [page.id]);

  useEffect(() => {
    if (!active) { setDoc(null); return; }
    let alive = true;
    void (async () => {
      try {
        const vendor = page.artifactType === "react" ? await loadVendor() : undefined;
        if (alive) { setDoc(buildSrcdoc({ source: page.source, type: page.artifactType, allowNetwork: page.allowNetwork, vendor })); setError(null); }
      } catch (e) { if (alive) setError(String(e)); }
    })();
    return () => { alive = false; };
  }, [active, page.source, page.artifactType, page.allowNetwork]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { type?: string; h?: unknown };
      if (d?.type !== "opennote:height" || typeof d.h !== "number" || !Number.isFinite(d.h)) return;
      const logical = clampHeight(Math.ceil(d.h / scale + LIVE_BAR / scale));
      if (Math.abs(logical - page.height) > 4) void updatePage(page.id, { height: logical });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [scale, page.id, page.height]);

  const run = () => { setStopped(false); liveFrames.request(page.id, Number.MAX_SAFE_INTEGER); };
  return (
    <div className="live-page">
      <div className="live-bar">
        <span className="live-tag mono">LIVE</span>
        <span className="live-title">{page.title}</span>
        <span className="live-type mono">{page.artifactType}</span>
        <button className={`btn ghost icon ${page.allowNetwork ? "active" : ""}`} aria-label={page.allowNetwork ? "Disable internet" : "Allow internet"}
          aria-pressed={page.allowNetwork} onClick={() => updatePage(page.id, { allowNetwork: !page.allowNetwork })}><Globe {...I} /></button>
        {active
          ? <button className="btn ghost icon" aria-label="Stop" onClick={() => setStopped(true)}><Square {...I} /></button>
          : <button className="btn ghost icon" aria-label="Run" onClick={run}><Play {...I} /></button>}
        <button className="btn ghost icon" aria-label="Reload" onClick={() => { setReloadKey((k) => k + 1); if (!active) run(); }}><RotateCw {...I} /></button>
        <button className="btn ghost icon" aria-label="Edit source" onClick={onEdit}><Code2 {...I} /></button>
      </div>
      {active && doc ? (
        <iframe key={reloadKey} ref={frame} title={page.title} sandbox="allow-scripts" srcDoc={doc} />
      ) : (
        <div className="live-idle">
          {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : <span>{active ? "Starting..." : stopped ? "Stopped" : "Paused to save memory"}</span>}
          {!active && <button className="btn" onClick={run}><Play {...I} />Run</button>}
        </div>
      )}
    </div>
  );
}
