import { chartColors, hasData, parseNumber, parseTable, toChartConfig, toTable, type ChartSpec } from "../../src/charts/spec";
import { inkPalette } from "../../src/ink/render";

describe("chart data", () => {
  it("reads a table with a header row and a label column", () => {
    const t = parseTable("Month, Sales, Costs\nJan, 12, 7\nFeb, 19, 9");
    expect(t.labels).toEqual(["Jan", "Feb"]);
    expect(t.series).toEqual([{ name: "Sales", values: [12, 19] }, { name: "Costs", values: [7, 9] }]);
  });

  it("reads tab-separated text pasted from a spreadsheet", () => {
    const t = parseTable("Subject\tMarks\nMaths\t91\nPhysics\t84\n");
    expect(t.labels).toEqual(["Maths", "Physics"]);
    expect(t.series[0]).toEqual({ name: "Marks", values: [91, 84] });
  });

  it("works without a header row, and with a single column of numbers", () => {
    expect(parseTable("A, 1\nB, 2").series).toEqual([{ name: "Series 1", values: [1, 2] }]);
    const one = parseTable("5\n8\n13");
    expect(one.labels).toEqual(["1", "2", "3"]);
    expect(one.series[0].values).toEqual([5, 8, 13]);
  });

  it("understands thousands separators, percents and a typographic minus; blanks become gaps", () => {
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber("12%")).toBe(12);
    expect(parseNumber("−3.5")).toBe(-3.5);
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("n/a")).toBeNaN();
    expect(parseTable("x, y\na, 1\nb,\nc, 3").series[0].values).toEqual([1, NaN, 3]);
  });

  it("round-trips through the editable text", () => {
    const spec = { labels: ["Jan", "Feb"], series: [{ name: "Sales", values: [12, NaN] }] };
    expect(parseTable(toTable(spec))).toEqual(spec);
  });

  it("knows when there is nothing to draw", () => {
    expect(hasData({ series: [] })).toBe(false);
    expect(hasData({ series: [{ name: "a", values: [NaN] }] })).toBe(false);
    expect(hasData({ series: [{ name: "a", values: [NaN, 2] }] })).toBe(true);
  });
});

describe("chart look", () => {
  const spec: ChartSpec = { type: "bar", title: "Sales", labels: ["Jan", "Feb"], series: [{ name: "Sales", values: [1, 2] }, { name: "Costs", values: [1, 1] }] };

  it("uses flat ink-palette colours (no gradients) and no animation", () => {
    const c = toChartConfig(spec, "dark");
    expect(c.options.animation).toBe(false);
    const fills = c.data.datasets.map((d) => d.backgroundColor);
    expect(fills).toEqual([chartColors("dark")[0], chartColors("dark")[1]]);
    for (const f of fills) expect(inkPalette("dark")).toContain(f);
  });

  it("gives pie slices one colour each, and drops the axes", () => {
    const c = toChartConfig({ ...spec, type: "pie", series: [spec.series[0]] }, "light");
    expect(c.data.datasets[0].backgroundColor).toEqual(chartColors("light").slice(0, 2));
    expect("scales" in c.options).toBe(false);
    expect(c.options.plugins.legend.display).toBe(true);
  });

  it("plots scatter points from the label column as x", () => {
    const c = toChartConfig({ type: "scatter", labels: ["1", "2.5"], series: [{ name: "y", values: [3, 4] }] }, "dark");
    expect(c.data.datasets[0].data).toEqual([{ x: 1, y: 3 }, { x: 2.5, y: 4 }]);
  });
});
