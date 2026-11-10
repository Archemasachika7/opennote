import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LogOut, Mail } from "lucide-react";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { useSafeMotion } from "./motion";
import {
  googleAvailable, isValidCode, isValidEmail, restartSignIn, sendCode, signInWithGoogle, signOut, useAuth, verifyCode,
} from "../sync/auth";

const I = { size: 14, strokeWidth: 1.5 } as const;

function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (err) { toast(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return { busy, run };
}

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const safe = useSafeMotion();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const { busy, run } = useAction();

  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email) || busy) return;
    void run(async () => { await sendCode(email); setCode(""); });
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCode(code) || busy) return;
    void run(() => verifyCode(auth.email ?? email, code));
  };

  const step = auth.status === "signed-in" ? "account" : auth.status === "code-sent" ? "code" : "email";

  return (
    <Sheet open={open} onClose={onClose} title="Account" width={420}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} className="settings-stack" initial={safe.initial} animate={safe.animate} exit={safe.exit} transition={safe.transition}>
          {step === "email" && (
            <form className="settings-group" onSubmit={submitEmail}>
              <p className="dim small" style={{ margin: 0 }}>
                Optional. Sign in to sync and share later. Your notes stay on this device.
              </p>
              <label className="small" htmlFor="account-email">Email</label>
              <input id="account-email" className="input" type="email" autoComplete="email" inputMode="email"
                placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" className="btn primary" disabled={!isValidEmail(email) || busy}>
                <Mail {...I} />Send code
              </button>
              {googleAvailable() && (
                <button type="button" className="btn" disabled={busy} onClick={() => void run(signInWithGoogle)}>
                  Continue with Google
                </button>
              )}
            </form>
          )}

          {step === "code" && (
            <form className="settings-group" onSubmit={submitCode}>
              <p className="dim small" style={{ margin: 0 }}>
                We sent a code to <strong>{auth.email}</strong>. It can take a minute.
              </p>
              <label className="small" htmlFor="account-code">6-digit code</label>
              <input id="account-code" className="input mono" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="123456" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <button type="submit" className="btn primary" disabled={!isValidCode(code) || busy}>Sign in</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={restartSignIn}>Use a different email</button>
            </form>
          )}

          {step === "account" && auth.user && (
            <section className="settings-group">
              <span className="dim small">Signed in as</span>
              <strong>{auth.user.email}</strong>
              <p className="dim small" style={{ margin: 0 }}>Sync: coming soon.</p>
              <button type="button" className="btn" disabled={busy} onClick={() => void run(signOut)}>
                <LogOut {...I} />Sign out
              </button>
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}
