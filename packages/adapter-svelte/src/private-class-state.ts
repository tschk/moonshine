/** Optional private-field cells; value is historical, peek is live and untracked. */
import { createSignal, untrack } from "@tschk/moonshine-dom/reactive";
import { readHistory, recordHistory, withHistoryMutation } from "./history";
import { graph } from "./state";

export function createPrivateState<T>(initial: T): {
  value: T;
  assign(next: T): T;
  peek(): T;
} {
  const wrap = graph();
  const [read, write] = createSignal(wrap(initial));
  function assign(next: T): T {
    return withHistoryMutation(() => {
      const previous = untrack(read),
        resolved = wrap(next);
      if (previous !== resolved)
        recordHistory(read, "value", previous, resolved);
      write(() => resolved);
      return resolved;
    });
  }
  return {
    get value() {
      return readHistory(read, "value", read);
    },
    set value(next: T) {
      assign(next);
    },
    assign,
    peek() {
      return untrack(read);
    },
  };
}

export function createPrivateRawState<T>(initial: T): { value: T; peek(): T } {
  const [read, write] = createSignal(initial);
  return {
    get value() {
      return readHistory(read, "value", read);
    },
    set value(next: T) {
      withHistoryMutation(() => {
        const previous = untrack(read);
        if (previous !== next) recordHistory(read, "value", previous, next);
        write(() => next);
      });
    },
    peek() {
      return untrack(read);
    },
  };
}
