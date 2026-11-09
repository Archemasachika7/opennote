import { render, screen } from "@testing-library/react";
import { createCrashGuard } from "../../src/live/crashGuard";

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, dump: () => m };
}

describe("crash guard", () => {
  it("pages still marked running from the previous session are suspects; marks are then cleared", () => {
    const s = memStore({ "opennote:running": JSON.stringify(["p1"]) });
    const g = createCrashGuard(s);
    expect(g.isSuspect("p1")).toBe(true);
    expect(g.isSuspect("p2")).toBe(false);
    expect(s.getItem("opennote:running")).toBe("[]");
  });
  it("tracks running pages and clears them on a clean exit", () => {
    const s = memStore();
    const g = createCrashGuard(s);
    g.markRunning("a");
    g.markRunning("b");
    g.markStopped("a");
    expect(JSON.parse(s.getItem("opennote:running")!)).toEqual(["b"]);
    g.cleanExit();
    expect(JSON.parse(s.getItem("opennote:running")!)).toEqual([]);
    expect(createCrashGuard(s).isSuspect("b")).toBe(false);
  });
  it("forgive() lets a suspect run again", () => {
    const g = createCrashGuard(memStore({ "opennote:running": JSON.stringify(["x"]) }));
    g.forgive("x");
    expect(g.isSuspect("x")).toBe(false);
  });
});

it("a live page that froze last time starts paused with an explanation", async () => {
  localStorage.setItem("opennote:running", JSON.stringify(["frozen-page"]));
  vi.resetModules();
  const { LivePage } = await import("../../src/live/LivePage");
  const page = { id: "frozen-page", notebookId: "n", kind: "html" as const, title: "Loop", source: "<p/>", artifactType: "html" as const,
    allowNetwork: false, height: 1872, createdAt: 0, updatedAt: 0, size: { w: 1404, h: 1872 } };
  render(<LivePage page={page} mounted width={702} priority={1000} onEdit={() => {}} />);
  expect(await screen.findByText(/stopped responding last time/i)).toBeInTheDocument();
  expect(document.querySelector("iframe")).toBeNull();
  expect(screen.getAllByRole("button", { name: /run/i }).length).toBeGreaterThan(0);
}, 15_000); // re-imports the whole live-page module graph after resetModules
