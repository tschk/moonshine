import {
  cleanupOrderKey,
  getOwner,
  onCleanup,
  cleanupTransactionActive,
  requestCleanupFinalizerFlush,
} from "@tschk/moonshine-dom/reactive";
import type { CleanupPolicy } from "@tschk/moonshine-dom/reactive";
export function retainRoot(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) retainRoot(child);
    return;
  }
  if (
    getOwner()?.context?.get(cleanupOrderKey) === solidCleanupPolicy &&
    typeof Node !== "undefined" &&
    value instanceof Node
  )
    onCleanup(() => retainCleanupRoot(value));
}
let roots: Set<Node> | undefined;
export function retainCleanupRoot(node: Node): void {
  (roots ??= new Set()).add(node);
  requestCleanupFinalizerFlush(flush);
}
let finalizers: Array<() => void> | undefined,
  draining = false;
export function queueCleanupFinalizer(fn: () => void): void {
  if (!cleanupTransactionActive() && !draining) {
    fn();
    return;
  }
  (finalizers ??= []).push(fn);
  requestCleanupFinalizerFlush(flush);
}
function flush() {
  if (cleanupTransactionActive() || draining || (!finalizers && !roots)) return;
  draining = true;
  let first: unknown,
    failed = false;
  let waves = 0;
  try {
    while (finalizers) {
      if (++waves > 1000) {
        finalizers = undefined;
        if (!failed)
          first = new Error("Solid cleanup finalizer update limit exceeded");
        failed = true;
        break;
      }
      const callbacks = finalizers;
      finalizers = undefined;
      for (const callback of callbacks)
        try {
          callback();
        } catch (error) {
          if (!failed) first = error;
          failed = true;
        }
    }
  } finally {
    finalizers = undefined;
    roots = undefined;
    draining = false;
  }
  if (failed) throw first;
}
export const solidCleanupPolicy: CleanupPolicy = {
  reverse: true,
  deferRemoval(owned, anchor, retain, remove) {
    const oldParent = anchor.parentNode;
    queueCleanupFinalizer(() =>
      remove(owned, undefined, (node) => {
        const adopted =
          node !== anchor &&
          (node.parentNode !== oldParent ||
            anchor.parentNode !== oldParent ||
            !(
              node.compareDocumentPosition(anchor) &
              Node.DOCUMENT_POSITION_FOLLOWING
            ));
        let ancestor = node.parentNode;
        while (ancestor) {
          if (roots?.has(ancestor)) return true;
          ancestor = ancestor.parentNode;
        }
        return adopted || !!retain?.(node);
      }),
    );
  },
};
