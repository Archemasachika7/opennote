import { useEffect, useState } from "react";
import { ArrowDownToLine, Copy, FileOutput, Replace } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import { recognizeMath, recognizeText, type RecognizeRequest } from "../ai/inkOcr";
import { TEXT_MODEL_MB } from "../ai/inkOcrModels";
import { formatLatexMath } from "../text/mathFormat";
import { addTextBox, updateObject } from "../ink/objects";
import { replaceStrokes } from "../store/strokes";
import { historyFor } from "../ink/history";
import { notifyPageChanged } from "../ink/pageEvents";
import { askPlace } from "./PlacePicker";
import { blotReact } from "../ui/blotBus";

const I = { size: 14, strokeWidth: 1.5 } as const;

/** A TipTap document with one paragraph per line. */
export const docOf = (text: string) => ({
  type: "doc",
  content: text.split("\n").map((line) => ({ type: "paragraph", ...(line ? { content: [{ type: "text", text: line }] } : {}) })),
});

/**
 * Shows what the lasso-selected ink says (handwriting → text, or a formula → LaTeX), lets the person
 * fix it, then copy it or put it on a new text page right after this one.
 */
/**
 * Put text on an ink page as a text box (selectable with the lasso, movable, copyable). With `replace`,
 * the handwriting it came from is removed in the same undo step.
 */
export async function placeText(pageId: string, text: string, at: { x: number; y: number; w: number }, replace?: RecognizeRequest["strokes"]) {
  const lines = text.split(/\r?\n/);
  const longest = Math.max(...lines.map((l) => l.length));
  const o = await addTextBox(pageId, { x: at.x, y: at.y });
  // sized to the words (28 px text), so the lasso and the selection box hug what you see
  const w = Math.min(1300, Math.max(120, longest * 15.5 + 32));
  const h = Math.max(56, lines.length * 30 + 26);
  await updateObject(o.id, { text, w, h });
  const placed = { ...o, text, w, h };
  if (replace?.length) await replaceStrokes(pageId, replace.map((s) => s.id), []);
  historyFor(pageId).push({ remove: replace ?? [], add: [], objects: { before: [], after: [placed] } });
  notifyPageChanged(pageId);
  return placed;
}

export function RecognizeSheet({ request, onClose }: { request: RecognizeRequest | null; onClose: () => void }) {
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const math = request?.kind === "math";

  useEffect(() => {
    if (!request) return;
    let alive = true;
    setResult(null); setError(null);
    setStatus(math ? "Getting the maths reader ready (built in, works offline)..." : `Getting the handwriting reader ready (${TEXT_MODEL_MB} MB the first time)...`);
    const job = math ? recognizeMath(request.strokes, (s) => alive && setStatus(s)) : recognizeText(request.strokes, (s) => alive && setStatus(s));
    job.then((r) => {
      if (!alive) return;
      setResult(r);
      if (r) blotReact("cheer");
    }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!result) return;
    try { await navigator.clipboard.writeText(result); toast(math ? "LaTeX copied" : "Text copied"); } catch { toast("Couldn't copy. Select the text and copy it by hand."); }
  };
  const box = request?.box ?? { x: 72, y: 72, w: 400, h: 60 };
  const finalText = () => (math ? formatLatexMath(result ?? "") : result ?? "");
  const put = async (where: "replace" | "below" | "other") => {
    if (!request || !result) return;
    let pageId = request.pageId;
    if (where === "other") {
      const to = await askPlace({ title: "Put the text on…", fromPageId: request.pageId, allowCurrent: false });
      if (!to) return;
      pageId = to;
    }
    const at = where === "below" ? { x: box.x, y: box.y + box.h + 16, w: box.w } : { x: box.x, y: box.y, w: box.w };
    await placeText(pageId, finalText(), at, where === "replace" ? request.strokes : undefined);
    onClose();
    toast(where === "replace" ? "Replaced the ink with text. Undo brings the ink back." : "Text added. Select it with the lasso to move or copy it.");
    if (pageId !== request.pageId) setTimeout(() => document.getElementById(`page-${pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  return (
    <Sheet open={!!request} onClose={onClose} title={math ? "Handwritten maths to LaTeX" : "Handwriting to text"} width={540}>
      {result === null && !error && (
        <div className="recog-status" role="status">
          <span className="recog-spinner" aria-hidden />
          <span>{status}</span>
        </div>
      )}
      {error && <p className="small" role="alert">{error}</p>}
      {result !== null && (
        <>
          {result === "" ? (
            <p className="dim">No writing found in the selection.</p>
          ) : (
            <>
              <label className="small dim" htmlFor="recog-out">{math ? "LaTeX (edit if needed)" : "Text (edit if needed)"}</label>
              <textarea id="recog-out" className="input recog-out mono" rows={math ? 3 : Math.min(10, result.split("\n").length + 1)}
                value={result} onChange={(e) => setResult(e.target.value)} />
              {math && <p className="recog-preview" aria-label="Formula preview">{formatLatexMath(result)}</p>}
              <p className="small dim" style={{ margin: "6px 0 0" }}>Read on this device. Your ink never left it.</p>
            </>
          )}
          <div className="recog-actions">
            <button className="btn primary" onClick={() => void put("replace")} disabled={!result}><Replace {...I} />Replace the ink</button>
            <button className="btn" onClick={() => void put("below")} disabled={!result}><ArrowDownToLine {...I} />Put below the ink</button>
            <button className="btn" onClick={() => void put("other")} disabled={!result}><FileOutput {...I} />Another page…</button>
            <button className="btn ghost" onClick={() => void copy()} disabled={!result}><Copy {...I} />{math ? "Copy LaTeX" : "Copy"}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
