import type { Subscriber, Unsubscriber } from "./store";
/** Observable subscriptions may return an object whose method needs its receiver. */
export function subscribeTo<T>(
  store: { subscribe(run: Subscriber<T>, invalidate?: () => void): unknown },
  run: Subscriber<T>,
  invalidate?: () => void,
): Unsubscriber {
  const subscription: unknown = store.subscribe(run, invalidate);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (typeof subscription === "function") subscription();
    else if (
      subscription &&
      typeof subscription === "object" &&
      "unsubscribe" in subscription &&
      typeof subscription.unsubscribe === "function"
    )
      subscription.unsubscribe();
    else if (subscription !== undefined)
      throw new TypeError(
        "Store subscription must return a function or unsubscribe object",
      );
  };
}

export function changed<T>(previous: T, next: T): boolean {
  return previous !== previous
    ? next === next
    : previous !== next ||
        (previous !== null && typeof previous === "object") ||
        typeof previous === "function";
}
