import "fake-indexeddb/auto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { encodeStroke, decodeStroke, type Stroke } from "../../src/ink/model";
import { shapePoints } from "../../src/ink/shapes";
import { hitTest } from "../../src/ink/geometry";
import { paintStroke, resolveFillColor } from "../../src/ink/render";
import { sliceStrokeByTime } from "../../src/ink/replay";
import { setTool, getTool } from "../../src/notebook/tool";
import { Toolbar } from "../../src/notebook/Toolbar";
import { InkLayer } from "../../src/ink/InkLayer";
import { AudioBar } from "../../src/notebook/AudioBar";
import {
  getAudioLiveState,
  listAudioClips,
  saveAudioClip,
  setAudioLiveState,
} from "../../src/store/audio";
import {
  createSilentTestWav,
  encodePcm16Wav,
  getSarvamApiKey,
  setSarvamApiKey,
  testSarvamConnection,
  transcribeWithSarvam,
} from "../../src/ai/sarvamStt";
import { SpeechNoteModal } from "../../src/notebook/SpeechNoteModal";
import { db, type Notebook } from "../../src/store/schema";
import { createNotebook } from "../../src/store/notebooks";
import { getPages } from "../../src/store/pages";
import { getObjects } from "../../src/ink/objects";
import { getStrokes, putStroke } from "../../src/store/strokes";

const dummyNotebook: Notebook = {
  id: "nb-test-1",
  title: "Physics Notes",
  coverColor: "#F5A524",
  paper: "dark",
  folderId: null,
  pageIds: [],
  createdAt: 1,
  updatedAt: 1,
  bookmarks: [],
};

describe("1. Shape Fill Color — independent fillColor, opacity, interior hitTest & UI", () => {
  beforeEach(() => {
    setTool({
      tool: "shape",
      shapeKind: "rect",
      shapeFill: false,
      shapeFillColor: null,
      shapeFillPaletteIndex: null,
      shapeFillOpacity: 0.42,
      shapeDashed: false,
      color: "#E8E9EE",
      paletteIndex: 0,
    });
  });

  it("round-trips fillColor, fillPaletteIndex, and fillOpacity through binary stroke codec", () => {
    const rect: Stroke = {
      id: "sh-fill-1",
      tool: "pen",
      variant: "ball",
      color: "#E8E9EE",
      paletteIndex: 0,
      width: 3,
      points: shapePoints("rect", 20, 20, 180, 140, false),
      shape: {
        kind: "rect",
        fill: true,
        fillColor: "#4FD1C5",
        fillPaletteIndex: 1,
        fillOpacity: 0.9,
        dashed: false,
      },
    };
    const decoded = decodeStroke(encodeStroke(rect));
    expect(decoded.shape).toEqual({
      kind: "rect",
      fill: true,
      fillColor: "#4FD1C5",
      fillPaletteIndex: 1,
      fillOpacity: 0.9,
      dashed: false,
    });
    expect(resolveFillColor(decoded, "dark")).toBe("#4FD1C5");
    expect(resolveFillColor(decoded, "light")).toBe("#0F766E");
  });

  it("paints filled closed shapes with independent fillStyle vs strokeStyle and visible opacity", () => {
    const styleLog: { op: "fill" | "stroke"; fillStyle: string; strokeStyle: string; alpha: number }[] = [];
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "round",
      lineJoin: "round",
      globalAlpha: 1,
      save: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(function (this: { fillStyle: string; strokeStyle: string; globalAlpha: number }) {
        styleLog.push({ op: "fill", fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, alpha: this.globalAlpha });
      }),
      stroke: vi.fn(function (this: { fillStyle: string; strokeStyle: string; globalAlpha: number }) {
        styleLog.push({ op: "stroke", fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, alpha: this.globalAlpha });
      }),
    } as unknown as CanvasRenderingContext2D;

    const filledRect: Stroke = {
      id: "sh-fill-2",
      tool: "pen",
      variant: "ball",
      color: "#E8E9EE",
      width: 3,
      points: shapePoints("rect", 10, 10, 110, 90, false),
      shape: { kind: "rect", fill: true, fillColor: "#3DDC97", fillOpacity: 0.88 },
    };
    paintStroke(ctx, filledRect, "dark");

    const fillOp = styleLog.find((x) => x.op === "fill");
    const strokeOp = styleLog.find((x) => x.op === "stroke");
    expect(fillOp).toBeDefined();
    expect(strokeOp).toBeDefined();
    expect(fillOp!.fillStyle).toBe("#3DDC97");
    expect(strokeOp!.strokeStyle).toBe("#E8E9EE");
    expect(fillOp!.alpha).toBeCloseTo(0.88, 2);
  });

  it("hitTests inside the interior of filled closed shapes while keeping hollow shapes perimeter-only", () => {
    const hollow: Stroke = {
      id: "hollow-rect",
      tool: "pen",
      variant: "ball",
      color: "#E8E9EE",
      width: 3,
      points: shapePoints("rect", 50, 50, 250, 200, false),
      shape: { kind: "rect", fill: false },
    };
    const filled: Stroke = {
      ...hollow,
      id: "filled-rect",
      shape: { kind: "rect", fill: true, fillColor: "#F2C94C" },
    };
    // Center (150, 125) is far from border: hollow = false, filled = true
    expect(hitTest(hollow, 150, 125, 6)).toBe(false);
    expect(hitTest(filled, 150, 125, 6)).toBe(true);
    // Outside (300, 300) = false for both
    expect(hitTest(filled, 300, 300, 6)).toBe(false);
  });

  it("Toolbar lets users pick a Fill colour directly and enables shapeFill automatically", () => {
    render(
      <Toolbar
        notebook={dummyNotebook}
        zoom={1}
        setZoom={() => {}}
        sidebarOpen={false}
        onToggleSidebar={() => {}}
        palette={["#E8E9EE", "#4FD1C5", "#3DDC97", "#FF9E6B", "#6CC4FF", "#F2C94C", "#FF8A8A", "#B4B7C3"]}
        currentKind="ink"
        onUndo={() => {}}
        onRedo={() => {}}
      />,
    );

    const fillToggle = screen.getByRole("button", { name: "Fill shape" });
    fireEvent.click(fillToggle);
    expect(getTool().shapeFill).toBe(true);

    const tealFill = screen.getByRole("button", { name: "Fill colour 2" });
    fireEvent.click(tealFill);
    expect(getTool().shapeFill).toBe(true);
    expect(getTool().shapeFillColor).toBe("#4FD1C5");
    expect(getTool().shapeFillPaletteIndex).toBe(1);

    const solidBtn = screen.getByRole("button", { name: "Solid shape fill" });
    fireEvent.click(solidBtn);
    expect(getTool().shapeFillOpacity).toBeGreaterThan(0.8);
  });
});

describe("2. Lecture Audio Sync — real duration on stop, stroke-start sync & progressive Ink Replay", () => {
  beforeEach(async () => {
    setAudioLiveState({ recording: null, playback: null });
    await db.blobs.clear();
  });

  it("slices a synced stroke progressively by elapsed playback time", () => {
    const stroke: Stroke = {
      id: "sync-1",
      tool: "pen",
      variant: "ball",
      color: "#E8E9EE",
      width: 3,
      // 4 points at t = 0, 100, 200, 300ms
      points: new Float32Array([
        10, 10, 0.5, 0,
        30, 10, 0.5, 100,
        50, 10, 0.5, 200,
        70, 10, 0.5, 300,
      ]),
      audioSync: { clipId: "clip-1", offsetMs: 1000 },
    };

    expect(sliceStrokeByTime(stroke, 900).state).toBe("future");
    const mid = sliceStrokeByTime(stroke, 1150);
    expect(mid.state).toBe("writing");
    expect(mid.partial!.points.length / 4).toBe(2);
    expect(mid.tip).toEqual({ x: 30, y: 10 });
    expect(sliceStrokeByTime(stroke, 1400).state).toBe("done");
  });

  it("saves real elapsed recording duration (fixing stale closure 500ms bug) and counts synced strokes", async () => {
    const nb = await createNotebook({ title: "Lecture Sync NB" });
    const pages = await getPages(nb.id);
    const pageId = pages[0].id;

    const holder: { stopCb?: () => Promise<void> | void } = {};
    class FakeMediaRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["fake-webm"], { type: "audio/webm" }) });
      }
      stop() {
        this.state = "inactive";
        holder.stopCb = () => this.onstop?.();
      }
    }
    const origMR = globalThis.MediaRecorder;
    const origMD = navigator.mediaDevices;
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
      },
    });

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(10_000);

    try {
      render(<AudioBar notebookId={nb.id} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Record lecture audio" }));

      await waitFor(() => expect(getAudioLiveState().recording).not.toBeNull());
      const activeClipId = getAudioLiveState().recording!.clipId;

      // Simulate writing a stroke 4.2 seconds into the lecture
      nowSpy.mockReturnValue(14_200);
      await putStroke(pageId, {
        id: "synced-s1",
        tool: "pen",
        variant: "ball",
        color: "#E8E9EE",
        width: 3,
        points: new Float32Array([20, 20, 0.5, 0, 80, 40, 0.5, 180]),
        audioSync: { clipId: activeClipId, offsetMs: 4200 },
      });

      // Stop recording at 9.5 seconds
      nowSpy.mockReturnValue(19_500);
      fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
      await holder.stopCb?.();

      await waitFor(async () => {
        const savedClips = await listAudioClips(nb.id);
        expect(savedClips.length).toBe(1);
        expect(savedClips[0].id).toBe(activeClipId);
        // Must be ~9500ms, NOT stale 500ms!
        expect(savedClips[0].durationMs).toBeGreaterThanOrEqual(9000);
      });

      // Synced strokes badge reflects our stroke
      await waitFor(() => {
        expect(screen.getByText(/1 synced/i)).toBeTruthy();
      });
    } finally {
      nowSpy.mockRestore();
      (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = origMR;
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: origMD });
    }
  });

  it("stamps audioSync at pointerDown on InkLayer while recording", async () => {
    const nb = await createNotebook({ title: "Ink Stamp NB" });
    const pages = await getPages(nb.id);
    const pageId = pages[0].id;
    setTool({ tool: "pen", color: "#E8E9EE", width: 3 });

    const baseNow = Date.now();
    setAudioLiveState({
      recording: { notebookId: nb.id, clipId: "rec-clip-99", startedAt: baseNow - 3200, accumulatedMs: 0, paused: false },
    });

    render(<InkLayer pageId={pageId} width={600} height={800} paper="dark" />);
    const surface = await screen.findByTestId("ink-surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
    });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: "pen", clientX: 50, clientY: 60, pressure: 0.6 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: "pen", clientX: 120, clientY: 90, pressure: 0.6 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: "pen", clientX: 120, clientY: 90, pressure: 0.6 });

    await waitFor(async () => {
      const list = await getStrokes(pageId);
      expect(list.length).toBe(1);
      expect(list[0].audioSync?.clipId).toBe("rec-clip-99");
      expect(list[0].audioSync?.offsetMs).toBeGreaterThanOrEqual(3100);
    });
    setAudioLiveState({ recording: null });
  });
});

describe("3. Sarvam AI Speech-to-Text (saaras:v3) & Speech-to-Text Notes", () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.removeItem("opennote:sarvam-api-key");
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("encodes valid 16kHz mono 16-bit PCM WAV headers", () => {
    const wavBytes = encodePcm16Wav(new Float32Array(1600), 16000);
    const view = new DataView(wavBytes.buffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(magic).toBe("RIFF");
    expect(wave).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(22, true)).toBe(1); // mono

    const silentBlob = createSilentTestWav(300);
    expect(silentBlob.type).toBe("audio/wav");
    expect(silentBlob.size).toBeGreaterThan(44);
  });

  it("invokes Sarvam AI https://api.sarvam.ai/speech-to-text with api-subscription-key and saaras:v3", async () => {
    setSarvamApiKey("sk_sarvam_test_123");
    expect(getSarvamApiKey()).toBe("sk_sarvam_test_123");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.sarvam.ai/speech-to-text");
      const headers = init?.headers as Record<string, string>;
      expect(headers["api-subscription-key"]).toBe("sk_sarvam_test_123");
      const fd = init?.body as FormData;
      expect(fd.get("model")).toBe("saaras:v3");
      expect(fd.get("mode")).toBe("transcribe");
      expect(fd.get("language_code")).toBe("bn-IN");
      return new Response(
        JSON.stringify({ transcript: "নিউটনের দ্বিতীয় সূত্র F = ma", language_code: "bn-IN" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await transcribeWithSarvam(createSilentTestWav(400), {
      languageCode: "bn-IN",
      mode: "transcribe",
    });
    expect(res.transcript).toBe("নিউটনের দ্বিতীয় সূত্র F = ma");
    expect(res.languageCode).toBe("bn-IN");
    expect(res.segments.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("testSarvamConnection reports active key on 200 and clear diagnostics on 403", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ transcript: "" }), { status: 200 })) as unknown as typeof fetch;
    const ok = await testSarvamConnection("sk_valid_key");
    expect(ok.ok).toBe(true);
    expect(ok.message).toMatch(/saaras:v3/i);

    globalThis.fetch = vi.fn(async () => new Response("Forbidden", { status: 403 })) as unknown as typeof fetch;
    const bad = await testSarvamConnection("sk_bad_key");
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(403);
  });

  it("inserts a transcribed Speech-to-Text note onto an Ink page as a textbox object", async () => {
    const nb = await createNotebook({ title: "Voice Note NB" });
    const pages = await getPages(nb.id);
    const page = pages[0];

    setSarvamApiKey("sk_sarvam_note_key");
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ transcript: "Thermodynamics first law: energy is conserved." }), { status: 200 }),
    ) as unknown as typeof fetch;

    render(
      <SpeechNoteModal
        open
        onClose={() => {}}
        notebookId={nb.id}
        currentPage={page}
      />,
    );

    const textarea = screen.getByLabelText("Speech note transcript");
    fireEvent.change(textarea, { target: { value: "Thermodynamics first law: energy is conserved." } });
    fireEvent.click(screen.getByRole("button", { name: /Insert on page/i }));

    await waitFor(async () => {
      const objs = await getObjects(page.id);
      expect(objs.some((o) => o.kind === "textbox" && o.text?.includes("Thermodynamics first law"))).toBe(true);
    });
  });

  it("AudioBar transcribes a saved lecture clip with Sarvam AI and attaches clickable timestamped segments", async () => {
    const nb = await createNotebook({ title: "Transcript Audio NB" });
    const wav = createSilentTestWav(500);
    const clip = await saveAudioClip(nb.id, wav, { title: "Lecture 1", durationMs: 12_000 });
    // fake-indexeddb drops jsdom Blobs (browsers keep them): hand the audio row back as the real browser would
    const realGet = db.blobs.get.bind(db.blobs);
    vi.spyOn(db.blobs, "get").mockImplementation((async (key: string) => {
      const row = await realGet(key);
      return row ? { ...row, data: wav } : row;
    }) as never);
    setSarvamApiKey("sk_sarvam_clip_key");

    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ transcript: "Wave-particle duality explained clearly.", language_code: "en-IN" }), { status: 200 }),
    ) as unknown as typeof fetch;

    render(<AudioBar notebookId={nb.id} onClose={() => {}} />);
    const transcribeBtn = await screen.findByRole("button", { name: /Transcribe lecture/i });
    fireEvent.click(transcribeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Wave-particle duality explained clearly\./i)).toBeTruthy();
    });

    const updated = await listAudioClips(nb.id);
    expect(updated.find((c) => c.id === clip.id)?.transcript).toContain("Wave-particle duality");
  });
});
