import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, LogOut, Mail, RotateCw } from "lucide-react";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { OtpInput } from "./OtpInput";
import { SyncPanel } from "./SyncPanel";
import { springs, useSafeMotion } from "./motion";
import {
  googleAvailable, isValidCode, isValidEmail, restartSignIn, sendCode, signInWithGoogle, signOut, useAuth, verifyCode,
} from "../sync/auth";
import "./account.css";

const I = { size: 14, strokeWidth: 1.5 } as const;
const RESEND_S = 30;

function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (err) { toast(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return { busy, run };
}

/** Seconds left before another code may be sent; restarts whenever `key` changes. */
function useCountdown(key: number) {
  const [left, setLeft] = useState(RESEND_S);
  useEffect(() => {
    setLeft(RESEND_S);
    const started = Date.now();
    const t = setInterval(() => {
      const rest = Math.max(0, RESEND_S - Math.floor((Date.now() - started) / 1000));
      setLeft(rest);
      if (rest === 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [key]);
  return left;
}

function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const safe = useSafeMotion();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [justSignedIn, setJustSignedIn] = useState(false);
  const left = useCountdown(sentAt);
  const { busy, run } = useAction();

  const send = (address: string) => run(async () => { await sendCode(address); setCode(""); setSentAt(Date.now()); });
  const submitEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email) || busy) return;
    void send(email);
  };
  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidCode(code) || busy) return;
    void run(async () => { await verifyCode(auth.email ?? email, code); setJustSignedIn(true); });
  };

  const step = auth.status === "signed-in" ? "account" : auth.status === "code-sent" ? "code" : "email";

  return (
    <Sheet open={open} onClose={onClose} title="Account" width={420}>
      <div className="acct">
        <div className="acct-steps" aria-hidden>
          {["email", "code", "account"].map((s, i) => (
            <span key={s} className={`acct-dot${["email", "code", "account"].indexOf(step) >= i ? " on" : ""}`} />
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} className="acct-panel" initial={safe.initial} animate={safe.animate} exit={safe.exit} transition={safe.transition}>
            {step === "email" && (
              <form className="acct-form" onSubmit={submitEmail}>
                <h3 className="acct-title">Sign in to OpenNote</h3>
                <p className="dim small acct-lede">Optional. Sign in to sync and share later. Your notes stay on this device.</p>
                {googleAvailable() && (
                  <>
                    <button type="button" className="btn acct-wide" disabled={busy} onClick={() => void run(signInWithGoogle)}>
                      <GoogleMark />Continue with Google
                    </button>
                    <div className="acct-or"><span>or use email</span></div>
                  </>
                )}
                <label className="small" htmlFor="account-email">Email</label>
                <input id="account-email" className="input acct-wide" type="email" autoComplete="email" inputMode="email"
                  placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" className="btn primary acct-wide" disabled={!isValidEmail(email) || busy}>
                  <Mail {...I} />Send code
                </button>
              </form>
            )}

            {step === "code" && (
              <form className="acct-form" onSubmit={submitCode}>
                <h3 className="acct-title">Check your email</h3>
                <p className="dim small acct-lede">
                  We sent a code to <strong className="acct-email">{auth.email}</strong>.
                </p>
                <OtpInput value={code} onChange={setCode} autoFocus disabled={busy} />
                <button type="submit" className="btn primary acct-wide" disabled={!isValidCode(code) || busy}>Sign in</button>
                <div className="acct-row">
                  <button type="button" className="btn ghost" disabled={busy} onClick={restartSignIn}>Use a different email</button>
                  <button type="button" className="btn ghost" disabled={busy || left > 0}
                    onClick={() => void send(auth.email ?? email)}>
                    <RotateCw {...I} />{left > 0 ? `Resend in ${left}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}

            {step === "account" && auth.user && (
              <section className="acct-form">
                <motion.div className="acct-tick" aria-hidden
                  initial={justSignedIn && !safe.reduce ? { scale: 0.4, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }} transition={springs.release}>
                  <Check size={20} strokeWidth={2} />
                </motion.div>
                <span className="dim small">Signed in as</span>
                <strong className="acct-email">{auth.user.email}</strong>
                <SyncPanel />
                <button type="button" className="btn acct-wide" disabled={busy} onClick={() => void run(signOut)}>
                  <LogOut {...I} />Sign out
                </button>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Sheet>
  );
}
