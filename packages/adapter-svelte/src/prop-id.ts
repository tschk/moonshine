/** Deterministic tree-scoped $props.id() runtime helper. */
import {
  assertNotCleanupComputation,
  getOwner,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import { peekComponentContext } from "@tschk/moonshine-dom/component";

const idCounters = /* @__PURE__ */ new WeakMap<
  Owner,
  { next: number; prefix: string }
>();

export function setRootIdPrefix(owner: Owner, idPrefix?: string): void {
  let root: Owner = owner;
  while (root.parent) root = root.parent;
  const prefix = idPrefix ? `${idPrefix}` : "";
  const existing = idCounters.get(root);
  if (existing) {
    existing.prefix = prefix;
  } else {
    idCounters.set(root, { next: 0, prefix });
  }
}

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
    state = { next: 0, prefix: "" };
    idCounters.set(root, state);
  }
  return `${state.prefix}s-${state.next++}`;
}
