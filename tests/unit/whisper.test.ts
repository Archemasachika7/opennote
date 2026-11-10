// @vitest-environment node
import { chunksToSegments, transcribeWithWhisper, WHISPER_MODEL } from "../../src/ai/whisper";

describe("Whisper output → timed transcript segments", () => {
  it("turns [start, end] seconds into ms segments, trims text, drops empty chunks", () => {
    const segs = chunksToSegments([
      { timestamp: [0, 2.5], text: " Cells divide " },
      { timestamp: [2.5, null], text: "by mitosis." },
      { timestamp: [9, 9.4], text: "   " },
    ], 6000);
    expect(segs).toEqual([
      { offsetMs: 0, endMs: 2500, text: "Cells divide" },
      { offsetMs: 2500, endMs: 6000, text: "by mitosis." }, // an open end runs to the end of the audio
    ]);
  });
});

describe("transcribeWithWhisper", () => {
  it("decodes to 16 kHz mono, runs the model with timestamps and joins the text", async () => {
    const decode = vi.fn(async () => ({ samples: new Float32Array(16000 * 3), durationMs: 3000 }));
    const asr = vi.fn(async () => ({ text: " Hello class.", chunks: [{ timestamp: [0, 1.2] as [number, number], text: " Hello class." }] }));
    const progress: string[] = [];
    const r = await transcribeWithWhisper(new Blob(["x"]), { decode, asr, onStatus: (s: string) => progress.push(s) });
    expect(decode).toHaveBeenCalledOnce();
    const call = asr.mock.calls[0] as unknown[];
    expect(call[0]).toBeInstanceOf(Float32Array);
    expect(call[1]).toMatchObject({ return_timestamps: true, chunk_length_s: 30 });
    expect(r).toEqual({ transcript: "Hello class.", languageCode: undefined, segments: [{ offsetMs: 0, endMs: 1200, text: "Hello class." }] });
    expect(progress[0]).toMatch(/preparing audio/i);
  });

  it("passes a chosen language to the model (Whisper's own codes)", async () => {
    const asr = vi.fn(async () => ({ text: "namaste", chunks: [] }));
    await transcribeWithWhisper(new Blob(["x"]), {
      decode: async () => ({ samples: new Float32Array(10), durationMs: 1 }), asr, languageCode: "hi-IN",
    });
    expect((asr.mock.calls[0] as unknown[])[1]).toMatchObject({ language: "hindi", task: "transcribe" });
  });

  it("says plainly when there is no speech", async () => {
    const r = await transcribeWithWhisper(new Blob(["x"]), {
      decode: async () => ({ samples: new Float32Array(10), durationMs: 1 }), asr: async () => ({ text: "", chunks: [] }),
    });
    expect(r.transcript).toBe("");
    expect(r.segments).toEqual([]);
  });

  it("uses a small multilingual model", () => {
    expect(WHISPER_MODEL).toMatch(/whisper-(tiny|base)$/);
  });
});
