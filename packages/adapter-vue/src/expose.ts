import {
  bindOwnedReference,
  enqueueComponentReference,
  type ComponentReference,
} from "@tschk/moonshine-dom/component-instance";
import { getOwner } from "@tschk/moonshine-dom/reactive";
import {
  getTemplateRefBinding,
  isRef,
  unref,
  useTemplateRef,
  type Ref,
  type TemplateRef,
} from "./reactive";

export { useTemplateRef, type TemplateRef };

export type ShallowUnwrap<T> = T extends () => infer R
  ? { [K in keyof R]: R[K] extends Readonly<Ref<infer V>> ? V : R[K] }
  : { [K in keyof T]: T[K] extends Readonly<Ref<infer V>> ? V : T[K] };

export type TemplateRefBinding<T> =
  | {
      get: () => T | null | undefined;
      set: (value: T | null) => void;
    }
  | Readonly<Ref<T | null>>;

function resolveRefBinding<T>(binding: TemplateRefBinding<T>): {
  get: () => T | null | undefined;
  set: (value: T | null) => void;
} {
  if (isRef(binding)) {
    const internal = getTemplateRefBinding(binding);
    if (internal) return internal;
    return {
      get: () => binding.value,
      set: (value: T | null) => {
        (binding as Ref<T | null>).value = value;
      },
    };
  }
  const accessor = binding as {
    get?: () => T | null | undefined;
    set?: (value: T | null) => void;
  };
  if (
    !accessor ||
    typeof accessor.get !== "function" ||
    typeof accessor.set !== "function"
  )
    throw new TypeError("Template ref binding requires get and set functions");
  return { get: accessor.get, set: accessor.set };
}

/** Wrap a plain defineExpose object so own enumerable keys unwrap and write through refs. */
export function exposeRefs<T extends object>(source: T): ShallowUnwrap<T> {
  if (
    source === null ||
    typeof source !== "object" ||
    (Object.getPrototypeOf(source) !== Object.prototype &&
      Object.getPrototypeOf(source) !== null)
  )
    throw new TypeError(
      "Component exports must be a plain object of named exports",
    );
  const exposed = Object.create(null) as ShallowUnwrap<T>;
  for (const key of Reflect.ownKeys(source)) {
    if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
    Object.defineProperty(exposed, key, {
      enumerable: true,
      configurable: true,
      get() {
        return unref(Reflect.get(source, key));
      },
      set(next: unknown) {
        const previous = Reflect.get(source, key);
        if (isRef(previous) && !isRef(next)) {
          previous.value = next;
        } else if (!Reflect.set(source, key, next)) {
          throw new TypeError(
            `Cannot assign to read only property '${String(key)}'`,
          );
        }
      },
    });
  }
  return exposed;
}

/** Bind an intrinsic element reference into the shared component reference flush wave. */
export function bindRef<T extends Element>(
  element: T,
  binding: TemplateRefBinding<T>,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed) return;
  const resolved = resolveRefBinding(binding);
  enqueueComponentReference(
    bindOwnedReference(
      owner,
      element,
      {
        cleanup: "commit",
        get: resolved.get,
        set: resolved.set,
      },
      enqueueComponentReference,
    ),
  );
}

/** Create a commit-cleaned component reference binding for a setup ref or useTemplateRef. */
export function bindComponentRef<T extends object>(
  binding: TemplateRefBinding<T>,
): ComponentReference<T> {
  const resolved = resolveRefBinding(binding);
  return {
    cleanup: "commit",
    get: resolved.get,
    set: resolved.set,
  };
}
