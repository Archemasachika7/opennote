export interface LiveFrameRegistry {
  request(pageId: string, priority: number): boolean;
  release(pageId: string): void;
  subscribe(fn: () => void): () => void;
  active(): string[];
}

/** Grants at most `capacity` live iframes; a higher-priority request evicts the lowest. */
export function createLiveFrameRegistry(capacity = 2): LiveFrameRegistry {
  const slots = new Map<string, number>();
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    request(id, priority) {
      if (slots.has(id)) { slots.set(id, priority); return true; }
      if (slots.size < capacity) { slots.set(id, priority); emit(); return true; }
      let low: string | null = null;
      for (const [k, p] of slots) if (low === null || p < (slots.get(low) as number)) low = k;
      if (low === null || (slots.get(low) as number) >= priority) return false;
      slots.delete(low);
      slots.set(id, priority);
      emit();
      return true;
    },
    release(id) { if (slots.delete(id)) emit(); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    active() { return [...slots.keys()]; },
  };
}

export const liveFrames = createLiveFrameRegistry(2);
