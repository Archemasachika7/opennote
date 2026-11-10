import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

export type AuthStatus = "disabled" | "signed-out" | "code-sent" | "signed-in";
export interface AuthUser { id: string; email: string }
export interface AuthState { status: AuthStatus; user: AuthUser | null; email?: string }

/** Android deep link registered in AndroidManifest.xml. */
export const NATIVE_REDIRECT = "app.opennote.notes://auth-callback";
const WEB_CALLBACK = "/auth/callback";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (email: string): boolean => EMAIL_RE.test(email.trim());
/** Boxes shown for the email code. Supabase lets a project send 6 to 10 digits; this one sends 8. */
export const OTP_LENGTH = Number(import.meta.env.VITE_SUPABASE_OTP_LENGTH) || 8;
export const isValidCode = (code: string): boolean => /^\d{6,10}$/.test(code.trim());

let state: AuthState = { status: supabase ? "signed-out" : "disabled", user: null };
const subs = new Set<() => void>();
function set(next: AuthState): void { state = next; subs.forEach((f) => f()); }

export function getAuthState(): AuthState { return state; }
export function onAuthChange(cb: (s: AuthState) => void): () => void {
  const f = () => cb(state);
  subs.add(f);
  return () => { subs.delete(f); };
}
export function useAuth(): AuthState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getAuthState);
}

function client() {
  if (!supabase) throw new Error("Sign-in is not available in this build.");
  return supabase;
}

const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? "" } : null;

let started = false;
/** Restore a saved session and follow Supabase auth events. Safe to call more than once. */
export async function initAuth(): Promise<void> {
  if (!supabase || started) return;
  started = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = toUser(session?.user);
    if (user) set({ status: "signed-in", user });
    // a pending code survives token refresh noise; only a real sign-out clears it
    else if (state.status !== "code-sent") set({ status: "signed-out", user: null });
  });
  const { data } = await supabase.auth.getSession();
  const user = toUser(data.session?.user);
  if (user) set({ status: "signed-in", user });
  // back from Google on the web: leave the callback path for the library
  if (typeof location !== "undefined" && location.pathname === WEB_CALLBACK) {
    history.replaceState(null, "", "/#/library");
  }
  if (Capacitor.isNativePlatform()) void listenForNativeRedirect();
}

export async function sendCode(email: string): Promise<void> {
  const c = client();
  const clean = email.trim();
  if (!isValidEmail(clean)) throw new Error("Enter a valid email address.");
  const { error } = await c.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
  if (error) throw new Error(error.message);
  set({ status: "code-sent", user: null, email: clean });
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const c = client();
  if (!isValidCode(code)) throw new Error("Enter the code from the email.");
  const { data, error } = await c.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
  if (error) throw new Error(error.message);
  const user = toUser(data.user);
  if (!user) throw new Error("Sign-in failed. Try a new code.");
  set({ status: "signed-in", user });
}

/** Back to the email step without signing anything out. */
export function restartSignIn(): void {
  if (state.status === "code-sent") set({ status: "signed-out", user: null });
}

/** Google is offered on the web and Android only (Windows uses the email code).
 *  The Windows app is Tauri, which Capacitor reports as plain "web", so it is detected on its own:
 *  a Google redirect there would land on Tauri's local origin and never return to the app. */
export const googleAvailable = (g: { __TAURI_INTERNALS__?: unknown } = globalThis as { __TAURI_INTERNALS__?: unknown }): boolean =>
  !!supabase && !g.__TAURI_INTERNALS__ && (!Capacitor.isNativePlatform() || Capacitor.getPlatform() === "android");

export async function signInWithGoogle(): Promise<void> {
  const c = client();
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await c.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw new Error(error.message);
    if (!data.url) throw new Error("Google sign-in is not set up yet.");
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url });
    return;
  }
  const { error } = await c.auth.signInWithOAuth({
    provider: "google", options: { redirectTo: `${location.origin}${WEB_CALLBACK}` },
  });
  if (error) throw new Error(error.message);
}

async function listenForNativeRedirect(): Promise<void> {
  const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
  await App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(NATIVE_REDIRECT)) return;
    const code = new URL(url).searchParams.get("code");
    try {
      if (code) {
        const { error } = await client().auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
    } finally {
      await Browser.close().catch(() => { /* already closed */ });
    }
  });
}

export async function signOut(): Promise<void> {
  const c = client();
  const { error } = await c.auth.signOut();
  if (error) throw new Error(error.message);
  set({ status: "signed-out", user: null });
}
