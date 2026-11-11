"use client";
import { useEffect, useState } from "react";
import { deviceStatus, setGeminiPrefs, testGeminiKey, useGeminiConfig, type AiEngine, type DeviceStatus } from "./gemini";
import { saveSharedKey } from "../sync/run";

const DEVICE_TEXT: Record<DeviceStatus, string> = {
  available: "Gemini Nano is ready on this device.",
  downloadable: "Gemini Nano can be downloaded by this browser the first time you use it.",
  downloading: "This browser is downloading Gemini Nano.",
  unavailable: "Gemini Nano isn't available in this browser (it needs desktop Chrome with built-in AI).",
};

/** Settings > Gemini: summaries and flashcards. Off until the user adds a key or has on-device Gemini. */
export function GeminiSettings() {
  const { key, prefs } = useGeminiConfig();
  const [draft, setDraft] = useState(key);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => { void deviceStatus().then(setDevice); }, []);
  useEffect(() => { setDraft(key); }, [key]);

  return (
    <section className="settings-group">
      <div className="settings-head"><h3>Gemini summaries and flashcards</h3></div>
      <p className="dim small" style={{ margin: 0 }}>
        Summarise a page or a whole notebook, or turn notes into flashcards, from a page&apos;s menu or the toolbar&apos;s More menu.
        {device ? ` ${DEVICE_TEXT[device]}` : ""}
      </p>
      <label className="small" style={{ display: "grid", gap: 4 }}>
        Use
        <select className="input" aria-label="Gemini engine" value={prefs.engine}
          onChange={(e) => setGeminiPrefs({ engine: e.target.value as AiEngine })}>
          <option value="auto">Auto: on this device if possible, else the cloud</option>
          <option value="device">Only on this device (Gemini Nano, offline)</option>
          <option value="cloud">Only the cloud (Gemini API key)</option>
        </select>
      </label>
      <label className="small" style={{ display: "grid", gap: 4 }}>
        Gemini API key (your own, from Google AI Studio)
        <input className="input mono" type="password" autoComplete="off" spellCheck={false} aria-label="Gemini API key"
          placeholder="Paste key" value={draft} onChange={(e) => { setDraft(e.target.value); setTest(null); }}
          onBlur={() => { if (draft.trim() !== key) void saveSharedKey("gemini", draft); }} />
      </label>
      <p className="dim small" style={{ margin: 0 }}>
        With a key, the text of the page or notebook you ask about is sent to Google to answer. With sync on, your key is kept in your account, encrypted, so your other devices have it too.
        Nothing is sent until you ask for a summary or flashcards.
      </p>
      <div className="row-end" style={{ justifyContent: "flex-start", gap: 8 }}>
        <button type="button" className="btn" disabled={!draft.trim() || testing} onClick={async () => {
          void saveSharedKey("gemini", draft);
          setTesting(true);
          setTest(await testGeminiKey(draft));
          setTesting(false);
        }}>{testing ? "Testing..." : "Test key"}</button>
        {key && <button type="button" className="btn ghost" onClick={() => { void saveSharedKey("gemini", ""); setDraft(""); setTest(null); }}>Remove key</button>}
        {test && <span className="small" role="status" style={{ color: test.ok ? "var(--text)" : "var(--danger)" }}>{test.message}</span>}
      </div>
    </section>
  );
}
