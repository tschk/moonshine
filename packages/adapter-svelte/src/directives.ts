/** Explicit native directive installation; source syntax remains compiler-owned. */
import {
  createComponentScope,
  templateRetentionKey,
  createRenderEffect,
  getOwner,
  getRenderScheduler,
  onAfterDispose,
  onCleanup,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { mapArray } from "@tschk/moonshine-dom/control";
import { createRuneEffect } from "./effect";
import { trackActionState } from "./state";
import { withHistoryCleanup } from "./history";

/** Type-only authored Svelte action contract. */
export interface ActionReturn<
  Parameter = undefined,
  Attributes extends object = Record<never, never>,
> {
  update?: (parameter: Parameter) => void;
  destroy?: () => void;
  $$_attributes?: Attributes;
}
export interface Action<
  Element = HTMLElement,
  Parameter = undefined,
  Attributes extends object = Record<never, never>,
> {
  <Node extends Element>(
    ...args: undefined extends Parameter
      ? [node: Node, parameter?: Parameter]
      : [node: Node, parameter: Parameter]
  ): void | ActionReturn<Parameter, Attributes>;
}

export type ActionPayload<T> = { update?(value: T): void; destroy?(): void };
export type Attachment<E extends Element = Element> = (
  element: E,
) => void | (() => void);
function install(fn: () => void): void {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
  const owner = getOwner(),
    scheduler = getRenderScheduler();
  if (!owner || owner.disposed || !scheduler)
    throw Error("Native directives require a live owner and withRuneScheduler");
  createComponentScope(() => scheduler.branch(fn));
}
function cleanup(fn: () => void): void {
  const finish = () => withHistoryCleanup(() => untrack(fn));
  const owner = getOwner();
  if (owner?.disposed) finish();
  else if (owner?.context?.has(templateRetentionKey))
    onCleanup(() => runWithOwner(owner, finish));
  else onAfterDispose(finish);
}
function different(previous: unknown, next: unknown): boolean {
  return previous !== previous
    ? next === next
    : previous !== next ||
        (previous !== null && typeof previous === "object") ||
        typeof previous === "function";
}
/** invoke is a closure: resolve a mutable action reference only when the post factory runs. */
export function installAction<E extends Element, T>(
  element: E,
  invoke: (element: E, value: T) => ActionPayload<T> | void | false | null,
  read: () => T,
): void;
export function installAction<E extends Element, T>(
  element: E,
  invoke: (element: E) => ActionPayload<T> | void | false | null,
): void;
export function installAction<E extends Element, T>(
  element: E,
  invoke: (element: E, value: T) => ActionPayload<T> | void | false | null,
  read?: () => T,
): void {
  install(() =>
    createRuneEffect(() => {
      const payload = untrack(
        () =>
          (read
            ? invoke(element, read())
            : (invoke as (element: E) => ReturnType<typeof invoke>)(element)) ||
          {},
      );
      // Register before updater setup so a failing parameter traversal still releases the action.
      if (payload.destroy) cleanup(() => payload.destroy!());
      if (read && payload.update) {
        let initialized = false;
        let previous: unknown = {};
        createRenderEffect(() => {
          const next = read();
          trackActionState(next);
          if (initialized && different(previous, next)) {
            previous = next;
            payload.update!(next);
          }
        });
        initialized = true;
      }
    }),
  );
}
export function installAttachment<E extends Element>(
  element: E,
  read: () => Attachment<E> | false | null | undefined,
): void {
  install(() => {
    mapArray(
      () => {
        const fn = read();
        return fn ? [fn] : [];
      },
      (fn) => {
        createRuneEffect(() => {
          const stop = fn(element);
          if (typeof stop === "function") cleanup(stop);
        });
        return undefined;
      },
    );
  });
}
