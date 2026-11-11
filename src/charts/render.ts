import type { Paper } from "../store/schema";
import { toChartConfig, type ChartSpec } from "./spec";

type ChartCtor = typeof import("chart.js").Chart;
let loading: Promise<ChartCtor> | null = null;

/** Chart.js is loaded the first time a chart is made, with only the chart types OpenNote offers (~65 KB gzip). */
export function loadChartJs(): Promise<ChartCtor> {
  loading ??= import("chart.js").then((m) => {
    m.Chart.register(
      m.BarController, m.LineController, m.PieController, m.DoughnutController, m.ScatterController,
      m.BarElement, m.LineElement, m.PointElement, m.ArcElement,
      m.CategoryScale, m.LinearScale, m.Legend, m.Title,
    );
    return m.Chart;
  });
  return loading;
}

/** Picture size in canvas pixels: wide for axes, squarer for pies. Placed on the page at half this size, so it stays sharp when zoomed. */
export function chartPixelSize(spec: Pick<ChartSpec, "type">): { w: number; h: number } {
  return spec.type === "pie" || spec.type === "doughnut" ? { w: 1300, h: 1000 } : { w: 1600, h: 1000 };
}

/** Draws the chart into `canvas` (already sized). Returns a function that frees it. */
export async function drawChart(canvas: HTMLCanvasElement, spec: ChartSpec, paper: Paper, fontPx = 28): Promise<() => void> {
  const Chart = await loadChartJs();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chart = new Chart(canvas, toChartConfig(spec, paper, fontPx) as any);
  return () => chart.destroy();
}

/** The chart as a PNG with a transparent background, so it sits on the page's paper like ink. */
export async function renderChartPng(spec: ChartSpec, paper: Paper): Promise<{ blob: Blob; w: number; h: number }> {
  const { w, h } = chartPixelSize(spec);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  // the picture is drawn at 2x its size on the page; 2 x 26 page units ≈ the size of text-box writing (28 units)
  const free = await drawChart(canvas, spec, paper, 52);
  try {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("This browser could not draw the chart.");
    return { blob, w, h };
  } finally {
    free();
  }
}
