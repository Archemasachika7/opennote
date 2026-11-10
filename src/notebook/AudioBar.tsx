import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Sparkles, Square, Trash2, Upload, Volume2, Wand2, X } from "lucide-react";
import { newId } from "../store/schema";
import {
  deleteAudioClip,
  getAudioClipBlob,
  listAudioClips,
  onAudioSeekRequest,
  saveAudioClip,
  setAudioLiveState,
  useAudioLiveState,
  type AudioClipMeta,
} from "../store/audio";
import { toast } from "../ui/Toast";

const I = { size: 14, strokeWidth: 1.5 } as const;

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export function AudioBar({ notebookId, onClose }: { notebookId: string; onClose: () => void }) {
  const [clips, setClips] = useState<AudioClipMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [inkReplay, setInkReplay] = useState(true);
  const [tapToSeek, setTapToSeek] = useState(false);

  const live = useAudioLiveState();
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const objUrlRef = useRef<string | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeClipIdRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setAudioLiveState({ playback: null });
    };
  }, [notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load selected audio clip blob into HTMLAudioElement
  useEffect(() => {
    let alive = true;
    if (!selectedId) {
      setAudioLiveState({ playback: null });
      return;
    }
    void getAudioClipBlob(selectedId).then((blob) => {
      if (!alive || !blob) return;
      if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
      const url = URL.createObjectURL(blob);
      objUrlRef.current = url;
      if (audioElRef.current) {
        audioElRef.current.src = url;
        audioElRef.current.playbackRate = speed;
      }
      setElapsedMs(0);
      setAudioLiveState({
        playback: { notebookId, clipId: selectedId, currentMs: 0, playing: false, inkReplay, tapToSeek },
      });
    });
    return () => { alive = false; };
  }, [selectedId, notebookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync inkReplay / tapToSeek flags into live state
  useEffect(() => {
    const pb = live.playback;
    if (pb && pb.clipId === selectedId) {
      setAudioLiveState({ playback: { ...pb, inkReplay, tapToSeek } });
    }
  }, [inkReplay, tapToSeek]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen to Tap-to-Seek events from InkLayer
  useEffect(() => onAudioSeekRequest((clipId, offsetMs) => {
    if (clipId !== selectedId) setSelectedId(clipId);
    setTimeout(() => {
      const el = audioElRef.current;
      if (!el) return;
      el.currentTime = offsetMs / 1000;
      setElapsedMs(offsetMs);
      void el.play().catch(() => { /* autoplay guard */ });
      setAudioLiveState({
        playback: { notebookId, clipId, currentMs: offsetMs, playing: true, inkReplay, tapToSeek },
      });
    }, clipId === selectedId ? 0 : 80);
  }), [selectedId, notebookId, inkReplay, tapToSeek]);

  // Live timer while recording
  useEffect(() => {
    const rec = live.recording;
    if (!rec || rec.paused) return;
    const t = window.setInterval(() => {
      setElapsedMs(rec.accumulatedMs + (Date.now() - rec.startedAt));
    }, 200);
    return () => clearInterval(t);
  }, [live.recording]);

  // Smooth playhead updates during audio playback for Ink Replay
  useEffect(() => {
    const pb = live.playback;
    if (!pb?.playing) return;
    const t = window.setInterval(() => {
      const el = audioElRef.current;
      if (!el) return;
      const ms = Math.round(el.currentTime * 1000);
      setElapsedMs(ms);
      setAudioLiveState({
        playback: { notebookId, clipId: pb.clipId, currentMs: ms, playing: !el.paused, inkReplay, tapToSeek },
      });
    }, 80);
    return () => clearInterval(t);
  }, [live.playback?.playing, live.playback?.clipId, notebookId, inkReplay, tapToSeek]);

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
      activeClipIdRef.current = clipId;
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        const curRec = live.recording;
        const dur = curRec ? curRec.accumulatedMs + (curRec.paused ? 0 : Date.now() - curRec.startedAt) : elapsedMs;
        setAudioLiveState({ recording: null });
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const saved = await saveAudioClip(notebookId, blob, { id: clipId, durationMs: Math.max(500, dur) });
        await refreshClips(saved.id);
        toast(`Saved "${saved.title}" — ink strokes synced`);
      };
      rec.start(250);
      setElapsedMs(0);
      setAudioLiveState({
        playback: null,
        recording: { notebookId, clipId, startedAt: Date.now(), accumulatedMs: 0, paused: false },
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
        playback: { notebookId, clipId: selectedId, currentMs: Math.round(el.currentTime * 1000), playing: true, inkReplay, tapToSeek },
      });
    } else {
      el.pause();
      setAudioLiveState({
        playback: { notebookId, clipId: selectedId, currentMs: Math.round(el.currentTime * 1000), playing: false, inkReplay, tapToSeek },
      });
    }
  };

  const activeClip = clips.find((c) => c.id === selectedId);
  const isRec = Boolean(live.recording && live.recording.notebookId === notebookId);
  const isPlaying = Boolean(live.playback?.playing && live.playback.clipId === selectedId);

  return (
    <div className="audio-bar" role="region" aria-label="Lecture audio sync">
      <audio
        ref={audioElRef}
        onEnded={() => {
          if (!selectedId) return;
          const dur = activeClip?.durationMs ?? elapsedMs;
          setElapsedMs(dur);
          setAudioLiveState({
            playback: { notebookId, clipId: selectedId, currentMs: dur, playing: false, inkReplay, tapToSeek },
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
        <button type="button" className="btn danger" aria-label="Stop recording" onClick={stopRecording}>
          <Square {...I} />Stop · <span className="mono">{fmtTime(elapsedMs)}</span>
        </button>
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
              if (audioElRef.current) audioElRef.current.currentTime = ms / 1000;
              if (selectedId) {
                setAudioLiveState({
                  playback: { notebookId, clipId: selectedId, currentMs: ms, playing: isPlaying, inkReplay, tapToSeek },
                });
              }
            }}
            style={{ width: 120 }}
          />
          <span className="mono small dim">{fmtTime(elapsedMs)}</span>

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
            className={`btn ghost ${inkReplay ? "on" : ""}`}
            aria-label="Ink replay"
            aria-pressed={inkReplay}
            title="Animate synced ink strokes in time with the lecture audio"
            onClick={() => setInkReplay((v) => !v)}>
            <Sparkles {...I} />Ink Replay
          </button>

          <button
            type="button"
            className={`btn ghost ${tapToSeek ? "on" : ""}`}
            aria-label="Tap ink to seek"
            aria-pressed={tapToSeek}
            title="Tap any handwritten stroke on the page to jump the audio there"
            onClick={() => setTapToSeek((v) => !v)}>
            <Wand2 {...I} />Tap-to-Seek
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
  );
}
