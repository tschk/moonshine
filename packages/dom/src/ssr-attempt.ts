/** Optional SSR render-attempt lifecycle; no serializer or browser dependency. */
import { getOwner } from "./reactive";
const attemptKey = /* @__PURE__ */ Symbol("moonshine.ssr.attempt");
export type SSRRenderAttempt = {
  status: "pending" | "accepted" | "discarded";
  parent?: SSRRenderAttempt;
};
export function captureSSRRenderAttempt(): SSRRenderAttempt | undefined {
  return getOwner()?.context?.get(attemptKey) as SSRRenderAttempt | undefined;
}
export function createSSRRenderAttempt(): SSRRenderAttempt {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("SSR attempts require a live native owner");
  const attempt: SSRRenderAttempt = {
    status: "pending",
    parent: captureSSRRenderAttempt(),
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
