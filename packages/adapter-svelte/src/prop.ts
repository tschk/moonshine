/** Compiler-facing prop cells; binding declaration checks belong to the compiler. */
import { untrack } from "@tschk/moonshine";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { createDerived } from "./derived";
import { createState } from "./state";

export function createProp<T>(
  props: object,
  key: PropertyKey,
  options: {
    bindable?: boolean;
    fallback?: () => T;
    mode?: "dom" | "ssr";
  } = {},
): { get value(): T; set value(value: T) } {
  const mode = options.mode ?? peekComponentContext()?.mode ?? "dom";
  const setter = options.bindable
    ? Object.getOwnPropertyDescriptor(props, key)?.set
    : undefined;
  // Svelte 5.57 rune defaults are lazy derived values, independent of local
  // prop overrides and reused across defined/undefined parent phases.
  const fallbackCell = options.fallback
    ? createDerived(options.fallback)
    : undefined;
  function fallback(): T {
    return fallbackCell?.value as T;
  }
  const initial = untrack(() => Reflect.get(props, key));
  if (initial === undefined && options.fallback) {
    const value = fallback();
    if (setter) {
      if (mode === "dom")
        throw new Error(
          `Bound prop ${String(key)} cannot be undefined when it has a fallback`,
        );
      if (value !== undefined)
        untrack(() => Reflect.apply(setter, props, [value]));
    }
  }
  function read(): T {
    const value = Reflect.get(props, key);
    if (value === undefined) return fallback();
    return value as T;
  }
  if (setter)
    return {
      get value() {
        return read();
      },
      set value(value: T) {
        untrack(() => Reflect.apply(setter, props, [value]));
      },
    };
  const local = createDerived(read);
  return {
    get value() {
      return local.value;
    },
    set value(value: T) {
      const next = options.bindable ? createState(value).value : value;
      local.value = next;
    },
  };
}
