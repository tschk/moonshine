/**
 * Minimal Observable-like bridge (no rxjs package required).
 */
import { createSignal, type Signal } from "@tschk/moonshine";

export type Unsubscribe = () => void;

export type ObservableLike<T> = {
  subscribe(next: (value: T) => void): { unsubscribe: Unsubscribe };
};

/** Turn a moonshine signal into a minimal Observable-like. */
export function fromSignal<T>(signal: Signal<T>): ObservableLike<T> {
  return {
    subscribe(next) {
      next(signal());
      const stop = signal.subscribe(() => next(signal()));
      return { unsubscribe: stop };
    },
  };
}

/** Push Observable-like values into a new signal. */
export function toSignal<T>(
  source: ObservableLike<T>,
  initial: T,
): { signal: Signal<T>; stop: Unsubscribe } {
  const signal = createSignal(initial);
  const sub = source.subscribe((v) => signal.set(() => v));
  return { signal, stop: () => sub.unsubscribe() };
}
