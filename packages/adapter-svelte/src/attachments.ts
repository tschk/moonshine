/** Independent Svelte 5 `svelte/attachments` implementation on the Moonshine reactive graph. */
import {
  createRenderEffect,
  getOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import type { Action, ActionPayload, Attachment } from "./directives";
import { trackActionState } from "./state";

export type { Attachment };

const ATTACHMENT_SYMBOL_PREFIX = "@attach";
const attachmentKeys = new Set<symbol>();

/**
 * Creates a unique symbol key recognized as an element attachment property
 * when spread onto an element (`{ [createAttachmentKey()]: myAttachment }`).
 */
export function createAttachmentKey(): symbol {
  const key = Symbol(ATTACHMENT_SYMBOL_PREFIX);
  attachmentKeys.add(key);
  return key;
}

/** Check whether a property key was created by `createAttachmentKey()`. */
export function isAttachmentKey(key: PropertyKey): key is symbol {
  return (
    typeof key === "symbol" &&
    (attachmentKeys.has(key) || key.description === ATTACHMENT_SYMBOL_PREFIX)
  );
}

function different(previous: unknown, next: unknown): boolean {
  return previous !== previous
    ? next === next
    : previous !== next ||
        (previous !== null && typeof previous === "object") ||
        typeof previous === "function";
}

/**
 * Converts a classic Svelte `use:action` function into a Svelte 5 `Attachment`.
 */
export function fromAction<
  E extends Element,
  P = undefined,
  A extends Record<string, any> = Record<never, never>,
>(
  action: Action<E, P, A> | ((node: E, param: P) => void | ActionPayload<P>),
  fn: () => P,
): Attachment<E>;
export function fromAction<
  E extends Element,
  A extends Record<string, any> = Record<never, never>,
>(
  action:
    Action<E, undefined, A> | ((node: E) => void | ActionPayload<undefined>),
): Attachment<E>;
export function fromAction<E extends Element, P = undefined>(
  action: (node: E, param?: P) => void | ActionPayload<P>,
  fn?: () => P,
): Attachment<E> {
  return (element: E) => {
    const payload =
      untrack(() => (fn ? action(element, fn()) : action(element))) || {};

    if (fn && typeof payload.update === "function") {
      const owner = getOwner();
      if (owner && !owner.disposed) {
        let initialized = false;
        let previous: unknown = {};
        createRenderEffect(() => {
          const next = fn();
          trackActionState(next);
          if (initialized && different(previous, next)) {
            previous = next;
            payload.update!(next);
          } else if (!initialized) {
            previous = next;
          }
        });
        initialized = true;
      }
    }

    if (typeof payload.destroy === "function") {
      return () => {
        payload.destroy!();
      };
    }
    return undefined;
  };
}
