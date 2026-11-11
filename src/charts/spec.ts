import type { Paper } from "../store/schema";
import { inkPalette } from "../ink/render";

/** A chart kept on an ink page: the picture is a normal image object; this is the data it was drawn from, so it stays editable. */
export type ChartType = "bar" | "line" | "pie" | "doughnut" | "scatter";
export interface ChartSeries { name: string; values: number[] }
export interface ChartSpec {
  type: ChartType;
  title?: string;
  /** x categories (bar / line / pie) — for scatter, the x values as text */
  labels: string[];
  series: ChartSeries[];
}

export const CHART_TYPES: { type: ChartType; label: string }[] = [
  { type: "bar", label: "Bar" },
  { type: "line", label: "Line" },
  { type: "pie", label: "Pie" },
  { type: "doughnut", label: "Doughnut" },
  { type: "scatter", label: "Scatter" },
];

export const SAMPLE_TABLE = "Month, Sales, Costs\nJan, 12, 7\nFeb, 19, 9\nMar, 15, 11\nApr, 24, 12";

/** Numbers like "1,200" / "12%" / "−3" / "3.5e2" (blank or junk → NaN, which Chart.js leaves as a gap). */
export function parseNumber(raw: string): number {
  const t = raw.trim().replace(/[−–]/g, "-").replace(/[%\s]/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1");
  if (t === "") return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Reads a pasted table (comma, tab or semicolon separated; first row = headers, first column = labels).
 * "Month, Sales, Costs / Jan, 12, 7" → labels [Jan], series Sales [12], Costs [7].
 * A single column of numbers with no labels works too.
 */
export function parseTable(text: string): { labels: string[]; series: ChartSeries[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { labels: [], series: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim()));
  const width = Math.max(...rows.map((r) => r.length));
  // one column: plain list of numbers
  if (width === 1) {
    const vals = rows.map((r) => parseNumber(r[0]));
    const hasHeader = Number.isNaN(vals[0]) && rows.length > 1;
    const body = hasHeader ? vals.slice(1) : vals;
    return { labels: body.map((_, i) => String(i + 1)), series: [{ name: hasHeader ? rows[0][0] : "Values", values: body }] };
  }
  // header row when its value cells are not numbers
  const hasHeader = rows.length > 1 && rows[0].slice(1).every((c) => Number.isNaN(parseNumber(c)));
  const head = hasHeader ? rows[0] : ["", ...Array.from({ length: width - 1 }, (_, i) => `Series ${i + 1}`)];
  const body = hasHeader ? rows.slice(1) : rows;
  const labels = body.map((r) => r[0] ?? "");
  const series: ChartSeries[] = [];
  for (let c = 1; c < width; c++) {
    series.push({ name: head[c] || `Series ${c}`, values: body.map((r) => parseNumber(r[c] ?? "")) });
  }
  return { labels, series };
}

/** Back to editable text (for "Edit chart"). */
export function toTable(spec: Pick<ChartSpec, "labels" | "series">): string {
  const head = ["Label", ...spec.series.map((s) => s.name)].join(", ");
  const rows = spec.labels.map((l, i) => [l, ...spec.series.map((s) => (Number.isFinite(s.values[i]) ? String(s.values[i]) : ""))].join(", "));
  return [head, ...rows].join("\n");
}

export function hasData(spec: Pick<ChartSpec, "series">): boolean {
  return spec.series.some((s) => s.values.some((v) => Number.isFinite(v)));
}

/** Flat series colours from the ink palette (index 0 is the plain ink colour, so it comes last). */
export function chartColors(paper: Paper): string[] {
  const p = inkPalette(paper);
  return [p[1], p[3], p[4], p[5], p[6], p[2], p[7], p[0]];
}

const INK_TEXT: Record<Paper, { text: string; grid: string; edge: string }> = {
  dark: { text: "#E8E9EE", grid: "rgba(232,233,238,0.14)", edge: "#17181d" },
  light: { text: "#16171C", grid: "rgba(22,23,28,0.12)", edge: "#fbfaf6" },
};

/** Chart.js config for a spec: no animation (it is drawn once into a picture), flat fills, colours that read on the paper. */
export function toChartConfig(spec: ChartSpec, paper: Paper, fontPx = 28) {
  const colors = chartColors(paper);
  const ink = INK_TEXT[paper];
  const round = spec.type === "pie" || spec.type === "doughnut";
  const datasets = round
    // pie / doughnut: one ring per series, one colour per slice
    ? spec.series.map((s) => ({
      label: s.name, data: s.values,
      backgroundColor: spec.labels.map((_, i) => colors[i % colors.length]),
      borderColor: ink.edge, borderWidth: 3,
    }))
    : spec.type === "scatter"
      ? spec.series.map((s, k) => ({
        label: s.name,
        data: spec.labels.map((l, i) => ({ x: parseNumber(l), y: s.values[i] })),
        backgroundColor: colors[k % colors.length], borderColor: colors[k % colors.length], pointRadius: 8,
      }))
      : spec.series.map((s, k) => ({
        label: s.name, data: s.values,
        backgroundColor: colors[k % colors.length], borderColor: colors[k % colors.length],
        borderWidth: spec.type === "line" ? 5 : 0, pointRadius: spec.type === "line" ? 6 : 0, tension: 0.25, spanGaps: false,
      }));
  const axis = { ticks: { color: ink.text, font: { size: fontPx * 0.8 } }, grid: { color: ink.grid }, border: { color: ink.grid } };
  return {
    type: spec.type,
    data: { labels: spec.type === "scatter" ? undefined : spec.labels, datasets },
    options: {
      animation: false as const, responsive: false, maintainAspectRatio: false, devicePixelRatio: 1,
      color: ink.text,
      font: { size: fontPx, family: "Inter, system-ui, sans-serif" },
      plugins: {
        legend: { display: round || spec.series.length > 1, labels: { color: ink.text, font: { size: fontPx * 0.85 }, boxWidth: fontPx, padding: fontPx * 0.8 } },
        title: { display: !!spec.title, text: spec.title ?? "", color: ink.text, font: { size: fontPx * 1.15, weight: 600 }, padding: { bottom: fontPx * 0.8 } },
        tooltip: { enabled: false },
      },
      layout: { padding: fontPx },
      ...(round ? {} : { scales: { x: { ...axis, ...(spec.type === "scatter" ? { type: "linear" as const } : {}) }, y: { ...axis, beginAtZero: spec.type === "bar" } } }),
    },
  };
}
