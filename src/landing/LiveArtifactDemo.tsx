import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ClipboardPaste, Play } from "lucide-react";
import { buildCsp } from "../live/srcdoc";
import { motionTokens, useSafeMotion } from "../ui/motion";

const SAMPLE = `<style>
  body { font: 14px system-ui; color: #e8e9ee; background: #1e2028; display: grid; place-items: center; height: 100vh; margin: 0; }
  .bars { display: flex; align-items: end; gap: 4px; height: 90px; }
  .bars i { width: 14px; background: #f5a524; border-radius: 3px 3px 0 0; transition: height .25s; }
  button { margin-top: 12px; padding: 6px 14px; border: 0; border-radius: 6px; background: #3ddc97; color: #121318; font-weight: 600; cursor: pointer; }
</style>
<div>
  <div class="bars" id="b"></div>
  <button onclick="step()">Bubble sort: step</button>
</div>
<script>
  const a = [7, 3, 9, 1, 6, 4, 8, 2], el = document.getElementById("b");
  let i = 0, j = 0;
  const draw = () => el.innerHTML = a.map(v => '<i style="height:' + v * 10 + 'px"></i>').join("");
  function step() {
    if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];
    if (++j >= a.length - 1 - i) { j = 0; i = (i + 1) % a.length; }
    draw();
  }
  draw();
</script>`;

/** The same lock-down as a real Live page (no network, no app access). */
export function wrapArtifact(source: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${buildCsp({ allowNetwork: false })}">`
    + `<meta charset="utf-8"></head><body>${source}</body></html>`;
}

export function LiveArtifactDemo() {
  const [code, setCode] = useState(SAMPLE);
  const [ran, setRan] = useState<{ doc: string; n: number } | null>(null);
  const safe = useSafeMotion(motionTokens.distance.md);

  return (
    <div className="lp-live">
      <div className="lp-live-pane">
        <div className="lp-live-bar mono">
          <ClipboardPaste size={13} strokeWidth={1.6} />
          <span>Pasted from Claude / ChatGPT / Gemini</span>
        </div>
        <textarea className="lp-live-code mono" aria-label="Artifact code" spellCheck={false}
          value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="button" className="btn primary lp-live-run" onClick={() => setRan({ doc: wrapArtifact(code), n: (ran?.n ?? 0) + 1 })}>
          <Play size={14} strokeWidth={1.8} />Save &amp; run
        </button>
      </div>
      <div className="lp-live-pane lp-live-out">
        <div className="lp-live-bar mono"><span className="lp-live-dot" />Live page</div>
        <AnimatePresence mode="wait">
          {ran ? (
            <motion.iframe key={ran.n} className="lp-live-frame" title="Live artifact preview"
              sandbox="allow-scripts" srcDoc={ran.doc}
              initial={safe.initial} animate={safe.animate} exit={safe.exit} transition={safe.transition} />
          ) : (
            <motion.p key="idle" className="lp-live-idle dim small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Press <strong>Save &amp; run</strong>. The code becomes a page you can use, and write on.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
