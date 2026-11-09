import type { Stroke } from "./model";
import type { PageObject } from "../store/schema";

export interface Op {
  remove: Stroke[];
  add: Stroke[];
  objects?: { before: PageObject[]; after: PageObject[] };
}
export interface History { push(op: Op): void; undo(): Op | null; redo(): Op | null }

export function createHistory(capacity = 100): History {
  const done: Op[] = [];
  const undone: Op[] = [];
  return {
    push(op) {
      done.push(op);
      if (done.length > capacity) done.shift();
      undone.length = 0;
    },
    undo() {
      const op = done.pop() ?? null;
      if (op) undone.push(op);
      return op;
    },
    redo() {
      const op = undone.pop() ?? null;
      if (op) done.push(op);
      return op;
    },
  };
}
