import { useEffect, useState, type FormEvent } from "react";
import { Lock, LockOpen } from "lucide-react";
import type { Notebook } from "../store/schema";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";
import { lockNotebook, MIN_PASSWORD, unlockNotebook } from "../store/lock";
import { navigate } from "../App";

const I = { size: 14, strokeWidth: 1.5 } as const;

/** Set a password and lock (encrypt) a notebook. */
export function LockSheet({ notebook, onClose }: { notebook: Notebook | null; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setPw(""); setAgain(""); setErr(""); setBusy(false); }, [notebook?.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!notebook || busy) return;
    if (pw.length < MIN_PASSWORD) { setErr(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (pw !== again) { setErr("The two passwords don't match."); return; }
    setBusy(true);
    try {
      await lockNotebook(notebook.id, pw);
      toast(`"${notebook.title}" is locked`);
      onClose();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); setBusy(false); }
  };

  return (
    <Sheet open={!!notebook} onClose={onClose} title="Lock with a password" width={440}>
      <form className="lock-form" onSubmit={(e) => void submit(e)}>
        <p className="dim small" style={{ margin: 0 }}>
          The notebook is encrypted on this device and only opens with this password. It still syncs and backs up, encrypted.
          <strong> There is no way to recover a forgotten password.</strong>
        </p>
        <label className="small" htmlFor="lock-pw">Password</label>
        <input id="lock-pw" className="input" type="password" autoComplete="new-password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} />
        <label className="small" htmlFor="lock-pw2">Type it again</label>
        <input id="lock-pw2" className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => { setAgain(e.target.value); setErr(""); }} />
        {err && <p className="small" role="alert" style={{ margin: 0, color: "var(--danger)" }}>{err}</p>}
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy || !pw}><Lock {...I} />{busy ? "Locking…" : "Lock"}</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Shown instead of the pages when a locked notebook is opened. */
export function UnlockScreen({ notebook }: { notebook: Notebook }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true); setErr("");
    try { await unlockNotebook(notebook.id, pw); toast("Unlocked"); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)); setBusy(false); }
  };
  return (
    <main className="nb-locked">
      <Lock size={28} strokeWidth={1.5} aria-hidden />
      <h2>&ldquo;{notebook.title}&rdquo; is locked</h2>
      <form className="lock-form" onSubmit={(e) => void submit(e)}>
        <label className="small" htmlFor="unlock-pw">Password</label>
        <input id="unlock-pw" className="input" type="password" autoComplete="current-password" autoFocus value={pw}
          onChange={(e) => { setPw(e.target.value); setErr(""); }} />
        {err && <p className="small" role="alert" style={{ margin: 0, color: "var(--danger)" }}>{err}</p>}
        <div className="row-end">
          <button type="button" className="btn" onClick={() => navigate("/")}>Back to library</button>
          <button type="submit" className="btn primary" disabled={busy || !pw}><LockOpen {...I} />{busy ? "Unlocking…" : "Unlock"}</button>
        </div>
      </form>
    </main>
  );
}
