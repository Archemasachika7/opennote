import { useEffect, useState, type FormEvent } from "react";
import { Cloud, Database, KeyRound, Lock, RefreshCw, Send } from "lucide-react";
import { toast } from "./Toast";
import {
  connectPinata, connectTelegram, disconnectStorage, linkTelegramChat, lockSync, syncNow, unlockSync, useSyncStatus,
} from "../sync/run";

const I = { size: 14, strokeWidth: 1.5 } as const;

function ago(t: number | null): string {
  if (!t) return "not yet";
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (err) { toast(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return { busy, run };
}

export function SyncPanel() {
  const s = useSyncStatus();
  const { busy, run } = useBusy();
  const [pass, setPass] = useState("");
  const [token, setToken] = useState("");
  const [jwt, setJwt] = useState("");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  if (s.state === "off" || s.state === "locked") {
    const submit = (e: FormEvent) => { e.preventDefault(); if (pass && !busy) void run(async () => { await unlockSync(pass); setPass(""); }); };
    return (
      <form className="acct-form sync-panel" onSubmit={submit} aria-label="Sync">
        <h4 className="sync-h"><KeyRound {...I} />Sync passphrase</h4>
        <p className="dim small acct-lede">
          Everything is encrypted on this device before upload. First time on this account? This sets it.
          It can't be reset: lose it and the cloud copy can't be read (notes on your devices stay safe).
        </p>
        <label className="small" htmlFor="sync-pass">Passphrase</label>
        <input id="sync-pass" className="input acct-wide" type="password" autoComplete="current-password"
          value={pass} onChange={(e) => setPass(e.target.value)} />
        <button type="submit" className="btn primary acct-wide" disabled={!pass || busy}>Unlock sync</button>
      </form>
    );
  }

  const dot = s.state === "syncing" ? "busy" : s.state === "error" ? "bad" : "good";
  return (
    <section className="acct-form sync-panel" aria-label="Sync">
      <div className="sync-status" role="status">
        <span className={`sync-dot ${dot}`} aria-hidden />
        <span>{s.state === "syncing" ? "Syncing..." : `Synced ${ago(s.lastSyncedAt)}`}</span>
      </div>
      {s.message && <p className={`small sync-msg${s.storageFull ? " warn" : ""}`}>{s.message}</p>}
      <div className="acct-row">
        <button type="button" className="btn" disabled={busy || s.state === "syncing"} onClick={() => void run(syncNow)}>
          <RefreshCw {...I} />Sync now
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(lockSync)}><Lock {...I} />Lock</button>
      </div>

      <h4 className="sync-h">Storage</h4>
      <ol className="sync-tiers">
        <li><Database {...I} /><span><strong>OpenNote cloud</strong><span className="dim small">first 50 MB, always on</span></span></li>
        <li>
          <Send {...I} />
          <span className="sync-tier-body">
            <strong>Your Telegram bot</strong>
            <span className="dim small">no total limit, used after 50 MB</span>
            {!s.telegram && (
              <span className="sync-inline">
                <input className="input" aria-label="Telegram bot token" placeholder="Token from @BotFather" type="password"
                  value={token} onChange={(e) => setToken(e.target.value)} />
                <button type="button" className="btn" disabled={!token || busy}
                  onClick={() => void run(async () => { const u = await connectTelegram(token); setToken(""); toast(`Connected @${u}. Now send /start to it.`); })}>
                  Connect
                </button>
                <a className="small" href="https://t.me/BotFather" target="_blank" rel="noreferrer">Make a bot</a>
              </span>
            )}
            {s.telegram && !s.telegram.linked && (
              <span className="sync-inline">
                <a className="btn" href={`https://t.me/${s.telegram.username}`} target="_blank" rel="noreferrer">Open @{s.telegram.username}, send /start</a>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void run(linkTelegramChat)}>I sent /start</button>
              </span>
            )}
            {s.telegram?.linked && (
              <span className="sync-inline">
                <span className="small">Connected @{s.telegram.username}</span>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => disconnectStorage("telegram"))}>Disconnect</button>
              </span>
            )}
          </span>
        </li>
        <li>
          <Cloud {...I} />
          <span className="sync-tier-body">
            <strong>IPFS (Pinata)</strong>
            <span className="dim small">free 1 GB, used if Telegram can't</span>
            {!s.pinata ? (
              <span className="sync-inline">
                <input className="input" aria-label="Pinata JWT" placeholder="Pinata API JWT" type="password"
                  value={jwt} onChange={(e) => setJwt(e.target.value)} />
                <button type="button" className="btn" disabled={!jwt || busy}
                  onClick={() => void run(async () => { await connectPinata(jwt); setJwt(""); })}>Save</button>
                <a className="small" href="https://app.pinata.cloud/developers/api-keys" target="_blank" rel="noreferrer">Get a key</a>
              </span>
            ) : (
              <span className="sync-inline">
                <span className="small">Connected</span>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => disconnectStorage("pinata"))}>Disconnect</button>
              </span>
            )}
          </span>
        </li>
      </ol>
      <p className="dim small" style={{ margin: 0 }}>Tokens and keys stay on this device. Storage only ever sees encrypted data.</p>
    </section>
  );
}
