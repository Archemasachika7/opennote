"use client";
import { useEffect, useRef, useState } from "react";
import { AudioLines, CheckCircle2, FilePlus2, KeyRound, Mic, Square, Type, Upload, Wifi } from "lucide-react";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import { type Page } from "../store/schema";
import { addTextBox, getObjects, updateObject } from "../ink/objects";
import { getPages, insertPage, updatePage } from "../store/pages";
import {
  isBrowserSpeechSupported,
  SARVAM_LANGUAGES,
  SARVAM_MODES,
  setSarvamApiKey,
  setSarvamPrefs,
  startBrowserDictation,
  testSarvamConnection,
  transcribeWithSarvam,
  useSarvamConfig,
  type SarvamMode,
  type SttEngine,
} from "../ai/sarvamStt";

const I = { size: 15, strokeWidth: 1.5 } as const;

/** Event bus allowing mounted TextPage editors to insert speech transcripts directly at cursor. */
const textInsertSubs = new Set<(pageId: string, text: string) => boolean>();
export function emitRichTextInsert(pageId: string, text: string): boolean {
  let handled = false;
  textInsertSubs.forEach((fn) => {
    if (fn(pageId, text)) handled = true;
  });
  return handled;
}
export function onRichTextInsert(fn: (pageId: string, text: string) => boolean): () => void {
  textInsertSubs.add(fn);
  return () => { textInsertSubs.delete(fn); };
}

function buildTipTapDocFromParagraphs(text: string, existingDoc?: unknown) {
  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const newNodes = lines.map((line) => ({
    type: "paragraph",
    content: [{ type: "text", text: line }],
  }));
  const prev = existingDoc as { type?: string; content?: unknown[] } | null | undefined;
  if (prev && prev.type === "doc" && Array.isArray(prev.content)) {
    return { type: "doc", content: [...prev.content, ...newNodes] };
  }
  return { type: "doc", content: newNodes };
}

export async function insertTranscriptIntoNotebookPage(
  notebookId: string,
  targetPage: Page | undefined,
  transcript: string,
  asNewTextPage = false,
): Promise<Page> {
  const clean = transcript.trim();
  const allPages = await getPages(notebookId);

  if (asNewTextPage || !targetPage) {
    const idx = targetPage ? allPages.findIndex((p) => p.id === targetPage.id) + 1 : allPages.length;
    const created = await insertPage(notebookId, Math.max(0, idx), { kind: "text" });
    await updatePage(created.id, { doc: buildTipTapDocFromParagraphs(clean) });
    return created;
  }

  if (targetPage.kind === "text") {
    if (!emitRichTextInsert(targetPage.id, clean)) {
      await updatePage(targetPage.id, { doc: buildTipTapDocFromParagraphs(clean, targetPage.doc) });
    }
    return targetPage;
  }

  if (targetPage.kind === "ink") {
    const existing = await getObjects(targetPage.id);
    const textCount = existing.filter((o) => o.kind === "textbox").length;
    const y = 96 + (textCount % 7) * 64;
    const box = await addTextBox(targetPage.id, { x: 84, y });
    const estLines = Math.max(2, Math.ceil(clean.length / 44) + clean.split("\n").length - 1);
    await updateObject(box.id, {
      text: clean,
      w: 660,
      h: Math.min(560, Math.max(96, estLines * 36 + 28)),
    });
    return targetPage;
  }

  // Fallback for live html page -> create a companion rich text page right below it
  const idx = allPages.findIndex((p) => p.id === targetPage.id) + 1;
  const created = await insertPage(notebookId, Math.max(0, idx), { kind: "text" });
  await updatePage(created.id, { doc: buildTipTapDocFromParagraphs(clean) });
  return created;
}

export function SpeechNoteModal({
  open,
  onClose,
  notebookId,
  currentPage,
}: {
  open: boolean;
  onClose: () => void;
  notebookId: string;
  currentPage?: Page;
}) {
  const { apiKey, prefs, envManaged } = useSarvamConfig();
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [probeStatus, setProbeStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const browserRecRef = useRef<{ stop: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKeyDraft(apiKey);
  }, [apiKey, open]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (open) return;
    browserRecRef.current?.stop();
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") mediaRecRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setInterim("");
  }, [open]);

  const stopActiveCapture = () => {
    if (browserRecRef.current) {
      browserRecRef.current.stop();
      browserRecRef.current = null;
      setRecording(false);
      setInterim("");
      return;
    }
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    }
  };

  const startCapture = async () => {
    setProbeStatus(null);
    setElapsedSec(0);

    if (prefs.engine === "browser") {
      const session = startBrowserDictation({
        lang: prefs.languageCode,
        onResult: (finalChunk, interimChunk) => {
          if (finalChunk) {
            setTranscript((prev) => (prev ? `${prev.trimEnd()} ${finalChunk.trim()}` : finalChunk.trim()));
          }
          setInterim(interimChunk);
        },
        onError: (msg) => toast(msg),
        onEnd: () => {
          setRecording(false);
          setInterim("");
          browserRecRef.current = null;
        },
      });
      if (session) {
        browserRecRef.current = session;
        setRecording(true);
      }
      return;
    }

    // Sarvam AI saaras:v3 audio capture
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Microphone capture is unavailable in this browser. Upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        await runSarvamTranscription(blob);
      };
      rec.start(250);
      setRecording(true);
    } catch {
      toast("Microphone permission denied.");
    }
  };

  const runSarvamTranscription = async (blob: Blob) => {
    setBusy("Invoking Sarvam AI (saaras:v3)...");
    try {
      const res = await transcribeWithSarvam(blob, {
        apiKey: keyDraft.trim() || undefined,
        languageCode: prefs.languageCode,
        mode: prefs.mode,
        onProgress: (done, total) => {
          if (total > 1) setBusy(`Sarvam AI (saaras:v3) chunk ${Math.min(done + 1, total)} / ${total}...`);
        },
      });
      if (res.transcript) {
        setTranscript((prev) => (prev.trim() ? `${prev.trim()}\n${res.transcript}` : res.transcript));
        toast("Transcribed with Sarvam AI (saaras:v3)");
      } else {
        toast("No speech detected in audio clip.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(msg);
      if (!apiKey) setKeyOpen(true);
    } finally {
      setBusy(null);
    }
  };

  const handleTestSarvam = async () => {
    const clean = keyDraft.trim();
    if (clean !== apiKey && !envManaged) setSarvamApiKey(clean);
    setBusy("Testing Sarvam AI...");
    const result = await testSarvamConnection(clean);
    setBusy(null);
    setProbeStatus(result);
  };

  const handleInsert = async (asNewTextPage: boolean) => {
    const fullText = `${transcript}${interim ? ` ${interim}` : ""}`.trim();
    if (!fullText) {
      toast("Record or type a speech note first.");
      return;
    }
    await insertTranscriptIntoNotebookPage(notebookId, currentPage, fullText, asNewTextPage);
    toast(asNewTextPage ? "Created Rich Text page from speech note" : "Inserted speech note onto page");
    setTranscript("");
    setInterim("");
    onClose();
  };

  const fmtSec = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Sheet open={open} onClose={onClose} title="Speech-to-Text Note" width={540}>
      <div className="stt-modal" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Engine + Sarvam Key status bar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <div className="theme-seg" role="radiogroup" aria-label="Speech recognition engine">
            {(["sarvam", "browser"] as SttEngine[]).map((eng) => (
              <button
                key={eng}
                type="button"
                role="radio"
                aria-checked={prefs.engine === eng}
                className={`btn ${prefs.engine === eng ? "active" : "ghost"}`}
                onClick={() => setSarvamPrefs({ engine: eng })}>
                {eng === "sarvam" ? <><AudioLines {...I} />Sarvam AI (saaras:v3)</> : <><Mic {...I} />Browser Live (Free)</>}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`btn ${apiKey ? "ghost" : ""}`}
            aria-label="Configure Sarvam API key"
            onClick={() => setKeyOpen((v) => !v)}>
            <KeyRound {...I} />
            {apiKey ? "Sarvam Key Ready" : "Set Sarvam Key"}
          </button>
        </div>

        {(keyOpen || (prefs.engine === "sarvam" && !apiKey)) && (
          <div
            className="settings-group"
            style={{ padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong className="small">Sarvam AI API Subscription Key (`saaras:v3`)</strong>
              {apiKey && <span className="mono small" style={{ color: "var(--ok, #3DDC97)" }}><CheckCircle2 size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />Saved locally</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="password"
                className="input"
                aria-label="Sarvam API subscription key"
                placeholder="Paste Sarvam api-subscription-key..."
                value={keyDraft}
                disabled={envManaged}
                onChange={(e) => setKeyDraft(e.target.value)}
                style={{ flex: 1 }}
              />
              {!envManaged && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSarvamApiKey(keyDraft);
                    setSarvamPrefs({ engine: "sarvam" });
                    toast(keyDraft.trim() ? "Saved Sarvam API key on this device" : "Cleared Sarvam API key");
                  }}>
                  Save
                </button>
              )}
              <button
                type="button"
                className="btn primary"
                aria-label="Test Sarvam API"
                disabled={Boolean(busy)}
                onClick={() => void handleTestSarvam()}>
                <Wifi {...I} />Test Invoke
              </button>
            </div>
            <p className="dim small" style={{ margin: "6px 0 0" }}>
              Invokes <code>https://api.sarvam.ai/speech-to-text</code> directly from your browser (auto-chunks long recordings &le; 25s). Stored only on your device.
            </p>
            {probeStatus && (
              <div
                role="status"
                className="small"
                style={{
                  marginTop: 6,
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: probeStatus.ok ? "rgba(61, 220, 151, 0.12)" : "rgba(255, 107, 107, 0.12)",
                  color: probeStatus.ok ? "#3DDC97" : "#FF8A8A",
                }}>
                {probeStatus.message}
              </div>
            )}
          </div>
        )}

        {/* Language & Mode selectors */}
        <div style={{ display: "grid", gridTemplateColumns: prefs.engine === "sarvam" ? "1fr 1fr" : "1fr", gap: 8 }}>
          <label className="small dim" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Spoken Language
            <select
              className="input"
              aria-label="Speech language"
              value={prefs.languageCode}
              onChange={(e) => setSarvamPrefs({ languageCode: e.target.value })}>
              {SARVAM_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
          {prefs.engine === "sarvam" && (
            <label className="small dim" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              Output Mode
              <select
                className="input"
                aria-label="Sarvam output mode"
                value={prefs.mode}
                onChange={(e) => setSarvamPrefs({ mode: e.target.value as SarvamMode })}>
                {SARVAM_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Record / Upload controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void runSarvamTranscription(f);
            }}
          />
          {!recording ? (
            <button
              type="button"
              className="btn primary"
              aria-label="Start speech recording"
              disabled={Boolean(busy)}
              onClick={() => void startCapture()}>
              <Mic {...I} />
              {prefs.engine === "sarvam" ? "Record & Transcribe" : "Start Live Dictation"}
            </button>
          ) : (
            <button
              type="button"
              className="btn danger"
              aria-label="Stop speech recording"
              onClick={stopActiveCapture}>
              <Square {...I} />Stop · <span className="mono">{fmtSec(elapsedSec)}</span>
            </button>
          )}

          {prefs.engine === "sarvam" && (
            <button
              type="button"
              className="btn"
              aria-label="Upload audio to transcribe"
              disabled={recording || Boolean(busy)}
              onClick={() => fileInputRef.current?.click()}>
              <Upload {...I} />Transcribe Audio File
            </button>
          )}

          {busy && <span className="mono small" style={{ color: "var(--accent, #F5A524)" }}>{busy}</span>}
          {!isBrowserSpeechSupported() && prefs.engine === "browser" && (
            <span className="dim small">Web Speech API unavailable in this browser — switch to Sarvam AI above.</span>
          )}
        </div>

        {/* Editable Transcript Box */}
        <div>
          <textarea
            className="input"
            aria-label="Speech note transcript"
            rows={6}
            placeholder={
              prefs.engine === "sarvam"
                ? "Click 'Record & Transcribe' to speak in English, Bengali, Hindi, or any Indic language — Sarvam saaras:v3 will convert your voice into clean notes here..."
                : "Speak into your microphone — live words appear here..."
            }
            value={interim ? `${transcript}${transcript ? " " : ""}${interim}` : transcript}
            onChange={(e) => {
              setInterim("");
              setTranscript(e.target.value);
            }}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </div>

        {/* Action Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn ghost"
            onClick={() => { setTranscript(""); setInterim(""); }}>
            Clear
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              aria-label="Create new text page from speech"
              onClick={() => void handleInsert(true)}>
              <FilePlus2 {...I} />New Text Page
            </button>
            <button
              type="button"
              className="btn primary"
              aria-label="Insert on page"
              onClick={() => void handleInsert(false)}>
              <Type {...I} />Insert on Page
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
