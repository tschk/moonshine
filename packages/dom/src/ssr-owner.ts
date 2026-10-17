/** Lightweight SSR context and ownership; importing it does not load the serializer. */
import { getOwner, type Owner } from "./reactive";
import type { SSRChild } from "./ssr";

let rendering = 0;
/** shortcut: synchronous SSR only; use request-local context for async rendering. */
export function withSSRRendering<T>(fn: () => T): T {
  rendering++;
  try {
    return fn();
  } finally {
    rendering--;
  }
}
export function isSSRRendering(): boolean {
  return rendering > 0;
}

export const ssrOwner = /* @__PURE__ */ Symbol("moonshine SSR owner");
export type OwnedSSRChild = {
  readonly [ssrOwner]: Owner;
  readonly child: SSRChild;
};

/** Keep deferred descendants in the current scope through complete serialization. */
export function scopeSSRChild(child: SSRChild): OwnedSSRChild {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("SSR child scope requires a live native owner");
  return { [ssrOwner]: owner, child };
}
