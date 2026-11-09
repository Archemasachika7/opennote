import { liveQuery } from "dexie";
import { useEffect, useState, type DependencyList } from "react";

/** Subscribe to a Dexie live query; re-runs when deps change or the underlying tables change. */
export function useLive<T>(query: () => Promise<T>, deps: DependencyList, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
