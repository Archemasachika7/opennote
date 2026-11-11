"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "../ui/Sheet";
import type { Paper, PageObject } from "../store/schema";
import { CHART_TYPES, hasData, parseTable, SAMPLE_TABLE, toTable, type ChartSpec, type ChartType } from "./spec";
import { drawChart } from "./render";
import "./charts.css";

/** Ask the notebook to open the chart editor: a new chart, or `object` to edit one already on a page. */
export type ChartRequest = { object?: PageObject };
const listeners = new Set<(r: ChartRequest) => void>();
export function openChartEditor(r: ChartRequest = {}): void { listeners.forEach((f) => f(r)); }
export function onChartEditorRequest(f: (r: ChartRequest) => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

const PREVIEW = { w: 800, h: 500 };

export function ChartSheet({ request, paper, onClose, onSave }: {
  request: ChartRequest | null;
  paper: Paper;
  onClose: () => void;
  onSave: (spec: ChartSpec, editing?: PageObject) => Promise<void> | void;
}) {
  const editing = request?.object?.chart ? request.object : undefined;
  const [type, setType] = useState<ChartType>("bar");
  const [title, setTitle] = useState("");
  const [table, setTable] = useState(SAMPLE_TABLE);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  // fill the form each time the sheet opens
  useEffect(() => {
    if (!request) return;
    const c = request.object?.chart;
    setType(c?.type ?? "bar");
    setTitle(c?.title ?? "");
    setTable(c ? toTable(c) : SAMPLE_TABLE);
    setBusy(false);
  }, [request]);

  const spec = useMemo<ChartSpec>(() => ({ type, ...(title.trim() ? { title: title.trim() } : {}), ...parseTable(table) }), [type, title, table]);
  const ok = hasData(spec);

  // live preview, redrawn shortly after typing stops
  useEffect(() => {
    if (!request || !ok) return;
    let free: (() => void) | null = null;
    let dead = false;
    const t = window.setTimeout(() => {
      const el = canvas.current;
      if (!el) return;
      void drawChart(el, spec, paper, 15).then((f) => { if (dead) f(); else free = f; }).catch(() => undefined);
    }, 150);
    return () => { dead = true; window.clearTimeout(t); free?.(); };
  }, [request, spec, paper, ok]);

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try { await onSave(spec, editing); } finally { setBusy(false); }
  };

  return (
    <Sheet open={!!request} onClose={onClose} title={editing ? "Edit chart" : "Add a chart"} width={640}>
      <div className="chart-sheet">
        <div className="chart-types" role="radiogroup" aria-label="Chart type">
          {CHART_TYPES.map((c) => (
            <button key={c.type} type="button" role="radio" aria-checked={type === c.type}
              className={`btn ${type === c.type ? "primary" : "ghost"}`} onClick={() => setType(c.type)}>
              {c.label}
            </button>
          ))}
        </div>
        <label className="chart-field">
          <span className="dim small">Title (optional)</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sales by month" />
        </label>
        <label className="chart-field">
          <span className="dim small">
            Data: first row is the names, first column is the labels. You can paste straight from Excel or Google Sheets.
            {type === "scatter" && " For scatter, the first column is the x value."}
          </span>
          <textarea className="input mono chart-data" aria-label="Chart data" rows={7} spellCheck={false}
            value={table} onChange={(e) => setTable(e.target.value)} />
        </label>
        <div className={`chart-preview paper-${paper}`} aria-label="Chart preview">
          {ok
            ? <canvas ref={canvas} width={PREVIEW.w} height={PREVIEW.h} />
            : <p className="dim">Add at least one number to see the chart.</p>}
        </div>
        <div className="row-end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!ok || busy} onClick={() => void save()}>
            {busy ? "Drawing..." : editing ? "Update chart" : "Add to page"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
