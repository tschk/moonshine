/** Shallow compiler cell: assignments track; nested values retain their identity. */
import { createSignal, untrack } from "@tschk/moonshine-dom/reactive";
import { readHistory, recordHistory, withHistoryMutation } from "./history";

export function createRawState<T>(initial: T): { value: T } {
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
  };
}
