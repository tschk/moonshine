/** Optional SSR render-attempt lifecycle; no serializer or browser dependency. */
import { getOwner } from "./reactive";
const attemptKey = /* @__PURE__ */ Symbol("moonshine.ssr.attempt");
export type SSRRenderAttempt = {
  status: "pending" | "accepted" | "discarded";
  parent?: SSRRenderAttempt;
};
let active = false;
let currentAttempt: SSRRenderAttempt | undefined;
/** Keep serialization attempts current when lexical component owners are restored. */
export function withSSRRenderAttempt<T>(
  attempt: SSRRenderAttempt | undefined,
  read: () => T,
): T {
  const previous = currentAttempt;
  const wasActive = active;
  active = true;
  currentAttempt = attempt;
  try {
    return read();
  } finally {
    currentAttempt = previous;
    active = wasActive;
  }
}
export function captureSSRRenderAttempt(): SSRRenderAttempt | undefined {
  return getOwner()?.context?.get(attemptKey) as SSRRenderAttempt | undefined;
}
/** Publishing follows the active buffer while lifecycle capture remains lexical. */
export function captureActiveSSRRenderAttempt(): SSRRenderAttempt | undefined {
  const lexical = captureSSRRenderAttempt();
  if (!active) return lexical;
  if (!currentAttempt) return undefined;
  for (let attempt = lexical; attempt; attempt = attempt.parent)
    if (attempt === currentAttempt) return lexical;
  return currentAttempt;
}
/** A new request must not inherit its caller's pending lifecycle attempt. */
export function resetSSRRenderAttempt(): void {
  const owner = getOwner();
  if (owner?.context?.has(attemptKey)) {
    owner.context = new Map(owner.context);
    owner.context.delete(attemptKey);
  }
}
export function createSSRRenderAttempt(): SSRRenderAttempt {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("SSR attempts require a live native owner");
  const attempt: SSRRenderAttempt = {
    status: "pending",
    parent: captureActiveSSRRenderAttempt(),
  };
  owner.context = new Map(owner.context);
  owner.context.set(attemptKey, attempt);
  return attempt;
}
export function isSSRRenderAccepted(
  attempt: SSRRenderAttempt | undefined,
): boolean {
  for (let current = attempt; current; current = current.parent)
    if (current.status !== "accepted") return false;
  return true;
}
