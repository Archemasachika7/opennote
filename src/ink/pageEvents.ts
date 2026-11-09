const subs = new Set<(pageId: string) => void>();
/** Tell mounted ink layers that a page's strokes changed outside of them (paste, cut). */
export function notifyPageChanged(pageId: string): void { subs.forEach((f) => f(pageId)); }
export function onPageChanged(f: (pageId: string) => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
