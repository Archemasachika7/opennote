"use client";
import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens, springs, useSafeMotion } from "./motion";

type ToastAction = { label: string; run(): void };
type ToastItem = { id: number; msg: string; action?: ToastAction };
let items: ToastItem[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function dismiss(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function toast(msg: string, action?: ToastAction): void {
  const id = ++seq;
  items = [...items, { id, msg, action }];
  emit();
  setTimeout(() => dismiss(id), action ? 8000 : 3500);
}

export function ToastHost() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => items);
  const safe = useSafeMotion(motionTokens.distance.md);
  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence mode="sync" initial={false}>
        {list.map((t) => (
          <motion.div className="toast" key={t.id} role="status"
            initial={{ ...safe.initial, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
            animate={{ ...safe.animate, scale: 1 }}
            exit={{ opacity: 0, scale: safe.reduce ? 1 : motionTokens.scale.subtle }}
            transition={safe.reduce ? safe.transition : springs.snappy}>
            <span>{t.msg}</span>
            {t.action && (
              <button className="btn primary" onClick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
