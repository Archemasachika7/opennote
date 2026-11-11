// A tiny signal for Blot: the app calls blotReact() at real moments; Blot listens. Nothing else depends on it.
export type BlotMood = "hop" | "cheer" | "peek" | "wave" | "fly" | "spin" | "bounce";
const listeners = new Set<(m: BlotMood) => void>();

export function blotReact(mood: BlotMood): void { listeners.forEach((f) => f(mood)); }
export function onBlot(fn: (m: BlotMood) => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
