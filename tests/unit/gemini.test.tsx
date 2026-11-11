import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages, insertPage, updatePage } from "../../src/store/pages";
import { listCards } from "../../src/store/cards";
import {
  AiSetupNeeded, askGemini, getGeminiPrefs, parseCards, pickEngine, pickFlash, setGeminiKey, setGeminiPrefs, DEFAULT_MODEL,
} from "../../src/ai/gemini";
import { htmlText, pageText } from "../../src/ai/pageText";
import { AiSheet } from "../../src/ai/AiSheet";

type LM = { availability: () => Promise<string>; create: (o: unknown) => Promise<{ prompt: (s: string, o?: unknown) => Promise<string>; destroy: () => void }> };
const g = globalThis as unknown as { LanguageModel?: LM };

function fakeNano(answer: string | ((prompt: string) => string), status = "available") {
  const prompts: string[] = [];
  g.LanguageModel = {
    availability: async () => status,
    create: async () => ({
      prompt: async (s: string) => { prompts.push(s); return typeof answer === "function" ? answer(s) : answer; },
      destroy: () => undefined,
    }),
  };
  return prompts;
}

beforeEach(async () => {
  localStorage.clear();
  delete g.LanguageModel;
  vi.restoreAllMocks();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("choosing an engine", () => {
  it("uses Gemini Nano on the device when the browser has it", async () => {
    fakeNano("x");
    expect(await pickEngine()).toBe("device");
  });

  it("falls back to the cloud with a key, and asks for setup without one", async () => {
    await expect(pickEngine()).rejects.toBeInstanceOf(AiSetupNeeded);
    setGeminiKey("k-123");
    expect(await pickEngine()).toBe("cloud");
  });

  it("respects 'only the cloud' even when Nano is there, and 'only this device' when it is not", async () => {
    fakeNano("x");
    setGeminiKey("k");
    setGeminiPrefs({ engine: "cloud" });
    expect(await pickEngine()).toBe("cloud");
    delete g.LanguageModel;
    setGeminiPrefs({ engine: "device" });
    await expect(pickEngine()).rejects.toThrow(/isn't available/);
  });
});

describe("the cloud call", () => {
  it("sends the key in a header (not the URL) and reads the answer", async () => {
    setGeminiKey("secret-key");
    setGeminiPrefs({ engine: "cloud" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gist." }] } }] }), { status: 200 }));
    const r = await askGemini({ system: "s", prompt: "notes" });
    expect(r).toEqual({ text: "Gist.", engine: "cloud" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/models/${DEFAULT_MODEL}:generateContent`);
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
  });

  it("when the model name has been retired, finds the newest Flash model and remembers it", async () => {
    setGeminiKey("k");
    setGeminiPrefs({ engine: "cloud", model: "gemini-old-flash" });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "not found" } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [
        { name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 }));
    expect((await askGemini({ system: "s", prompt: "p" })).text).toBe("ok");
    expect(String(fetchMock.mock.calls[2][0])).toContain("gemini-3.8-flash:generateContent");
    expect(getGeminiPrefs().model).toBe("gemini-3.8-flash");
  });

  it("explains a used-up free limit and a rejected key in plain words", async () => {
    setGeminiKey("k"); setGeminiPrefs({ engine: "cloud" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(askGemini({ system: "s", prompt: "p" })).rejects.toThrow(/free limit/);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
    await expect(askGemini({ system: "s", prompt: "p" })).rejects.toBeInstanceOf(AiSetupNeeded);
  });

  it("cuts very long notes to fit the on-device model", async () => {
    const prompts = fakeNano("short");
    await askGemini({ system: "s", prompt: "a".repeat(50_000) });
    expect(prompts[0].length).toBeLessThan(13_000);
    expect(prompts[0]).toContain("the rest was cut");
  });
});

describe("reading answers", () => {
  it("reads cards from JSON, a ```json fence, or a bare list; drops blanks and repeats", () => {
    expect(parseCards('{"cards":[{"front":"Q1","back":"A1"},{"front":"q1","back":"dup"},{"front":"","back":"x"}]}')).toEqual([{ front: "Q1", back: "A1" }]);
    expect(parseCards('```json\n[{"front":"F","back":"B"}]\n```')).toEqual([{ front: "F", back: "B" }]);
    expect(parseCards("sorry, no")).toEqual([]);
  });

  it("picks the newest plain Flash model", () => {
    expect(pickFlash(["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.8-pro"])).toBe("gemini-3.8-flash");
    expect(pickFlash(["gemini-pro"])).toBeNull();
  });
});

describe("what gets read from a page", () => {
  it("takes typed text, text boxes and chart data, and the words of a live page without its code", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const [ink] = await getPages(nb.id);
    await db.objects.bulkAdd([
      { id: "t1", pageId: ink.id, kind: "textbox", x: 0, y: 100, w: 10, h: 10, rotation: 0, z: 1, text: "Mitochondria make ATP" },
      { id: "c1", pageId: ink.id, kind: "image", x: 0, y: 200, w: 10, h: 10, rotation: 0, z: 2, blobId: "b", chart: { type: "bar", title: "Yield", labels: ["Jan"], series: [{ name: "ATP", values: [36] }] } },
    ]);
    const text = await pageText((await getPages(nb.id))[0]);
    expect(text).toContain("Mitochondria make ATP");
    expect(text).toContain('Chart "Yield" (bar): Jan: ATP 36');
    expect(htmlText("<style>p{}</style><p>Wave speed</p><script>alert(1)</script>")).toBe("Wave speed");
  });
});

describe("the Gemini sheet", () => {
  it("makes flashcards from a page and adds only the ticked ones to the notebook's study set", async () => {
    fakeNano('{"cards":[{"front":"What makes ATP?","back":"Mitochondria"},{"front":"Unit of life?","back":"The cell"}]}');
    const nb = await createNotebook({ title: "Bio" });
    const p = await insertPage(nb.id, 1, { kind: "text" });
    await updatePage(p.id, { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Mitochondria make ATP. The cell is the unit of life." }] }] } });
    const page = (await getPages(nb.id))[1];
    render(<AiSheet request={{ task: "cards", scope: "page", page, pageNumber: 2 }} notebook={nb} pages={[page]} onClose={() => {}} onAddSummary={async () => {}} />);
    await screen.findByText("What makes ATP?");
    expect(screen.getByText(/Gemini Nano on this device/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Keep card 2"));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to study cards" }));
    await waitFor(async () => {
      const set = (await db.notebooks.toArray()).find((n) => n.kind === "studyset");
      expect(set?.title).toBe("Bio — Study Cards");
      expect((await listCards(set!.id)).map((c) => c.front)).toEqual(["What makes ATP?"]);
    });
  });

  it("asks for setup instead of failing when there is no engine", async () => {
    const nb = await createNotebook({ title: "Bio" });
    const p = await insertPage(nb.id, 1, { kind: "text" });
    await updatePage(p.id, { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Plenty of words on this page to summarise for sure." }] }] } });
    const page = (await getPages(nb.id))[1];
    const open = vi.fn();
    render(<AiSheet request={{ task: "summary", scope: "page", page, pageNumber: 2 }} notebook={nb} pages={[page]} onClose={() => {}} onAddSummary={async () => {}} onOpenSettings={open} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Settings" }));
    expect(open).toHaveBeenCalled();
  });
});
