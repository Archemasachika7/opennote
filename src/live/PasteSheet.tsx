import { useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";
import { MAX_HTML_BYTES, type ArtifactType } from "../store/schema";
import { TOO_LARGE } from "../store/pages";
import { Sheet } from "../ui/Sheet";
import { bareImports, detectArtifactType, titleOf } from "./detect";
import { buildSrcdoc } from "./srcdoc";
import { loadVendor } from "./vendor";
import "./live.css";

export type LiveDraft = { title: string; source: string; artifactType: ArtifactType; allowNetwork: boolean };

export function PasteSheet({ open, onClose, onSave, initial }: {
  open: boolean; onClose: () => void; onSave: (d: LiveDraft) => void; initial?: Partial<LiveDraft>;
}) {
  const [source, setSource] = useState(initial?.source ?? "");
  const [typeSel, setTypeSel] = useState<ArtifactType | "auto">(initial?.artifactType ?? "auto");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(!!initial?.title);
  const [net, setNet] = useState(initial?.allowNetwork ?? false);
  const [netTouched, setNetTouched] = useState(initial?.allowNetwork !== undefined);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSource(initial?.source ?? "");
    setTypeSel(initial?.artifactType ?? "auto");
    setTitle(initial?.title ?? "");
    setTitleTouched(!!initial?.title);
    setNet(initial?.allowNetwork ?? false);
    setNetTouched(initial?.allowNetwork !== undefined);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tooLarge = source.length > MAX_HTML_BYTES;
  const type: ArtifactType = typeSel === "auto" ? detectArtifactType(source) ?? "html" : typeSel;
  const needs = useMemo(() => (tooLarge || type !== "react" ? [] : bareImports(source)), [source, type, tooLarge]);
  const allowNetwork = netTouched ? net : net || needs.length > 0;
  const shownTitle = titleTouched ? title : tooLarge ? "Live page" : titleOf(source, type);

  useEffect(() => {
    if (!open || tooLarge || !source.trim()) { setPreview(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const vendor = type === "react" ? await loadVendor() : undefined;
        if (alive) setPreview(buildSrcdoc({ source, type, allowNetwork, vendor }));
      } catch { if (alive) setPreview(null); }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [open, source, type, allowNetwork, tooLarge]);

  const canSave = source.trim().length > 0 && !tooLarge;
  return (
    <Sheet open={open} onClose={onClose} title={initial?.source ? "Edit live page" : "New live page"} width={1100}>
      <div className="paste-grid">
        <div className="paste-left">
          <div className="paste-row">
            <input className="input" aria-label="Title" value={shownTitle} placeholder="Live page"
              onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
            <select className="input" aria-label="Type" value={typeSel} onChange={(e) => setTypeSel(e.target.value as ArtifactType | "auto")}>
              <option value="auto">Auto ({type.toUpperCase()})</option>
              <option value="html">HTML</option>
              <option value="svg">SVG</option>
              <option value="react">React</option>
            </select>
          </div>
          <textarea className="paste-code mono" aria-label="Artifact code" autoFocus spellCheck={false} value={source}
            placeholder="Paste the artifact code from Claude, ChatGPT or any AI here" onChange={(e) => setSource(e.target.value)} />
          <label className="paste-net">
            <input type="checkbox" checked={allowNetwork} aria-label="Allow internet"
              onChange={(e) => { setNet(e.target.checked); setNetTouched(true); }} />
            <Globe size={14} strokeWidth={1.5} /> Allow internet for this page
          </label>
          {needs.length > 0 && <p className="dim paste-note">Needs internet for: {needs.join(", ")}</p>}
          {tooLarge && <p className="paste-err">{TOO_LARGE}</p>}
        </div>
        <div className="paste-preview">
          {preview
            ? <iframe title="Preview" sandbox="allow-scripts" srcDoc={preview} />
            : <p className="dim">Preview appears here.</p>}
        </div>
      </div>
      <div className="row-end">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!canSave}
          onClick={() => onSave({ title: shownTitle.trim() || "Live page", source, artifactType: type, allowNetwork })}>Save</button>
      </div>
    </Sheet>
  );
}
