"use client";
import { useState } from "react";
import { Play, X } from "lucide-react";
import type { PageObject } from "../store/schema";
import { useBlobUrl } from "../ui/useBlobUrl";
import { BASE_LAYER } from "./layers";
import { formatDuration } from "./video";

function Player({ o, scale, origin, onClose }: { o: PageObject; scale: number; origin: { x: number; y: number }; onClose: () => void }) {
  const url = useBlobUrl(o.video?.blobId);
  return (
    <div className="video-live" style={{ left: (o.x - origin.x) * scale, top: (o.y - origin.y) * scale, width: o.w * scale, height: o.h * scale,
      transform: `rotate(${o.rotation}deg)` }}>
      {url && <video src={url} controls autoPlay playsInline onEnded={onClose} aria-label="Video" />}
      <button type="button" className="btn icon video-close" aria-label="Close video" onClick={onClose}><X size={16} strokeWidth={1.75} /></button>
    </div>
  );
}

/**
 * Sits above the ink, like tape: a play button on each video (the picture under it is its poster frame). Only the
 * button takes touches, so the pen still writes over the rest of the video; while playing, the player takes the box.
 */
export function VideoLayer({ objects, scale, origin = { x: 0, y: 0 }, hidden }: {
  objects: PageObject[]; scale: number; origin?: { x: number; y: number }; hidden?: Set<string>;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const videos = objects.filter((o) => o.video && !hidden?.has(o.layerId ?? BASE_LAYER));
  if (videos.length === 0) return null;
  return (
    <div className="video-layer" data-testid="video-layer">
      {videos.map((o) => playing === o.id
        ? <Player key={o.id} o={o} scale={scale} origin={origin} onClose={() => setPlaying(null)} />
        : (
          <button key={o.id} type="button" className="video-play" aria-label={`Play video${o.video?.duration ? ` (${formatDuration(o.video.duration)})` : ""}`}
            onClick={() => setPlaying(o.id)}
            style={{ left: (o.x - origin.x + o.w / 2) * scale, top: (o.y - origin.y + o.h / 2) * scale }}>
            <Play size={22} strokeWidth={1.75} fill="currentColor" />
            {o.video?.duration ? <span className="mono">{formatDuration(o.video.duration)}</span> : null}
          </button>
        ))}
    </div>
  );
}
