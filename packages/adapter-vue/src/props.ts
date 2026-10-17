import { currentGroup, prepareProps } from "./render";
import {
  peekComponentContext,
  withComponentConsumer,
} from "@tschk/moonshine-dom/component";
import {
  batch,
  createComputed,
  createSignal,
  getOwner,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";

/** Compiler metadata for Boolean-bearing props; true also casts empty/name strings. */
export type BooleanProps = readonly (readonly [
  key: string,
  castTrue: boolean,
])[];

/** Finite compiler metadata lists every Boolean-bearing declared prop. */
type BooleanKeys<T> = {
  [K in keyof T]-?: [T[K]] extends [boolean | undefined] ? K : never;
}[keyof T];
export type BooleanSetupProps<T> = [BooleanKeys<T>] extends [never]
  ? T
  : T & {
      [K in BooleanKeys<T>]-?: boolean;
    };

const camelizeProp = (key: string) =>
  key.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const hyphenateProp = (key: string) =>
  key.replace(/\B([A-Z])/g, "-$1").toLowerCase();

function booleanResolver(keys: readonly string[], metadata: BooleanProps) {
  const declared = new Set(keys);
  const casts = new Map(metadata);
  return (raw: Map<string, unknown>): Map<string, unknown> => {
    const values = new Map<string, unknown>();
    const castValues = new Map<string, unknown>();
    for (const [key, value] of raw) {
      const normalized = camelizeProp(key);
      if (declared.has(normalized))
        (casts.has(normalized) ? castValues : values).set(normalized, value);
    }
    for (const [key, castTrue] of casts) {
      const value = castValues.get(key);
      values.set(
        key,
        !castValues.has(key)
          ? false
          : castTrue && (value === "" || value === hyphenateProp(key))
            ? true
            : value,
      );
    }
    for (const key of keys) if (!values.has(key)) values.set(key, undefined);
    return values;
  };
}

type PropsJob = { order: number; run: () => void };
const pending: PropsJob[] = [];
const queued = /* @__PURE__ */ new Set<PropsJob>();
let nextOrder = 0;
let scheduled = false;
function scheduleProps(job: PropsJob): void {
  if (queued.has(job)) return;
  queued.add(job);
  let index = pending.length;
  while (index > 0 && pending[index - 1]!.order > job.order) index--;
  pending.splice(index, 0, job);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    let failed = false;
    let failure: unknown;
    const runs = new Map<PropsJob, number>();
    while (pending.length) {
      const current = pending.shift()!;
      queued.delete(current);
      const count = (runs.get(current) ?? 0) + 1;
      runs.set(current, count);
      try {
        if (count > 1000) throw new Error("Vue props update limit exceeded");
        current.run();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    scheduled = false;
    if (failed) throw failure;
  });
}

/** Shallow declared props with owned, coalesced parent refresh. */
export function createProps<T extends object>(
  source: T,
  keys: readonly (keyof T & string)[],
): T {
  return createPropsCore(source, keys);
}
/** Compiler-only Boolean view; metadata covers every Boolean-bearing declared prop. */
export function createBooleanProps<T extends object>(
  source: T,
  keys: readonly (keyof T & string)[],
  metadata: BooleanProps,
): BooleanSetupProps<T> {
  return createPropsCore(
    source,
    keys,
    booleanResolver(keys, metadata),
  ) as BooleanSetupProps<T>;
}
function createPropsCore<T extends object>(
  source: T,
  keys: readonly (keyof T & string)[],
  resolve?: (
    raw: Map<string, unknown>,
    storage: Record<PropertyKey, unknown>,
  ) => Iterable<readonly [string, unknown]>,
  commit: <R>(fn: () => R) => R = batch,
  preparation: <R>(fn: () => R) => R = untrack,
): T {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new TypeError("Props require a live native owner");
  const storage: Record<PropertyKey, unknown> = {};
  const reads = new Map<PropertyKey, ReturnType<typeof createSignal<number>>>();
  const presence = new Map<
    PropertyKey,
    ReturnType<typeof createSignal<number>>
  >();
  const [shape, setShape] = createSignal(0, { equals: false });
  const cell = (key: PropertyKey) => {
    let found = reads.get(key);
    if (!found) {
      found = createSignal(0, { equals: false });
      reads.set(key, found);
    }
    return found;
  };
  const declared = new Set<string>(keys);
  const define = (key: PropertyKey, value: unknown) =>
    Reflect.defineProperty(storage, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  const view: Record<PropertyKey, unknown> = new Proxy(storage, {
    get(target, key, receiver) {
      cell(key)[0]();
      return Reflect.get(target, key, receiver);
    },
    has(target, key) {
      let found = presence.get(key);
      if (!found) {
        found = createSignal(0, { equals: false });
        presence.set(key, found);
      }
      found[0]();
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      shape();
      return Reflect.ownKeys(target);
    },
    set(target, key, value) {
      return untrack(() => {
        const had = Object.hasOwn(target, key),
          previous = Reflect.get(target, key, view);
        const success = had
          ? Reflect.set(target, key, value, view)
          : define(key, value);
        if (success) {
          batch(() => {
            if (!had) {
              setShape(0);
              presence.get(key)?.[1](0);
            }
            if (!had || !Object.is(previous, value)) reads.get(key)?.[1](0);
          });
        }
        return success;
      });
    },
    deleteProperty(target, key) {
      return untrack(() => {
        const had = Object.hasOwn(target, key),
          success = Reflect.deleteProperty(target, key);
        if (success && had)
          batch(() => {
            setShape(0);
            presence.get(key)?.[1](0);
            reads.get(key)?.[1](0);
          });
        return success;
      });
    },
  });
  let previous: Map<string, unknown> | undefined;
  let invalidated = false;
  const readSource = () => {
    const input = new Map<string, unknown>();
    for (const key in source) input.set(key, Reflect.get(source, key, source));
    const own = new Map(
      Object.keys(source).map((key) => [key, input.get(key)] as const),
    );
    return { input, own };
  };
  const apply = ({ input, own }: ReturnType<typeof readSource>) => {
    if (
      previous &&
      !invalidated &&
      own.size === previous.size &&
      Array.from(own).every(
        ([key, value]) => previous!.has(key) && value === previous!.get(key),
      )
    )
      return;
    // Vue includes inherited enumerable values initially, but later refreshes clear missing own props.
    const captured = previous ? own : input;
    const incoming = captured;
    const ordered = resolve
      ? undefined
      : [
          ...Array.from(incoming.keys()).filter((key) => declared.has(key)),
          ...keys.filter((key) => !incoming.has(key)),
        ];
    const writes = () =>
      untrack(() => {
        if (resolve) {
          for (const [key, value] of resolve(captured, storage)) {
            if (owner.disposed) return;
            Reflect.set(view, key, value);
          }
        } else
          for (const key of ordered!) Reflect.set(view, key, incoming.get(key));
        for (const key of Object.keys(storage))
          if (!declared.has(key)) Reflect.deleteProperty(view, key);
      });
    try {
      commit(writes);
    } catch (error) {
      // Defaults may have changed raw storage before throwing; the old snapshot is stale.
      if (commit === untrack) invalidated = true;
      throw error;
    }
    previous = own;
    invalidated = false;
  };
  // shortcut: this queue orders props refreshes, not arbitrary Vue render jobs or lifecycle hooks.
  let latest: ReturnType<typeof readSource> | undefined;
  const job: PropsJob = {
    order: nextOrder++,
    run() {
      const snapshot = latest;
      latest = undefined;
      if (!owner.disposed && snapshot)
        runWithOwner(owner, () => preparation(() => apply(snapshot)));
    },
  };
  createComputed(() => {
    const snapshot = readSource();
    if (!previous) {
      untrack(() => apply(snapshot));
      return;
    }
    latest = snapshot;
    scheduleProps(job);
  });
  return view as T;
}
export function createServerProps<T extends object>(
  source: T,
  keys: readonly (keyof T & string)[],
): T {
  return createServerPropsCore(source, keys);
}
export function createServerBooleanProps<T extends object>(
  source: T,
  keys: readonly (keyof T & string)[],
  metadata: BooleanProps,
): BooleanSetupProps<T> {
  return createServerPropsCore(
    source,
    keys,
    booleanResolver(keys, metadata),
    camelizeProp,
  ) as BooleanSetupProps<T>;
}
function createServerPropsCore<T extends object>(
  source: T,
  keys: readonly (keyof T & string)[],
  resolve?: (
    raw: Map<string, unknown>,
    storage: Record<PropertyKey, unknown>,
  ) => Iterable<readonly [string, unknown]>,
  normalizeKey?: (key: string) => string,
): T {
  const view = {} as T;
  const values = new Map<string, unknown>();
  for (const key in source)
    if (
      keys.includes(
        (normalizeKey ? normalizeKey(key) : key) as keyof T & string,
      )
    )
      values.set(key, Reflect.get(source, key, source));
  if (resolve) {
    for (const [key, value] of resolve(
      values,
      view as Record<PropertyKey, unknown>,
    ))
      Object.defineProperty(view, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
  } else {
    const names = Array.from(values.keys());
    for (const key of [
      ...names,
      ...keys.filter((missing) => !names.includes(missing)),
    ])
      Object.defineProperty(view, key, {
        value: values.get(key),
        writable: true,
        enumerable: true,
        configurable: true,
      });
  }
  return view;
}

/** Compiler metadata distinguishes literal defaults from factories. */
export type DefaultEntry = readonly [
  key: string,
  value: unknown,
  factory: boolean,
];
function defaultEntries(
  keys: readonly string[],
  casts: BooleanProps,
  definitions: readonly DefaultEntry[],
) {
  const declared = new Set(keys),
    boolean = new Map(casts),
    defaults = new Map(
      definitions.map(([key, value, factory]) => [key, { value, factory }]),
    ),
    cache = new Map<string, unknown>();
  const frame = peekComponentContext();
  return function* (
    raw: Map<string, unknown>,
    storage: Record<PropertyKey, unknown>,
  ): Generator<readonly [string, unknown]> {
    const captured = new Map<string, unknown>();
    for (const [key, value] of raw) {
      const name = camelizeProp(key);
      if (declared.has(name)) captured.set(name, value);
    }
    for (const [key, value] of captured)
      if (!boolean.has(key) && !defaults.has(key)) yield [key, value];
    for (const key of keys) {
      if (!boolean.has(key) && !defaults.has(key)) continue;
      let value = captured.get(key);
      const definition = defaults.get(key);
      if (value === undefined && definition) {
        if (definition.factory) {
          if (cache.has(key)) value = cache.get(key);
          else {
            const invoke = () =>
              Reflect.apply(definition.value as Function, null, [storage]);
            value = frame ? withComponentConsumer(frame, invoke) : invoke();
            cache.set(key, value);
          }
        } else value = definition.value;
      }
      if (boolean.has(key)) {
        if (!captured.has(key) && !definition) value = false;
        else if (
          boolean.get(key) &&
          (value === "" || value === hyphenateProp(key))
        )
          value = true;
      }
      yield [key, value];
    }
    for (const key of keys)
      if (!captured.has(key) && !boolean.has(key) && !defaults.has(key))
        yield [key, undefined];
  };
}
export function createDefaultProps<
  T extends object,
  D extends DefaultValues<T> = {},
>(
  source: T,
  keys: readonly (keyof T & string)[],
  casts: BooleanProps,
  definitions: readonly DefaultEntry[],
) {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Default props require a live owner");
  const group = currentGroup();
  const props = createPropsCore(
    source,
    keys,
    defaultEntries(keys, casts, definitions),
    untrack,
    (fn) => untrack(() => prepareProps(group, fn)),
  );
  return { props: props as SetupDefaults<T, D> };
}
export function createServerDefaultProps<
  T extends object,
  D extends DefaultValues<T> = {},
>(
  source: T,
  keys: readonly (keyof T & string)[],
  casts: BooleanProps,
  definitions: readonly DefaultEntry[],
): SetupDefaults<T, D> {
  return createServerPropsCore(
    source,
    keys,
    defaultEntries(keys, casts, definitions),
    camelizeProp,
  ) as SetupDefaults<T, D>;
}

/** Setup defaults are shallow readonly; caller props retain their original type. */
type PrimitiveDefault = null | number | string | boolean | symbol | Function;
type FactoryProps<T> = { [K in keyof (T & Required<T>)]: T[K] };
type DefaultValue<T, V> =
  | ((props: FactoryProps<T>) => V & {})
  | (V extends PrimitiveDefault ? V : never);
export type DefaultValues<T> = { [K in keyof T]?: DefaultValue<T, T[K]> };
type IsAny<T> = 0 extends 1 & T ? true : false;
type Defaulted<T, D, K extends keyof T> = K extends keyof D
  ? IsAny<D[K]> extends true
    ? Exclude<T[K], undefined>
    : [D[K]] extends [undefined]
      ? T[K]
      : Exclude<T[K], undefined>
  : T[K];
type BoolKeys<T> = {
  [K in keyof T]-?: [T[K]] extends [boolean | undefined] ? K : never;
}[keyof T];
export type SetupDefaults<T, D> = Readonly<Omit<T, keyof D>> & {
  readonly [K in keyof D as K extends keyof T ? K : never]-?: Defaulted<
    T,
    D,
    K & keyof T
  >;
} & {
  readonly [K in BoolKeys<T>]-?: K extends keyof D
    ? [D[K]] extends [undefined]
      ? boolean | undefined
      : boolean
    : boolean;
};

// Compiler-private carrier for authored defaults components.
export { withVueScheduler } from "./render";
