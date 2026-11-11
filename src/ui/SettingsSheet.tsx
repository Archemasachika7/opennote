"use client";
import { useEffect, useState } from "react";
import { AudioLines, CheckCircle2, HardDrive, Monitor, Moon, ShieldCheck, Sun, Wifi } from "lucide-react";
import { Sheet } from "./Sheet";
import { useTheme, type ThemeMode } from "./theme";
import { useTool } from "../notebook/tool";
import { setBlotEnabled, useBlotEnabled } from "./blotPrefs";
import { setPenOnly, usePenOnly } from "../ink/palmGate";
import { nativeInkAvailable, setNativeInk, useNativeInk } from "../platform/nativeInk";
import { setInkSearch, useInkSearch } from "../ai/inkOcr";
import { TEXT_MODEL_MB } from "../ai/inkOcrModels";
import { db } from "../store/schema";
import { platform } from "../platform/port";
import { toast } from "./Toast";
import { GeminiSettings } from "../ai/GeminiSettings";
import { saveSharedKey } from "../sync/run";
import {
  SARVAM_LANGUAGES,
  setSarvamPrefs,
  testSarvamConnection,
  useSarvamConfig,
} from "../ai/sarvamStt";

const I = { size: 15, strokeWidth: 1.5 } as const;

type StorageInfo = {
  usage: number;
  quota: number;
  persisted: boolean;
  notebooks: number;
  pages: number;
  livePages: number;
  cards: number;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const SHORTCUTS: [string, [string, string][]][] = [
  ["Navigation & Search", [
    ["Ctrl + K", "Command palette & jump"],
    ["/", "Focus library search"],
    ["?", "Settings & shortcuts"],
    ["Ctrl + \\", "Toggle pages sidebar"],
  ]],
  ["Studio Tools", [
    ["P / H / E", "Pen / Highlighter / Eraser"],
    ["L / S / T", "Lasso / Shapes / Text box"],
    ["B / K / R", "Tape / Laser / Ruler"],
    ["Hold Space", "Temporary Hand pan"],
    ["[  /  ]", "Thinner / Thicker stroke"],
    ["Ctrl + Z / Y", "Undo / Redo"],
  ]],
];

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useTheme();
  const [tool, setToolState] = useTool();
  const blotOn = useBlotEnabled();
  const penOnlyOn = usePenOnly();
  const nativeInkOn = useNativeInk();
  const inkSearchOn = useInkSearch();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const { apiKey: sarvamKey, prefs: sarvamPrefs, envManaged: sarvamEnv } = useSarvamConfig();
  const [keyInput, setKeyInput] = useState(sarvamKey);
  const [testingSarvam, setTestingSarvam] = useState(false);
  const [sarvamStatus, setSarvamStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setKeyInput(sarvamKey);
  }, [sarvamKey, open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const [est, persisted, notebooks, pages, livePages, cards] = await Promise.all([
        navigator.storage?.estimate?.().catch(() => ({ usage: 0, quota: 0 })) ?? { usage: 0, quota: 0 },
        navigator.storage?.persisted?.().catch(() => false) ?? false,
        db.notebooks.filter((n) => !n.trashedAt).count(),
        db.pages.count(),
        db.pages.filter((p) => p.kind === "html").count(),
        db.cards.count(),
      ]);
      if (alive) {
        setInfo({
          usage: est.usage ?? 0,
          quota: est.quota ?? 0,
          persisted: !!persisted,
          notebooks,
          pages,
          livePages,
          cards,
        });
      }
    })();
    return () => { alive = false; };
  }, [open]);

  const modes: { id: ThemeMode; label: string; icon: JSX.Element }[] = [
    { id: "dark", label: "Dark", icon: <Moon {...I} /> },
    { id: "light", label: "Light", icon: <Sun {...I} /> },
    { id: "system", label: "System", icon: <Monitor {...I} /> },
  ];

  const pct = info && info.quota > 0 ? Math.min(100, Math.max(1, (info.usage / info.quota) * 100)) : 0;

  return (
    <Sheet open={open} onClose={onClose} title="Settings & Shortcuts" width={560}>
      <div className="settings-stack">
        <section className="settings-group">
          <div className="settings-head">
            <h3>Appearance</h3>
            <span className="dim small">Midnight Studio palette</span>
          </div>
          <div className="theme-seg" role="radiogroup" aria-label="Appearance theme">
            {modes.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={theme === m.id}
                className={`btn ${theme === m.id ? "active" : "ghost"}`} onClick={() => setTheme(m.id)}>
                {m.icon}{m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-head">
            <h3>Blot</h3>
            <label className="small" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" aria-label="Blot, the ink-drop companion" checked={blotOn} onChange={(e) => setBlotEnabled(e.target.checked)} />
              Shown
            </label>
          </div>
          <p className="dim small" style={{ margin: 0 }}>
            The little ink drop on the bottom edge. It hops when a live page runs, cheers when you know a flashcard, and waves when you tap it. Drag it along the edge to move it.
          </p>
        </section>

        <GeminiSettings />

        <section className="settings-group">
          <div className="settings-head">
            <h3>Search handwriting</h3>
            <label className="small" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" aria-label="Search handwriting" checked={inkSearchOn} onChange={(e) => setInkSearch(e.target.checked)} />
              Enabled
            </label>
          </div>
          <p className="dim small" style={{ margin: 0 }}>
            Reads your handwriting on this device a few seconds after you stop writing, so search finds words you wrote by hand.
            Downloads a {TEXT_MODEL_MB} MB handwriting model once. Nothing is uploaded. Works best on neat English writing.
          </p>
        </section>

        {nativeInkAvailable() && (
          <section className="settings-group">
            <div className="settings-head">
              <h3>Native Android ink</h3>
              <label className="small" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" aria-label="Native Android ink" checked={nativeInkOn} onChange={(e) => setNativeInk(e.target.checked)} />
                Enabled
              </label>
            </div>
            <p className="dim small" style={{ margin: 0 }}>
              The line under your stylus is drawn by Android itself (Jetpack Ink), so it keeps up with the nib. Turn it off to compare with
              the standard engine. Your notes are saved the same way either way.
            </p>
          </section>
        )}

        <section className="settings-group">
          <div className="settings-head">
            <h3>Only the pen writes</h3>
            <label className="small" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" aria-label="Only the pen writes" checked={penOnlyOn} onChange={(e) => setPenOnly(e.target.checked)} />
              Enabled
            </label>
          </div>
          <p className="dim small" style={{ margin: 0 }}>
            Fingers only scroll and zoom, from the very first touch. Leave it off to write with a finger until you first use a pen.
            Either way, a resting palm and touches while the pen is near the screen never leave marks.
          </p>
        </section>

        <section className="settings-group">
          <div className="settings-head">
            <h3>Smart Pen Gestures</h3>
            <label className="small" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                aria-label="Smart pen gestures"
                checked={tool.penGestures}
                onChange={(e) => setToolState({ penGestures: e.target.checked })}
              />
              Enabled
            </label>
          </div>
          <p className="dim small" style={{ margin: 0 }}>
            Hold the pen still for 0.4s at the end of a line, arrow, rectangle, triangle or circle to snap it to crisp geometry. Scribble back-and-forth over ink to erase it.
          </p>
        </section>

        <section className="settings-group">
          <div className="settings-head">
            <h3><AudioLines size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 6 }} />Speech-to-Text · Sarvam AI</h3>
            {sarvamKey ? (
              <span className="persist-badge mono"><CheckCircle2 size={13} strokeWidth={1.5} />Key ready</span>
            ) : (
              <span className="dim small">saaras:v3</span>
            )}
          </div>
          <div className="theme-seg" role="radiogroup" aria-label="Lecture transcription engine">
            {([["whisper", "On-device (Whisper, free)"], ["sarvam", "Sarvam AI (your key)"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={(sarvamPrefs.lectureEngine ?? "whisper") === id}
                className={`btn ${(sarvamPrefs.lectureEngine ?? "whisper") === id ? "active" : "ghost"}`}
                onClick={() => setSarvamPrefs({ lectureEngine: id })}>
                {label}
              </button>
            ))}
          </div>
          <p className="dim small" style={{ margin: "0 0 8px" }}>
            Recorded lectures. Whisper runs on this device: free, private, offline after a one-time ~40 MB download.
            Sarvam is often better for Indian languages and uses your own key.
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              type="password"
              className="input"
              aria-label="Settings Sarvam API key"
              placeholder="Paste Sarvam api-subscription-key..."
              value={keyInput}
              disabled={sarvamEnv}
              onChange={(e) => setKeyInput(e.target.value)}
              style={{ flex: 1 }}
            />
            {!sarvamEnv && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void saveSharedKey("sarvam", keyInput);
                  if (keyInput.trim()) setSarvamPrefs({ engine: "sarvam" });
                  toast(keyInput.trim() ? "Saved Sarvam API key" : "Cleared Sarvam API key");
                }}>
                Save
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              disabled={testingSarvam}
              onClick={async () => {
                const trimmed = keyInput.trim();
                if (!sarvamEnv && trimmed !== sarvamKey) void saveSharedKey("sarvam", trimmed);
                setTestingSarvam(true);
                const r = await testSarvamConnection(trimmed);
                setTestingSarvam(false);
                setSarvamStatus(r);
              }}>
              <Wifi size={14} strokeWidth={1.5} />
              {testingSarvam ? "Testing..." : "Test Invoke"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span className="dim small">Default language:</span>
            <select
              className="input"
              aria-label="Default speech language"
              value={sarvamPrefs.languageCode}
              onChange={(e) => setSarvamPrefs({ languageCode: e.target.value })}>
              {SARVAM_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
          {sarvamStatus && (
            <p
              role="status"
              className="small"
              style={{
                margin: "8px 0 0",
                padding: "6px 8px",
                borderRadius: 6,
                background: sarvamStatus.ok ? "rgba(61, 220, 151, 0.12)" : "rgba(255, 107, 107, 0.12)",
                color: sarvamStatus.ok ? "#3DDC97" : "#FF8A8A",
              }}>
              {sarvamStatus.message}
            </p>
          )}
        </section>

        <section className="settings-group">
          <div className="settings-head">
            <h3><HardDrive size={14} strokeWidth={1.5} style={{ verticalAlign: "-2px", marginRight: 6 }} />Device Storage</h3>
            {info?.persisted ? (
              <span className="persist-badge mono"><ShieldCheck size={13} strokeWidth={1.5} />Protected offline</span>
            ) : (
              <button type="button" className="btn" onClick={async () => {
                const granted = await platform.requestPersistentStorage();
                setInfo((prev) => prev ? { ...prev, persisted: granted } : prev);
                toast(granted ? "Persistent offline storage enabled" : "Browser manages storage automatically");
              }}>Keep offline data safe</button>
            )}
          </div>
          {info && (
            <>
              {info.quota > 0 && (
                <div className="meter-wrap">
                  <div className="meter-track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="meter-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="mono dim small">{formatBytes(info.usage)} used of {formatBytes(info.quota)}</span>
                </div>
              )}
              <div className="stat-pills mono">
                <span>{info.notebooks} notebooks</span>
                <span>{info.pages} pages</span>
                <span className="live-stat">{info.livePages} live</span>
                <span>{info.cards} cards</span>
              </div>
            </>
          )}
        </section>

        <section className="settings-group">
          <div className="settings-head">
            <h3>Keyboard Shortcuts</h3>
            <span className="dim small">Press <kbd className="kbd mono">?</kbd> anytime</span>
          </div>
          <div className="shortcut-cols">
            {SHORTCUTS.map(([heading, rows]) => (
              <div key={heading} className="shortcut-col">
                <span className="shortcut-heading dim">{heading}</span>
                {rows.map(([keys, desc]) => (
                  <div key={keys} className="shortcut-row">
                    <span>{desc}</span>
                    <kbd className="kbd mono">{keys}</kbd>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
}
