import { FileCode2, FileText, FileUp, PenLine, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Sheet } from "../ui/Sheet";

export type InsertKind = "ink" | "text" | "live" | "pdf" | "file";

type Option = { kind: InsertKind; title: string; hint: string; icon: ReactNode };
const IC = { size: 20, strokeWidth: 1.5 } as const;
const OPTIONS: Option[] = [
  { kind: "ink", title: "Ink page", hint: "Write and draw with a pen, finger or mouse", icon: <PenLine {...IC} /> },
  { kind: "text", title: "Text page", hint: "Type notes with headings, lists, tables and math", icon: <FileText {...IC} /> },
  { kind: "live", title: "Live page", hint: "Paste an AI artifact (HTML, React or SVG) that runs on the page", icon: <Sparkles {...IC} color="var(--live)" /> },
  { kind: "file", title: "Upload SVG or HTML", hint: "Open a .svg or .html file from your device as a live page", icon: <FileCode2 {...IC} /> },
  { kind: "pdf", title: "PDF pages", hint: "Import every page of a PDF to write on", icon: <FileUp {...IC} /> },
];

/**
 * "Add a page" picker: a roomy sheet of large cards (a bottom sheet on phones) instead of a tight
 * dropdown in the sidebar, so every page type and what it is for is readable at a glance.
 */
export function InsertMenu({ open = true, position, onPick, onClose }: {
  open?: boolean; position?: number; onPick: (k: InsertKind) => void; onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={position ? `Add a page at position ${position}` : "Add a page"} width={560}>
      <div className="insert-grid" role="menu" aria-label="Page type">
        {OPTIONS.map((o) => (
          <button key={o.kind} type="button" role="menuitem" aria-label={o.title} className={`insert-card kind-${o.kind}`}
            onClick={() => { onPick(o.kind); onClose(); }}>
            <span className="insert-icon" aria-hidden>{o.icon}</span>
            <span className="insert-text">
              <span className="insert-title">{o.title}</span>
              <span className="insert-hint">{o.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
