/** Independent deep state for compiler lowering; no Svelte internal ABI. */
import {
  batch,
  createSignal,
  untrack,
  getOwner,
  onCleanup,
} from "@tschk/moonshine-dom/reactive";

import { withHistoryMutation, recordHistory, readHistory } from "./history";

type Cell = ReturnType<typeof createSignal<number>>;
const stateProxies = new WeakSet<object>();
const origins = new WeakMap<object, object>();
/** Internal binding comparison: retain overlay values; unwrap only native state origins. */
export function stateEquals(left: unknown, right: unknown): boolean {
  const original = (value: unknown) =>
    value !== null && typeof value === "object"
      ? (origins.get(value) ?? value)
      : value;
  return Object.is(original(left), original(right));
}

const actionChildren = /* @__PURE__ */ Symbol(
  "native action materialized children",
);
type ActionInterest = { proxies: Set<object>; notify: () => void };
const actionInterests = new WeakMap<object, Set<ActionInterest>>();
function attachActionInterest(value: unknown, interest: ActionInterest): void {
  if (
    value === null ||
    typeof value !== "object" ||
    !stateProxies.has(value) ||
    interest.proxies.has(value)
  )
    return;
  interest.proxies.add(value);
  let interests = actionInterests.get(value);
  if (!interests) actionInterests.set(value, (interests = new Set()));
  interests.add(interest);
  for (const child of (value as any)[actionChildren])
    attachActionInterest(child, interest);
}
function inheritActionInterests(parent: object, value: unknown): void {
  const interests = actionInterests.get(parent);
  if (interests)
    for (const interest of interests) attachActionInterest(value, interest);
}
const modifiedProxies = new WeakSet<object>();
const mutations = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);
function plain(value: unknown): value is Record<PropertyKey, any> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === Array.prototype;
}
function bump(cell: Cell | undefined): void {
  cell?.[1]((value) => value + 1);
}
function observe(cells: Map<PropertyKey, Cell>, key: PropertyKey): void {
  let cell = cells.get(key);
  if (!cell) cells.set(key, (cell = createSignal(0)));
  cell[0]();
}
export function graph() {
  const deleted = Symbol("deleted");
  function wrap<T>(value: T): T {
    if (!plain(value) || stateProxies.has(value)) return value;
    const raw: Record<PropertyKey, any> = value;
    const array = Array.isArray(raw);
    for (const key of Reflect.ownKeys(raw)) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(raw, key)!;
      if (
        !descriptor.configurable ||
        !descriptor.enumerable ||
        !descriptor.writable ||
        !("value" in descriptor)
      )
        throw new TypeError(
          "Native state supports only ordinary writable enumerable data properties",
        );
    }
    const overlay = new Map<PropertyKey, unknown>();
    if (array) overlay.set("length", raw.length);
    const reads = new Map<PropertyKey, Cell>(),
      presence = new Map<PropertyKey, Cell>();
    const keys = createSignal(0),
      methods = new Map<PropertyKey, Function>();
    function ownKeys(): (string | symbol)[] {
      const result = Reflect.ownKeys(raw).filter(
        (key) => overlay.get(key) !== deleted,
      );
      // Own overlay data must shadow inherited names, unlike Svelte's proxy edge behavior.
      for (const [key, next] of overlay) {
        if (next !== deleted && !Object.hasOwn(raw, key))
          result.push(key as string | symbol);
      }
      return result;
    }
    function read(key: PropertyKey, receiver: unknown): unknown {
      if (overlay.has(key)) {
        const next = overlay.get(key);
        return next === deleted ? undefined : next;
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(raw, key);
      if (descriptor?.writable || !Reflect.has(raw, key)) {
        const next = descriptor ? wrap(descriptor.value) : deleted;
        overlay.set(key, next);
        return next === deleted ? undefined : next;
      }
      return Reflect.get(raw, key, receiver);
    }
    function currentDescriptor(
      key: PropertyKey,
    ): PropertyDescriptor | undefined {
      const original = Reflect.getOwnPropertyDescriptor(raw, key);
      if (!overlay.has(key)) return original;
      const next = readHistory(reads, key, () => overlay.get(key));
      if (next === deleted) return undefined;
      return original
        ? { ...original, value: next }
        : {
            value: next,
            enumerable: true,
            configurable: true,
            writable: true,
          };
    }
    function mutate(key: PropertyKey, next: unknown, remove: boolean): boolean {
      return withHistoryMutation(() =>
        batch(() =>
          untrack(() => {
            const before = ownKeys();
            const oldLength = array ? (overlay.get("length") as number) : 0;
            if (array && key === "length" && remove) return false;
            const affected = new Set<PropertyKey>([key]);
            if (array) affected.add("length");
            if (array && key === "length") {
              const length = +(next as number);
              if (length !== length >>> 0)
                throw new RangeError("Invalid array length");
              next = length;
              for (const previous of new Set([
                ...Reflect.ownKeys(raw),
                ...overlay.keys(),
              ]))
                if (
                  typeof previous === "string" &&
                  /^(0|[1-9]\d*)$/.test(previous) &&
                  Number(previous) >= length &&
                  Number(previous) < oldLength
                )
                  affected.add(previous);
            }
            const old = new Map(
              [...affected].map((property) => [
                property,
                {
                  initialized: overlay.has(property),
                  value: overlay.has(property)
                    ? overlay.get(property)
                    : Reflect.get(raw, property),
                  has: overlay.has(property)
                    ? overlay.get(property) !== deleted
                    : Reflect.has(raw, property),
                },
              ]),
            );
            if (array && key === "length")
              for (const property of affected)
                if (property !== "length") overlay.set(property, deleted);
            const resolved = remove ? deleted : wrap(next);
            const previousKey = old.get(key)!;
            overlay.set(
              key,
              previousKey.initialized && previousKey.value === resolved
                ? previousKey.value
                : resolved,
            );
            modifiedProxies.add(proxy);
            if (
              array &&
              resolved !== deleted &&
              typeof key === "string" &&
              /^(0|[1-9]\d*)$/.test(key) &&
              Number(key) < 4294967295 &&
              Number(key) >= oldLength
            )
              overlay.set("length", Number(key) + 1);
            for (const property of affected) {
              const previous = old.get(property)!;
              const current = overlay.has(property)
                ? overlay.get(property)
                : Reflect.get(raw, property);
              const has = overlay.has(property)
                ? overlay.get(property) !== deleted
                : Reflect.has(raw, property);
              if (
                (!previous.initialized && !remove && property === key) ||
                previous.has !== has ||
                previous.value !== current
              ) {
                // First assignment creates an undefined source; deletion/truncation
                // of an unread property creates an already-deleted source instead.
                if (previous.initialized || (!remove && property === key))
                  recordHistory(
                    reads,
                    property,
                    previous.initialized ? previous.value : undefined,
                    current,
                  );
              }
            }
            const after = ownKeys();
            const keysChanged =
              before.length !== after.length ||
              before.some((item, i) => item !== after[i]);
            for (const property of affected) {
              const previous = old.get(property)!;
              const current = overlay.has(property)
                ? overlay.get(property)
                : Reflect.get(raw, property);
              const has = overlay.has(property)
                ? overlay.get(property) !== deleted
                : Reflect.has(raw, property);
              if (previous.has !== has || previous.value !== current)
                bump(reads.get(property));
              if (previous.has !== has) bump(presence.get(property));
            }
            if (keysChanged) keys[1]((version) => version + 1);
            if (
              actionInterests.has(proxy) &&
              (keysChanged ||
                [...affected].some(
                  (property) =>
                    typeof property === "string" &&
                    old.get(property)!.value !==
                      (overlay.has(property)
                        ? overlay.get(property)
                        : Reflect.get(raw, property)),
                ))
            ) {
              if (typeof key === "string")
                inheritActionInterests(proxy, resolved);
              const interests = actionInterests.get(proxy);
              if (interests)
                for (const interest of interests) interest.notify();
            }
            return true;
          }),
        ),
      );
    }
    const proxy = new Proxy(raw, {
      get(_object, key, receiver) {
        if (key === actionChildren)
          return [...overlay]
            .filter(
              ([property, next]) =>
                typeof property === "string" && next !== deleted,
            )
            .map(([, next]) => next);
        observe(reads, key);
        read(key, receiver);
        const stored = readHistory(reads, key, () =>
          overlay.has(key) ? overlay.get(key) : Reflect.get(raw, key, receiver),
        );
        const next = stored === deleted ? undefined : stored;
        if (typeof key === "string") inheritActionInterests(proxy, next);
        if (
          array &&
          mutations.has(key as string) &&
          next === Reflect.get(Array.prototype, key)
        ) {
          let method = methods.get(key);
          if (!method) {
            method = function (this: unknown, ...args: unknown[]) {
              return batch(() =>
                untrack(() => Reflect.apply(next as Function, this, args)),
              );
            };
            methods.set(key, method);
          }
          return method;
        }
        return next;
      },
      set: (_object, key, next) => mutate(key, next, false),
      deleteProperty: (_object, key) => mutate(key, undefined, true),
      has(_object, key) {
        observe(presence, key);
        if (!overlay.has(key) && getOwner()) read(key, proxy);
        return overlay.has(key)
          ? readHistory(reads, key, () => overlay.get(key)) !== deleted
          : Reflect.has(raw, key);
      },
      ownKeys() {
        keys[0]();
        return ownKeys();
      },
      getOwnPropertyDescriptor(_object, key) {
        if (!overlay.has(key) && getOwner()) read(key, proxy);
        return currentDescriptor(key);
      },
      defineProperty(_object, key, descriptor) {
        if (
          !("value" in descriptor) ||
          descriptor.configurable === false ||
          descriptor.enumerable === false ||
          descriptor.writable === false
        )
          throw new TypeError(
            "Native state requires configurable enumerable writable value descriptors",
          );
        return mutate(key, descriptor.value, false);
      },
      setPrototypeOf() {
        throw new TypeError("Native state prototype is fixed");
      },
      preventExtensions() {
        throw new TypeError("Native state must remain extensible");
      },
    });
    origins.set(proxy, raw);
    stateProxies.add(proxy);
    return proxy as T;
  }
  return wrap;
}
export interface State<T> {
  value: T;
}
export function createState<T>(initial: T): State<T> {
  const wrap = graph();
  const [read, write] = createSignal(wrap(initial));
  return {
    get value() {
      return readHistory(read, "value", read);
    },
    set value(next: T) {
      withHistoryMutation(() => {
        const previous = untrack(read),
          resolved = wrap(next);
        if (previous !== resolved)
          recordHistory(read, "value", previous, resolved);
        write(() => resolved);
      });
    },
  };
}
/** Detached snapshot; uncloneable values are retained, as in Svelte production. */
export function stateSnapshot<T>(value: T): T {
  const seen = new WeakMap<object, object>();
  const activeOrigins = new WeakMap<object, object>();
  const serializing = new WeakSet<object>();
  function copy(input: any, original?: object): any {
    if (input !== null && typeof input === "object") {
      if (seen.has(input)) return seen.get(input);
      if (input instanceof Map) return new Map(input);
      if (input instanceof Set) return new Set(input);
      const array = Array.isArray(input);
      if (array || Object.getPrototypeOf(input) === Object.prototype) {
        const origin = origins.get(input) ?? input;
        const active = activeOrigins.get(origin);
        // Raw cycles create fresh lazy proxies; only collapse untouched implicit edges.
        if (active && !modifiedProxies.has(input)) return active;
        const output: Record<PropertyKey, any> = array ? [] : {};
        seen.set(input, output);
        if (original) seen.set(original, output);
        const previous = activeOrigins.get(origin);
        activeOrigins.set(origin, output);
        try {
          if (array) {
            output.length = input.length;
            for (let index = 0; index < input.length; index++) {
              const next = input[index];
              if (index in input) output[index] = copy(next);
            }
          } else {
            for (const key of Object.keys(input))
              Object.defineProperty(output, key, {
                value: copy(input[key]),
                configurable: true,
                enumerable: true,
                writable: true,
              });
          }
        } finally {
          if (previous) activeOrigins.set(origin, previous);
          else activeOrigins.delete(origin);
        }
        return output;
      }
      if (input instanceof Date) return structuredClone(input);
      if (typeof input.toJSON === "function") {
        if (serializing.has(input)) return input;
        serializing.add(input);
        try {
          return copy(input.toJSON(), input);
        } finally {
          serializing.delete(input);
        }
      }
      if (typeof EventTarget !== "undefined" && input instanceof EventTarget)
        return input;
    }
    try {
      return structuredClone(input);
    } catch {
      return input;
    }
  }
  return untrack(() => copy(value));
}

/** Private action dependency traversal: cycles retain independent overlay identities. */
export function trackActionState(value: unknown): void {
  const eventTarget = (input: object) =>
    typeof EventTarget !== "undefined" && input instanceof EventTarget;
  if (value === null || typeof value !== "object" || eventTarget(value)) return;
  const visited = new Set<object>(),
    activeOrigins = new Set<object>();
  const interest: ActionInterest = { proxies: new Set(), notify: () => {} };
  // The signal tracks only mutation events; materializing a lazy alias is read-only.
  // Register before traversal so later materialized cycle descendants inherit it.
  const [version, bumpVersion] = createSignal(0);
  interest.notify = () => bumpVersion((v) => v + 1);
  version();
  onCleanup(() => {
    for (const proxy of interest.proxies)
      actionInterests.get(proxy)?.delete(interest);
    interest.proxies.clear();
  });
  function deep(input: unknown): void {
    if (
      input === null ||
      typeof input !== "object" ||
      eventTarget(input) ||
      visited.has(input)
    )
      return;
    visited.add(input);
    attachActionInterest(input, interest);
    const origin = origins.get(input);
    if (origin && activeOrigins.has(origin)) return;
    if (origin) activeOrigins.add(origin);
    try {
      if (input instanceof Date) input.getTime();
      for (const key in input) {
        try {
          deep((input as any)[key]);
        } catch {}
      }
      const proto = Object.getPrototypeOf(input);
      if (
        proto &&
        proto !== Object.prototype &&
        proto !== Array.prototype &&
        proto !== Map.prototype &&
        proto !== Set.prototype &&
        proto !== Date.prototype
      )
        for (const descriptor of Object.values(
          Object.getOwnPropertyDescriptors(proto),
        ))
          if (descriptor.get) {
            try {
              descriptor.get.call(input);
            } catch {}
          }
    } finally {
      if (origin) activeOrigins.delete(origin);
    }
  }
  if (stateProxies.has(value)) deep(value);
  else if (!Array.isArray(value))
    for (const key in value) {
      const next = (value as any)[key];
      if (next !== null && typeof next === "object" && stateProxies.has(next))
        deep(next);
    }
}
