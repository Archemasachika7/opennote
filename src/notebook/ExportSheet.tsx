import { useState } from "react";
import { Sheet } from "../ui/Sheet";
import { parsePageRange } from "../io/pageRange";

export type ExportRequest = { format: "pdf" | "jpg"; indices: number[] };

/** Choose PDF or JPG and which pages: all, the current one, or a range like "2-5, 8". */
export function ExportSheet({ open, onClose, total, current, onExport }: {
  open: boolean; onClose: () => void; total: number; current: number; onExport: (r: ExportRequest) => void;
}) {
  const [format, setFormat] = useState<"pdf" | "jpg">("pdf");
  const [which, setWhich] = useState<"all" | "current" | "range">("all");
  const [range, setRange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    try {
      const indices = which === "all" ? [...Array(total).keys()] : which === "current" ? [current] : parsePageRange(range, total);
      setError(null);
      onExport({ format, indices });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Export" width={460}>
      <fieldset className="opt-group">
        <legend>Format</legend>
        <label><input type="radio" name="fmt" checked={format === "pdf"} onChange={() => setFormat("pdf")} />PDF document</label>
        <label><input type="radio" name="fmt" checked={format === "jpg"} onChange={() => setFormat("jpg")} />JPG images</label>
      </fieldset>
      <fieldset className="opt-group">
        <legend>Pages</legend>
        <label><input type="radio" name="which" checked={which === "all"} onChange={() => setWhich("all")} />All ({total})</label>
        <label><input type="radio" name="which" checked={which === "current"} onChange={() => setWhich("current")} />Current page ({current + 1})</label>
        <label className="range-row">
          <input type="radio" name="which" aria-label="Pages" checked={which === "range"} onChange={() => setWhich("range")} />
          <input className="input" aria-label="Page range" placeholder="e.g. 2-5, 8" value={range}
            onFocus={() => setWhich("range")} onChange={(e) => setRange(e.target.value)} />
        </label>
      </fieldset>
      {error && <p className="paste-err" role="alert">{error}</p>}
      <div className="row-end">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={go}>Export</button>
      </div>
    </Sheet>
  );
}
