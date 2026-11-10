import { useEffect, useState } from "react";
import { getBlob } from "../ink/objects";

/** Object URL for a stored blob; null while loading or if the stored data cannot be shown (never throws). */
export function useBlobUrl(blobId?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    if (!blobId) { setUrl(null); return; }
    getBlob(blobId)
      .then((b) => {
        if (!b || !alive) return;
        try { made = URL.createObjectURL(b); setUrl(made); } catch { setUrl(null); }
      })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [blobId]);
  return url;
}
