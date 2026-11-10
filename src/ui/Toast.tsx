"use client";
import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "./motion";

type ToastAction = { label: string; run(): void };
type ToastItem = { id: number; msg: string; action?: ToastAction; duration: number; timer?: ReturnType<typeof setTimeout> };
let items: ToastItem[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function armTimer(item: ToastItem): void {
  if (item.timer) clearTimeout(item.timer);
  item.timer = setTimeout(() => dismiss(item.id), item.duration);
}

export function dismiss(id: number): void {
  const found = items.find((t) => t.id === id);
  if (found?.timer) clearTimeout(found.timer);
  items = items.filter((t) => t.id !== id);
  emit();
}

function pauseToast(id: number): void {
  const found = items.find((t) => t.id === id);
  if (found?.timer) { clearTimeout(found.timer); found.timer = undefined; }
}

function resumeToast(id: number): void {
  const found = items.find((t) => t.id === id);
  if (found) armTimer(found);
}

export function toast(msg: string, action?: ToastAction): void {
  const id = ++seq;
  const item: ToastItem = { id, msg, action, duration: action ? 8000 : 3500 };
  items = [...items.slice(-3), item];
  armTimer(item);
  emit();
}

export function ToastHost() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => items);
  const safe = useSafeMotion(motionTokens.distance.md);
  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence mode="sync" initial={false}>
        {list.map((t) => (
          <motion.div className="toast" key={t.id} role="status"
            onPointerEnter={() => pauseToast(t.id)} onPointerLeave={() => resumeToast(t.id)}
            onFocus={() => pauseToast(t.id)} onBlur={() => resumeToast(t.id)}
            initial={{ ...safe.initial, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
            animate={{ ...safe.animate, scale: 1 }}
            exit={{ opacity: 0, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
            transition={safe.reduce ? safe.transition : springs.snappy}>
            <span className="toast-msg">{t.msg}</span>
            {t.action && (
              <button className="btn primary" onClick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button>
            )}
            <button className="btn ghost icon toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <X size={14} strokeWidth={1.5} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
