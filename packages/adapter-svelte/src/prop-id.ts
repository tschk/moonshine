/** Deterministic tree-scoped $props.id() runtime helper. */
import {
  assertNotCleanupComputation,
  getOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import { peekComponentContext } from "@tschk/moonshine-dom/component";

const idCounters = /* @__PURE__ */ new WeakMap<Owner, { next: number }>();

export function propsId(): string {
  assertNotCleanupComputation();
  const owner = getOwner();
  const frame = peekComponentContext();
  if (!owner || owner.disposed || (frame && !frame.active)) {
    throw new Error(
      "$props.id() must be called during native component initialization",
    );
  }
  let root: Owner = owner;
  while (root.parent) root = root.parent;
  let state = idCounters.get(root);
  if (!state) {
    state = { next: 0 };
    idCounters.set(root, state);
  }
  return `s-${state.next++}`;
}
