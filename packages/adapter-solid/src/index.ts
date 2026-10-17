/** Independent native runtime surface and explicit kernel signal bridge. */
import {
  createSignal as msCreateSignal,
  type Signal as MsSignal,
} from "@tschk/moonshine";
import {
  createSignal,
  onCleanup,
  untrack as nativeUntrack,
  type Accessor,
  type Setter,
} from "@tschk/moonshine-dom/reactive";
import { h, type DOMChild } from "@tschk/moonshine-dom/dom";
import { createIrRenderer } from "./ir";

export type { CrepusNode, CrepusIr, RenderCrepusOptions } from "./ir";
export const { renderCrepusNodeSolid, renderCrepusIrSolid } =
  /* @__PURE__ */ createIrRenderer<DOMChild>(h);

/** Mirror a kernel signal while its native owner lives; writes still target the kernel. */
export function fromMoonshineSignal<T>(
  signal: MsSignal<T>,
): [Accessor<T>, Setter<T>] {
  const [read, write] = createSignal(nativeUntrack(signal));
  const stop = signal.subscribe(() => write(() => nativeUntrack(signal)));
  onCleanup(stop);
  return [
    read,
    (next) => {
      signal.set(next);
      return nativeUntrack(signal);
    },
  ];
}

export function createBridgedSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  return fromMoonshineSignal(msCreateSignal(initial));
}

export { msCreateSignal as createMoonshineSignal };
export type { MsSignal as MoonshineSignal };

// Kernel APIs keep their existing names and contracts.
export {
  createResource,
  createSignal as createMsSignal,
  createMemo,
  batch,
  untrack,
} from "@tschk/moonshine";
export type { Resource, ResourceStatus } from "@tschk/moonshine";
export { hydrateSolid, solidRenderer } from "./framework";
