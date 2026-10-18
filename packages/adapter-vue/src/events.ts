import { getComponentContext } from "@tschk/moonshine-dom/component";
import {
  errorHandlerKey,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
type EventMap<E> = { [K in keyof E]: readonly unknown[] };
type Camel<S extends string> = S extends `${infer A}-${infer B}`
  ? `${A}${Capitalize<Camel<B>>}`
  : S;
type Listener<A extends readonly unknown[]> = (...args: A) => unknown;
export type EventListeners<E extends EventMap<E>> = {
  [K in keyof E as K extends string ? `on${Capitalize<Camel<K>>}` : never]?:
    Listener<E[K]> | readonly Listener<E[K]>[];
} & {
  [
    K in keyof E as K extends string ? `on${Capitalize<Camel<K>>}Once` : never
  ]?: Listener<E[K]> | readonly Listener<E[K]>[];
};
export type Emit<E extends EventMap<E>> = <K extends keyof E & string>(
  event: K,
  ...args: E[K]
) => void;
const camel = (name: string) =>
  name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const modifiersOf = (source: object, model: string) => {
  const read = (name: string) =>
    Reflect.get(source, name + "Modifiers", source);
  return model === "modelValue" || model === "model-value"
    ? Reflect.get(source, "modelModifiers", source)
    : read(model) ||
        read(camel(model)) ||
        read(model.replace(/\B([A-Z])/g, "-$1").toLowerCase());
};
const key = (name: string) =>
  name ? "on" + name[0]!.toUpperCase() + name.slice(1) : "";
/** Compiler-private declared component events; no DOM dispatch or Vue app error API. `update:*` emits honor live trim/number modifier flags. */
export function createEmitter<E extends EventMap<E>>(source: object): Emit<E> {
  const frame = getComponentContext();
  const route = frame.owner.context?.get(errorHandlerKey) as
    ((error: unknown) => boolean) | undefined;
  let emitted: Set<string> | undefined;
  const report = (error: unknown) => {
    if (!route?.(error)) throw error;
  };
  return ((event: string, ...rawArgs: readonly unknown[]) => {
    if (frame.mode === "dom" && frame.owner.disposed) return;
    return untrack(() => {
      let args = rawArgs;
      if (event.startsWith("update:")) {
        const modifiers = modifiersOf(source, event.slice(7)) as
          { trim?: unknown; number?: unknown } | undefined;
        if (modifiers) {
          if (modifiers.trim)
            args = rawArgs.map((value) =>
              typeof value === "string" ? value.trim() : value,
            );
          // Number conversion uses raw arguments even when trim also runs.
          if (modifiers.number)
            args = rawArgs.map((value) => {
              const parsed = parseFloat(value as string);
              return Number.isNaN(parsed) ? value : parsed;
            });
        }
      }
      let name = key(event),
        listener = Reflect.get(source, name, source);
      if (!listener) {
        name = key(camel(event));
        listener = Reflect.get(source, name, source);
      }
      let failed = false,
        failure: unknown;
      const invoke = (value: unknown) => {
        const callbacks = Array.isArray(value) ? value : [value];
        for (const fn of callbacks) {
          if (fn == null) continue;
          try {
            if (typeof fn !== "function")
              throw new TypeError(
                "Component event listeners must be functions",
              );
            const result = Reflect.apply(fn, undefined, args);
            if (
              result &&
              typeof (result as PromiseLike<unknown>).then === "function"
            )
              Promise.resolve(result).then(undefined, (error) => {
                queueMicrotask(() =>
                  runWithOwner(frame.owner, () => untrack(() => report(error))),
                );
              });
          } catch (error) {
            try {
              report(error);
            } catch (unrouted) {
              if (!failed) failure = unrouted;
              failed = true;
            }
          }
        }
      };
      invoke(listener);
      const once = Reflect.get(source, name + "Once", source);
      if (once && !emitted?.has(name)) {
        (emitted ??= new Set()).add(name);
        invoke(once);
      }
      if (failed) throw failure;
    });
  }) as Emit<E>;
}
