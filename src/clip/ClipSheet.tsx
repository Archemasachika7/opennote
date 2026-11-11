"use client";
import { useEffect, useState } from "react";
import { Sheet } from "../ui/Sheet";
import { normalizeUrl } from "./extract";
import "./clip.css";

/** "Clip a web page": paste a link; the notebook turns the page's article into a Text page. */
export function ClipSheet({ open, onClose, onClip }: {
  open: boolean;
  onClose: () => void;
  onClip: (url: string) => Promise<void> | void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setRaw(""); setBusy(false); } }, [open]);
  const url = normalizeUrl(raw);

  const go = async () => {
    if (!url || busy) return;
    setBusy(true);
    try { await onClip(url); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Clip a web page" width={520}>
      <form className="clip-sheet" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <label className="clip-field">
          <span className="dim small">Link to the page</span>
          <input className="input" type="url" inputMode="url" autoFocus value={raw} placeholder="https://..."
            aria-label="Web page link" onChange={(e) => setRaw(e.target.value)} />
        </label>
        <p className="dim small">
          The article&apos;s text (headings, paragraphs, lists, quotes) becomes a Text page you can edit and write notes on,
          with the link and the date. Menus, ads and scripts are left out. The page is read on this device; the link is
          not sent to anyone else. In the Android app any site works; in a browser some sites refuse, and then only the link is kept.
        </p>
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!url || busy}>{busy ? "Clipping..." : "Clip page"}</button>
        </div>
      </form>
    </Sheet>
  );
}
