import { useSyncExternalStore } from "react";

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
  return (
    <div className="toast-host" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id} role="status">
          <span>{t.msg}</span>
          {t.action && (
            <button className="btn primary" onClick={() => { t.action?.run(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
