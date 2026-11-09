import { FileText, PenLine, Sparkles } from "lucide-react";
import { Menu } from "../ui/Menu";

export type InsertKind = "ink" | "text" | "live";

export function InsertMenu({ onPick, onClose, style }: { onPick: (k: InsertKind) => void; onClose: () => void; style?: React.CSSProperties }) {
  return (
    <Menu onClose={onClose} style={style} items={[
      { label: "Ink page", icon: <PenLine size={14} strokeWidth={1.5} />, onSelect: () => onPick("ink") },
      { label: "Text page", icon: <FileText size={14} strokeWidth={1.5} />, onSelect: () => onPick("text") },
      { label: "Live page", icon: <Sparkles size={14} strokeWidth={1.5} color="var(--live)" />, onSelect: () => onPick("live") },
    ]} />
  );
}
