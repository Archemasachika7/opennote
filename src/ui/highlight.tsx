import type { ReactNode } from "react";

/** Split text around case-insensitive matches of `query` and wrap matches in <mark>. */
export function highlightText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  if (parts.length <= 1) return text;
  const ql = q.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === ql ? <mark key={i} className="hit-mark">{part}</mark> : part,
  );
}
