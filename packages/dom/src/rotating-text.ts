import { createSignal, getOwner, onCleanup } from "./reactive";

/** Owned DOM text rotation; reduced motion keeps the first phrase. */
export function createRotatingText(
  phrases: readonly string[],
  intervalMs: number,
): () => string {
  if (phrases.length < 2) return () => phrases[0] ?? "";
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("Rotating text requires a live native owner");
  const [index, setIndex] = createSignal(0);
  const motion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let timer: ReturnType<typeof globalThis.setInterval> | undefined;
  const syncMotion = () => {
    if (owner.disposed) return;
    if (motion?.matches) {
      if (timer !== undefined) globalThis.clearInterval(timer);
      timer = undefined;
      setIndex(0);
    } else if (timer === undefined) {
      timer = globalThis.setInterval(
        () => {
          if (!owner.disposed)
            setIndex((value) => (value + 1) % phrases.length);
        },
        Math.max(1, Math.min(2147483647, intervalMs || 1)),
      );
    }
  };
  onCleanup(() => {
    motion?.removeEventListener("change", syncMotion);
    if (timer !== undefined) globalThis.clearInterval(timer);
  });
  motion?.addEventListener("change", syncMotion);
  syncMotion();
  return () => phrases[index()] ?? "";
}
