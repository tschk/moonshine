/** Independent Solid-style prop composition; no compiler or host proxy ABI. */
import { createMemo } from "@tschk/moonshine-dom/reactive";

type Source =
  object | (() => object | null | undefined | false) | null | undefined | false;
type Resolved<T> = T extends () => infer R
  ? Extract<R, object>
  : Extract<T, object>;
type Merge<T extends readonly unknown[]> = T extends readonly [
  infer A,
  ...infer B,
]
  ? Omit<Resolved<A>, keyof Merge<B>> & Merge<B>
  : {};
type Split<T, K extends readonly (readonly (keyof T)[])[]> = [
  ...{ [I in keyof K]: Pick<T, K[I][number]> },
  Omit<T, K[number][number]>,
];
const views = new WeakSet<object>();
type Reader = () => object;
const empty = Object.freeze({});
function view(
  read: (key: PropertyKey) => unknown,
  has: (key: PropertyKey) => boolean,
  keys: () => (string | symbol)[],
): object {
  const result = new Proxy(
    {},
    {
      get: (_, key) => read(key),
      has: (_, key) => has(key),
      ownKeys: keys,
      set: () => true,
      deleteProperty: () => true,
      getOwnPropertyDescriptor: (_, key) => ({
        configurable: true,
        enumerable: true,
        get: () => read(key),
        set: () => {},
      }),
    },
  );
  views.add(result);
  return result;
}
export function mergeProps<T extends readonly Source[]>(
  ...sources: T
): Merge<T> {
  const live = sources.some(
    (source) => typeof source === "function" || (!!source && views.has(source)),
  );
  if (live) {
    const readers: Reader[] = sources.map((source) => {
      if (typeof source === "function") {
        const memo = createMemo(
          source as () => object | null | undefined | false,
        );
        return () => memo() || empty;
      }
      return () => source || empty;
    });
    return view(
      (key) => {
        for (let index = readers.length - 1; index >= 0; index--) {
          const source = readers[index]!();
          const value = Reflect.get(source, key);
          if (value !== undefined) return value;
        }
      },
      (key) => readers.some((read) => key in read()),
      () => [...new Set(readers.flatMap((read) => Object.keys(read())))],
    ) as Merge<T>;
  }
  const names = [
    ...new Set(
      sources
        .toReversed()
        .flatMap((source) =>
          source ? Object.getOwnPropertyNames(source).toReversed() : [],
        ),
    ),
  ].toReversed();
  const result: Record<string, unknown> = {};
  for (const key of names) {
    if (key === "__proto__" || key === "constructor") continue;
    const descriptors = sources.map((source) =>
      source ? Object.getOwnPropertyDescriptor(source, key) : undefined,
    );
    let selected = descriptors.length - 1;
    while (
      selected >= 0 &&
      (!descriptors[selected] ||
        (!descriptors[selected]!.get &&
          descriptors[selected]!.value === undefined))
    )
      selected--;
    const descriptor = descriptors[selected];
    if (descriptor && descriptor.get) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        get() {
          for (let index = selected; index >= 0; index--) {
            const desc = descriptors[index];
            if (!desc) continue;
            const value = desc.get ? desc.get.call(sources[index]) : desc.value;
            if (value !== undefined) return value;
          }
        },
      });
    } else result[key] = descriptor ? descriptor.value : undefined;
  }
  return result as Merge<T>;
}
export function splitProps<
  T extends object,
  K extends readonly (readonly (keyof T)[])[],
>(props: T, ...groups: K): Split<T, K> {
  if (views.has(props)) {
    const blocked = new Set<PropertyKey>(groups.flat());
    const parts = groups.map((group) =>
      view(
        (key) =>
          group.includes(key as keyof T) ? Reflect.get(props, key) : undefined,
        (key) => group.includes(key as keyof T) && key in props,
        () =>
          group
            .filter((key) => key in props)
            .map((key) => (typeof key === "symbol" ? key : String(key))),
      ),
    );
    parts.push(
      view(
        (key) => (blocked.has(key) ? undefined : Reflect.get(props, key)),
        (key) => !blocked.has(key) && key in props,
        () => Object.keys(props).filter((key) => !blocked.has(key)),
      ),
    );
    return parts as Split<T, K>;
  }
  const parts = Array.from({ length: groups.length + 1 }, () => ({}));
  for (const key of Object.getOwnPropertyNames(props)) {
    const index = groups.findIndex((group) => group.includes(key as keyof T));
    const descriptor = Object.getOwnPropertyDescriptor(props, key)!;
    Object.defineProperty(
      parts[index < 0 ? groups.length : index]!,
      key,
      descriptor,
    );
  }
  return parts as Split<T, K>;
}
