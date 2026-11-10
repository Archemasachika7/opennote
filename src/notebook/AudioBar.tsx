import { useEffect, useRef, useState } from "react";
import { AudioLines, FileText, Mic, Pause, Play, Sparkles, Square, Trash2, Type, Upload, Volume2, Wand2, X } from "lucide-react";
import { newId, type Page } from "../store/schema";
import {
  countSyncedStrokesForClip,
  deleteAudioClip,
  getAudioClipBlob,
  getAudioLiveState,
  listAudioClips,
  onAudioSeekRequest,
  saveAudioClip,
  setAudioLiveState,
  updateAudioClipMeta,
  useAudioLiveState,
  type AudioClipMeta,
} from "../store/audio";
import { onPageChanged } from "../ink/pageEvents";
import { transcribeWithSarvam, useSarvamConfig } from "../ai/sarvamStt";
import { transcribeWithWhisper } from "../ai/whisper";
import { insertTranscriptIntoNotebookPage } from "./SpeechNoteModal";
import { toast } from "../ui/Toast";

const I = { size: 14, strokeWidth: 1.5 } as const;

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function AudioBar({
  notebookId,
  currentPage,
  onOpenSpeechSettings,
  onClose,
}: {
  notebookId: string;
  currentPage?: Page;
  onOpenSpeechSettings?: () => void;
  onClose: () => void;
}) {
  const [clips, setClips] = useState<AudioClipMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [inkReplay, setInkReplay] = useState(true);
  const [tapToSeek, setTapToSeek] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const live = useAudioLiveState();
  const { prefs } = useSarvamConfig();
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const objUrlRef = useRef<string | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeClipIdRef = useRef<string>("");
  const recStartedAtRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeClip = clips.find((c) => c.id === selectedId);
  const isRec = Boolean(live.recording && live.recording.notebookId === notebookId);
  const isPlaying = Boolean(live.playback?.playing && live.playback.clipId === selectedId);
  const trackedClipId = isRec ? live.recording?.clipId ?? "" : selectedId;

  const refreshClips = async (pickId?: string) => {
    const list = await listAudioClips(notebookId);
    setClips(list);
    if (pickId) setSelectedId(pickId);
    else if (!selectedId && list.length > 0) setSelectedId(list[list.length - 1].id);
    else if (selectedId && !list.some((c) => c.id === selectedId)) setSelectedId(list[0]?.id ?? "");
  };

  useEffect(() => {
    void refreshClips();
    return () => {
      if (objUrlRef.current && typeof URL.revokeObjectURL === "function") {
        try { URL.revokeObjectURL(objUrlRef.current); } catch { /* ignore */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setAudioLiveState({ playback: null });
    };
  }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count strokes in this notebook synced to the active recording or selected clip
  useEffect(() => {
    let alive = true;
    const updateCount = () => {
      if (!trackedClipId) {
        if (alive) setSyncedCount(0);
        return;
      }
      void countSyncedStrokesForClip(notebookId, trackedClipId).then((n) => {
        if (alive) setSyncedCount(n);
      });
    };
    updateCount();
    const unsub = onPageChanged(() => updateCount());
    return () => {
      alive = false;
      unsub();
    };
  }, [notebookId, trackedClipId, clips.length]);

  // Load selected audio clip blob into HTMLAudioElement
  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setAudioLiveState({ playback: null });
      return;
    }
    const meta = clips.find((c) => c.id === selectedId);
    if (meta?.transcript) setTranscriptOpen(true);
    void getAudioClipBlob(selectedId).then((blob) => {
      if (!alive || !blob) return;
      if (objUrlRef.current && typeof URL.revokeObjectURL === "function") {
        try { URL.revokeObjectURL(objUrlRef.current); } catch { /* ignore */ }
      }
      let url = "";
      if (typeof URL.createObjectURL === "function") {
        try { url = URL.createObjectURL(blob); } catch { url = ""; }
      }
      objUrlRef.current = url;
      if (audioElRef.current && url) {
        audioElRef.current.src = url;
        audioElRef.current.playbackRate = speed;
      }
      setElapsedMs(0);
      setAudioLiveState({
        playback: {
          notebookId,
          clipId: selectedId,
          currentMs: 0,
          durationMs: meta?.durationMs,
          playing: false,
          inkReplay,
          tapToSeek,
        },
      });
    });
    return () => { alive = false; };
  }, [selectedId, notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync inkReplay / tapToSeek flags into live state
  useEffect(() => {
    const pb = getAudioLiveState().playback;
    if (pb && pb.clipId === selectedId) {
      setAudioLiveState({ playback: { ...pb, durationMs: activeClip?.durationMs ?? pb.durationMs, inkReplay, tapToSeek } });
    }
  }, [inkReplay, tapToSeek, activeClip?.durationMs, selectedId]);

  const seekToMs = (clipId: string, offsetMs: number, autoPlay = true) => {
    const clamped = Math.max(0, offsetMs);
    if (clipId !== selectedId) setSelectedId(clipId);
    setTimeout(() => {
      const el = audioElRef.current;
      const dur = clips.find((c) => c.id === clipId)?.durationMs;
      if (el) {
        try { el.currentTime = clamped / 1000; } catch { /* jsdom */ }
        if (autoPlay) void el.play().catch(() => { /* autoplay guard */ });
      }
      setElapsedMs(clamped);
      setAudioLiveState({
        playback: {
          notebookId,
          clipId,
          currentMs: clamped,
          durationMs: dur,
          playing: autoPlay,
          inkReplay,
          tapToSeek,
        },
      });
    }, clipId === selectedId ? 0 : 80);
  };

  // Listen to Tap-to-Seek events from InkLayer
  useEffect(() => onAudioSeekRequest((clipId, offsetMs) => {
    seekToMs(clipId, offsetMs, true);
  }), [selectedId, notebookId, inkReplay, tapToSeek, clips]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live timer while recording
  useEffect(() => {
    const rec = live.recording;
    if (!rec || rec.paused) return;
    const t = window.setInterval(() => {
      setElapsedMs(rec.accumulatedMs + (Date.now() - rec.startedAt));
    }, 150);
    return () => clearInterval(t);
  }, [live.recording]);

  // Smooth 40ms playhead updates during audio playback for point-by-point Ink Replay
  useEffect(() => {
    const pb = live.playback;
    if (!pb?.playing) return;
    const t = window.setInterval(() => {
      const el = audioElRef.current;
      if (!el) return;
      const ms = Math.round(el.currentTime * 1000);
      setElapsedMs(ms);
      setAudioLiveState({
        playback: {
          notebookId,
          clipId: pb.clipId,
          currentMs: ms,
          durationMs: activeClip?.durationMs,
          playing: !el.paused,
          inkReplay,
          tapToSeek,
        },
      });
    }, 40);
    return () => clearInterval(t);
  }, [live.playback?.playing, live.playback?.clipId, notebookId, activeClip?.durationMs, inkReplay, tapToSeek]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Microphone recording is not available in this browser. You can import an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const clipId = newId();
      const startedAt = Date.now();
      activeClipIdRef.current = clipId;
      recStartedAtRef.current = startedAt;
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        // Read live external store state (NOT stale React closure!) so real duration is preserved
        const curRec = getAudioLiveState().recording;
        const dur = curRec
          ? curRec.accumulatedMs + (curRec.paused ? 0 : Math.max(0, Date.now() - curRec.startedAt))
          : Math.max(500, Date.now() - recStartedAtRef.current);
        setAudioLiveState({ recording: null });
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const saved = await saveAudioClip(notebookId, blob, { id: clipId, durationMs: Math.max(500, dur) });
        const synced = await countSyncedStrokesForClip(notebookId, saved.id);
        await refreshClips(saved.id);
        setSyncedCount(synced);
        toast(`Saved "${saved.title}" (${fmtTime(saved.durationMs)}) · ${synced} ${synced === 1 ? "stroke" : "strokes"} synced`);
      };
      rec.start(250);
      setElapsedMs(0);
      setAudioLiveState({
        playback: null,
        recording: { notebookId, clipId, startedAt, accumulatedMs: 0, paused: false },
      });
    } catch {
      toast("Microphone permission denied or unavailable.");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const togglePlay = async () => {
    const el = audioElRef.current;
    if (!el || !selectedId) return;
    if (el.paused) {
      el.playbackRate = speed;
      try { await el.play(); } catch { /* ignore */ }
      setAudioLiveState({
        playback: {
          notebookId,
          clipId: selectedId,
          currentMs: Math.round(el.currentTime * 1000),
          durationMs: activeClip?.durationMs,
          playing: true,
          inkReplay,
          tapToSeek,
        },
      });
    } else {
      el.pause();
      setAudioLiveState({
        playback: {
          notebookId,
          clipId: selectedId,
          currentMs: Math.round(el.currentTime * 1000),
          durationMs: activeClip?.durationMs,
          playing: false,
          inkReplay,
          tapToSeek,
        },
      });
    }
  };

  const handleTranscribeClip = async () => {
    if (!selectedId) return;
    const blob = await getAudioClipBlob(selectedId);
    if (!blob) {
      toast("Audio clip data not found.");
      return;
    }
    const useSarvam = prefs.lectureEngine === "sarvam";
    setTranscribing(useSarvam ? "Transcribing with Sarvam AI..." : "Preparing audio...");
    try {
      const res = useSarvam
        ? await transcribeWithSarvam(blob, {
          languageCode: prefs.languageCode,
          mode: prefs.mode,
          onProgress: (done, total) => {
            if (total > 1) setTranscribing(`Sarvam AI ${Math.min(done + 1, total)}/${total}...`);
          },
        })
        // default: free, private, offline after the first model download
        : await transcribeWithWhisper(blob, { languageCode: prefs.languageCode, onStatus: setTranscribing });
      await updateAudioClipMeta(notebookId, selectedId, {
        transcript: res.transcript || "(No speech detected)",
        languageCode: res.languageCode,
        transcriptSegments: res.segments,
      });
      await refreshClips(selectedId);
      setTranscriptOpen(true);
      toast(useSarvam ? "Lecture transcribed with Sarvam AI (saaras:v3)" : "Lecture transcribed on this device (Whisper)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(msg, onOpenSpeechSettings ? { label: "Set Key", run: onOpenSpeechSettings } : undefined);
    } finally {
      setTranscribing(null);
    }
  };

  return (
    <div className="audio-bar-wrap">
      <div className="audio-bar" role="region" aria-label="Lecture audio sync">
        <audio
          ref={audioElRef}
          onLoadedMetadata={(e) => {
            const durSec = e.currentTarget.duration;
            if (selectedId && Number.isFinite(durSec) && durSec > 0.5) {
              const realMs = Math.round(durSec * 1000);
              if (activeClip && Math.abs(activeClip.durationMs - realMs) > 1200) {
                void updateAudioClipMeta(notebookId, selectedId, { durationMs: realMs }).then(() => refreshClips(selectedId));
              }
            }
          }}
          onEnded={() => {
            if (!selectedId) return;
            const dur = activeClip?.durationMs ?? elapsedMs;
            setElapsedMs(dur);
            setAudioLiveState({
              playback: {
                notebookId,
                clipId: selectedId,
                currentMs: dur,
                durationMs: dur,
                playing: false,
                inkReplay,
                tapToSeek,
              },
            });
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const saved = await saveAudioClip(notebookId, f, {
              title: f.name.replace(/\.[^.]+$/, ""),
              durationMs: 60_000,
            });
            await refreshClips(saved.id);
            toast(`Imported "${saved.title}"`);
          }}
        />

        {!isRec ? (
          <button type="button" className="btn primary" aria-label="Record lecture audio" onClick={startRecording}>
            <Mic {...I} />Record
          </button>
        ) : (
          <>
            <button type="button" className="btn danger" aria-label="Stop recording" onClick={stopRecording}>
              <Square {...I} />Stop · <span className="mono">{fmtTime(elapsedMs)}</span>
            </button>
            <span className="audio-sync-pill mono" title="Handwritten strokes timestamp-synced to this recording">
              ● {syncedCount} synced
            </span>
          </>
        )}

        <button type="button" className="btn ghost icon" aria-label="Import audio file" title="Import lecture audio file"
          disabled={isRec} onClick={() => fileInputRef.current?.click()}>
          <Upload {...I} />
        </button>

        {clips.length > 0 && !isRec && (
          <>
            <span className="sep" />
            <Volume2 {...I} className="dim" />
            <select
              aria-label="Audio recording"
              className="select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}>
              {clips.map((c) => (
                <option key={c.id} value={c.id}>{c.title} ({fmtTime(c.durationMs)})</option>
              ))}
            </select>

            <span className="audio-sync-pill mono" title="Strokes linked to this recording">
              {syncedCount} synced
            </span>

            <button type="button" className="btn ghost icon" aria-label={isPlaying ? "Pause audio" : "Play audio"} onClick={togglePlay}>
              {isPlaying ? <Pause {...I} /> : <Play {...I} />}
            </button>

            <input
              type="range"
              aria-label="Seek audio"
              min={0}
              max={Math.max(1000, activeClip?.durationMs ?? 60_000)}
              value={Math.min(elapsedMs, Math.max(1000, activeClip?.durationMs ?? 60_000))}
              onChange={(e) => {
                const ms = Number(e.target.value);
                setElapsedMs(ms);
                if (audioElRef.current) {
                  try { audioElRef.current.currentTime = ms / 1000; } catch { /* ignore */ }
                }
                if (selectedId) {
                  setAudioLiveState({
                    playback: {
                      notebookId,
                      clipId: selectedId,
                      currentMs: ms,
                      durationMs: activeClip?.durationMs,
                      playing: isPlaying,
                      inkReplay,
                      tapToSeek,
                    },
                  });
                }
              }}
              style={{ width: 120 }}
            />
            <span className="mono small dim">{fmtTime(elapsedMs)} / {fmtTime(activeClip?.durationMs ?? 0)}</span>

            <select
              aria-label="Playback speed"
              className="select"
              value={String(speed)}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSpeed(next);
                if (audioElRef.current) audioElRef.current.playbackRate = next;
              }}>
              {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={String(r)}>{r}x</option>)}
            </select>

            <button
              type="button"
              className={`btn ghost ${inkReplay ? "active" : ""}`}
              aria-label="Ink replay"
              aria-pressed={inkReplay}
              title="Animate synced ink strokes point-by-point in time with the lecture audio"
              onClick={() => setInkReplay((v) => !v)}>
              <Sparkles {...I} />Ink Replay
            </button>

            <button
              type="button"
              className={`btn ghost ${tapToSeek ? "active" : ""}`}
              aria-label="Tap ink to seek"
              aria-pressed={tapToSeek}
              title="Tap any handwritten stroke on the page to jump the audio there"
              onClick={() => setTapToSeek((v) => !v)}>
              <Wand2 {...I} />Tap-to-Seek
            </button>

            <button
              type="button"
              className={`btn ghost ${transcriptOpen ? "active" : ""}`}
              aria-label="Transcribe lecture"
              disabled={Boolean(transcribing)}
              title="Transcribe lecture audio into clickable synced notes with Sarvam AI (saaras:v3)"
              onClick={() => {
                if (activeClip?.transcript && !transcriptOpen) {
                  setTranscriptOpen(true);
                  return;
                }
                void handleTranscribeClip();
              }}>
              <AudioLines {...I} />
              {transcribing ? transcribing : activeClip?.transcript ? "Transcript" : "Transcribe"}
            </button>

            <button
              type="button"
              className="btn ghost icon"
              aria-label="Delete recording"
              title="Delete selected recording"
              onClick={async () => {
                if (!selectedId) return;
                await deleteAudioClip(notebookId, selectedId);
                await refreshClips();
              }}>
              <Trash2 {...I} />
            </button>
          </>
        )}

        {clips.length === 0 && !isRec && (
          <span className="dim small">Record voice while taking notes — every stroke syncs to the audio timeline.</span>
        )}

        <button type="button" className="btn ghost icon" style={{ marginLeft: "auto" }} aria-label="Close audio bar" onClick={() => {
          if (audioElRef.current) audioElRef.current.pause();
          setAudioLiveState({ playback: null });
          onClose();
        }}>
          <X {...I} />
        </button>
      </div>

      {transcriptOpen && activeClip?.transcript && !isRec && (
        <div className="audio-transcript-drawer" role="region" aria-label="Synced lecture transcript">
          <div className="audio-transcript-head">
            <span className="small">
              <FileText size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
              <strong>Synced Lecture Transcript</strong>
              {activeClip.languageCode && <span className="mono dim" style={{ marginLeft: 6 }}>({activeClip.languageCode})</span>}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className="btn ghost small"
                disabled={Boolean(transcribing)}
                onClick={() => void handleTranscribeClip()}>
                Re-transcribe
              </button>
              <button
                type="button"
                className="btn small"
                aria-label="Insert transcript on page"
                onClick={async () => {
                  if (!activeClip.transcript) return;
                  await insertTranscriptIntoNotebookPage(notebookId, currentPage, activeClip.transcript, false);
                  toast("Inserted lecture transcript onto page");
                }}>
                <Type size={13} />Insert on Page
              </button>
              <button type="button" className="btn ghost icon" aria-label="Hide transcript" onClick={() => setTranscriptOpen(false)}>
                <X size={13} />
              </button>
            </div>
          </div>
          <div className="audio-transcript-body">
            {activeClip.transcriptSegments && activeClip.transcriptSegments.length > 0 ? (
              activeClip.transcriptSegments.map((seg, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="audio-seg-chip"
                  title="Click to jump audio & Ink Replay to this timestamp"
                  onClick={() => seekToMs(activeClip.id, seg.offsetMs, true)}>
                  <span className="mono audio-seg-time">{fmtTime(seg.offsetMs)}</span>
                  <span>{seg.text}</span>
                </button>
              ))
            ) : (
              <p className="small" style={{ margin: 0 }}>{activeClip.transcript}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
