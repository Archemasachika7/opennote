import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Code2, Eye, FileUp, Globe } from "lucide-react";
import { MAX_HTML_BYTES, type ArtifactType } from "../store/schema";
import { TOO_LARGE } from "../store/pages";
import { Sheet } from "../ui/Sheet";
import { platform } from "../platform/port";
import { toast } from "../ui/Toast";
import { bareImports, detectArtifactType, titleOf } from "./detect";
import { buildSrcdoc } from "./srcdoc";
import { loadVendor } from "./vendor";
import "./live.css";

export type LiveDraft = { title: string; source: string; artifactType: ArtifactType; allowNetwork: boolean };

const I = { size: 14, strokeWidth: 1.5 } as const;

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
  const [mobilePane, setMobilePane] = useState<"code" | "preview">("code");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [tabMovesFocus, setTabMovesFocus] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSource(initial?.source ?? "");
    setTypeSel(initial?.artifactType ?? "auto");
    setTitle(initial?.title ?? "");
    setTitleTouched(!!initial?.title);
    setNet(initial?.allowNetwork ?? false);
    setNetTouched(initial?.allowNetwork !== undefined);
    setMobilePane("code");
    setConfirmDiscard(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tooLarge = source.length > MAX_HTML_BYTES;
  const type: ArtifactType = typeSel === "auto" ? detectArtifactType(source) ?? "html" : typeSel;
  const needs = useMemo(() => (tooLarge || type !== "react" ? [] : bareImports(source)), [source, type, tooLarge]);
  const allowNetwork = netTouched ? net : net || needs.length > 0;
  const shownTitle = titleTouched ? title : tooLarge ? "Live page" : titleOf(source, type);
  const dirty = source !== (initial?.source ?? "") && source.trim().length > 0;

  useEffect(() => {
    if (!open || tooLarge || !source.trim()) { setPreview(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const vendor = type === "react" ? await loadVendor() : undefined;
        if (alive) setPreview(buildSrcdoc({ source, type, allowNetwork, vendor }));
      } catch { if (alive) setPreview(null); }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [open, source, type, allowNetwork, tooLarge]);

  const canSave = source.trim().length > 0 && !tooLarge;
  const submit = () => {
    if (!canSave) return;
    setConfirmDiscard(false);
    onSave({ title: shownTitle.trim() || "Live page", source, artifactType: type, allowNetwork });
  };

  const pasteClipboardText = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) { setSource(txt); setConfirmDiscard(false); }
      else toast("Clipboard is empty");
    } catch {
      toast("Press Ctrl+V inside the code box to paste");
    }
  };

  const importCodeFile = async () => {
    const f = await platform.openFile([".html", ".htm", ".svg", ".jsx", ".tsx", ".js"]);
    if (!f) return;
    const txt = await f.text();
    setSource(txt);
    setConfirmDiscard(false);
    if (!titleTouched) {
      const base = f.name.replace(/\.[^.]+$/, "").trim();
      if (base) { setTitle(base); setTitleTouched(true); }
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => { setConfirmDiscard(false); onClose(); }}
      beforeClose={() => {
        if (!dirty || confirmDiscard) return true;
        setConfirmDiscard(true);
        return false;
      }}
      title={initial?.source ? "Edit live page" : "New live page"}
      width={1100}>
      {confirmDiscard && (
        <div className="paste-discard" role="alert">
          <span>Discard unsaved artifact code?</span>
          <div className="paste-discard-btns">
            <button type="button" className="btn" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
            <button type="button" className="btn danger" onClick={() => { setConfirmDiscard(false); onClose(); }}>Discard</button>
          </div>
        </div>
      )}
      <div className="paste-mobile-tabs" role="tablist" aria-label="Editor view">
        <button type="button" role="tab" aria-selected={mobilePane === "code"} className={mobilePane === "code" ? "on" : ""}
          onClick={() => setMobilePane("code")}><Code2 {...I} />Code</button>
        <button type="button" role="tab" aria-selected={mobilePane === "preview"} className={mobilePane === "preview" ? "on" : ""}
          onClick={() => setMobilePane("preview")}><Eye {...I} />Preview</button>
      </div>
      <div className={`paste-grid pane-${mobilePane}`}>
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
          <div className="paste-actions-bar">
            <button type="button" className="btn ghost" onClick={pasteClipboardText}><ClipboardPaste {...I} />Paste clipboard</button>
            <button type="button" className="btn ghost" onClick={importCodeFile}><FileUp {...I} />Open file</button>
            <span className="dim small paste-tab-hint">Tab indents · Ctrl+M toggles Tab focus</span>
          </div>
          <textarea
            className="paste-code mono"
            aria-label="Artifact code"
            autoFocus
            spellCheck={false}
            value={source}
            placeholder="Paste the artifact code from Claude, ChatGPT or any AI here"
            onChange={(e) => { setSource(e.target.value); if (confirmDiscard) setConfirmDiscard(false); }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
                e.preventDefault();
                setTabMovesFocus((v) => !v);
                return;
              }
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
                return;
              }
              if (e.key === "Tab" && !tabMovesFocus && !e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const ta = e.currentTarget;
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const next = source.slice(0, start) + "  " + source.slice(end);
                setSource(next);
                requestAnimationFrame(() => {
                  ta.selectionStart = ta.selectionEnd = start + 2;
                });
              }
            }}
          />
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
        <span className="dim small" style={{ marginRight: "auto", alignSelf: "center" }}>Ctrl+Enter to save</span>
        <button className="btn" onClick={() => { setConfirmDiscard(false); onClose(); }}>Cancel</button>
        <button className="btn primary" disabled={!canSave} onClick={submit}>Save</button>
      </div>
    </Sheet>
  );
}
