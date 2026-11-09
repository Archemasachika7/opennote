import { useEffect } from "react";
import { toast } from "../ui/Toast";
import { detectArtifactType } from "./detect";

/** Offer to create a live page when artifact-looking text is pasted outside editable fields. */
export function useSmartPaste(onCreate: (source: string) => void): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable=true], .sheet")) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text || !detectArtifactType(text)) return;
      e.preventDefault();
      toast("Create live page here?", { label: "Create", run: () => onCreate(text) });
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onCreate]);
}
