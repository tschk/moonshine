/** Server bindings publish final local values only after successful rendering. */
import { untrack } from "@tschk/moonshine";

export function createServerProp<T>(
  props: object,
  key: PropertyKey,
  fallback?: () => T,
): { value: T; commit(): void } {
  let value = untrack(() => {
    const initial = Reflect.get(props, key);
    return initial === undefined ? fallback?.() : initial;
  }) as T;
  return {
    get value() {
      return value;
    },
    set value(next: T) {
      value = next;
    },
    commit() {
      untrack(() => {
        if (Reflect.get(props, key) !== undefined || value === undefined)
          return;
        const setter = Object.getOwnPropertyDescriptor(props, key)?.set;
        if (setter) Reflect.apply(setter, props, [value]);
      });
    },
  };
}
