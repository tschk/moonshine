/** Independent Map instrumentation on the native graph. */
import { isTracking } from "@tschk/moonshine/tracking";
import { batch, createSignal } from "@tschk/moonshine-dom/reactive";

type Cell = ReturnType<typeof createSignal<number>>;
type State = {
  target: Map<unknown, unknown>;
  wrap: (value: unknown) => unknown;
  raw: (value: unknown) => unknown;
  keys: Map<unknown, Cell>;
  objects: WeakMap<object, Cell>;
  iteration?: Cell;
  cleared?: Cell;
};
const states = new WeakMap<object, State>();
function state(value: object): State {
  const found = states.get(value);
  if (!found) throw new TypeError("Map method requires a native reactive Map");
  return found;
}
const objectKey = (key: unknown): key is object =>
  (typeof key === "object" && key !== null) || typeof key === "function";
function cell(s: State, key: unknown, create = false): Cell | undefined {
  let found = objectKey(key) ? s.objects.get(key) : s.keys.get(key);
  if (!found && create) {
    found = createSignal(0);
    if (objectKey(key)) s.objects.set(key, found);
    else s.keys.set(key, found);
  }
  return found;
}
function trackKey(s: State, key: unknown): void {
  if (!isTracking()) return;
  (s.cleared ??= createSignal(0))[0]();
  cell(s, key, true)![0]();
}
function trackIteration(s: State): void {
  if (isTracking()) (s.iteration ??= createSignal(0))[0]();
}
function bump(signal: Cell | undefined): void {
  signal?.[1]((version) => version + 1);
}
function resolveTargetKey(
  target: Map<unknown, unknown>,
  key: unknown,
  rawKey: unknown,
): { found: boolean; targetKey: unknown } {
  if (target.has(key)) return { found: true, targetKey: key };
  if (!Object.is(key, rawKey) && target.has(rawKey)) {
    return { found: true, targetKey: rawKey };
  }
  return { found: false, targetKey: rawKey };
}
function iterator(
  receiver: Map<unknown, unknown>,
  mode: "keys" | "values" | "entries",
): MapIterator<any> {
  const s = state(receiver);
  trackIteration(s);
  return (function* () {
    for (const [key, value] of s.target) {
      if (mode === "keys") {
        yield s.wrap(key);
      } else if (mode === "values") {
        yield s.wrap(value);
      } else {
        yield [s.wrap(key), s.wrap(value)];
      }
    }
    return undefined;
  })();
}
const methods = {
  get size() {
    const s = state(this);
    trackIteration(s);
    return s.target.size;
  },
  has(this: Map<unknown, unknown>, key: unknown) {
    const s = state(this);
    const rawKey = s.raw(key);
    trackKey(s, key);
    if (!Object.is(key, rawKey)) trackKey(s, rawKey);
    return s.target.has(key) || s.target.has(rawKey);
  },
  get(this: Map<unknown, unknown>, key: unknown) {
    const s = state(this);
    const rawKey = s.raw(key);
    trackKey(s, key);
    if (!Object.is(key, rawKey)) trackKey(s, rawKey);
    const { found, targetKey } = resolveTargetKey(s.target, key, rawKey);
    if (!found) return undefined;
    return s.wrap(s.target.get(targetKey));
  },
  set(this: Map<unknown, unknown>, key: unknown, value: unknown) {
    const s = state(this);
    const rawKey = s.raw(key);
    const rawValue = s.raw(value);
    const { found, targetKey } = resolveTargetKey(s.target, key, rawKey);
    if (found) {
      const oldValue = s.target.get(targetKey);
      s.target.set(targetKey, rawValue);
      if (!Object.is(oldValue, rawValue)) {
        batch(() => {
          bump(cell(s, targetKey));
          if (!Object.is(targetKey, rawKey)) bump(cell(s, rawKey));
          if (!Object.is(targetKey, key)) bump(cell(s, key));
          bump(s.iteration);
        });
      }
    } else {
      s.target.set(rawKey, rawValue);
      batch(() => {
        bump(cell(s, rawKey));
        if (!Object.is(key, rawKey)) bump(cell(s, key));
        bump(s.iteration);
      });
    }
    return this;
  },
  delete(this: Map<unknown, unknown>, key: unknown) {
    const s = state(this);
    const rawKey = s.raw(key);
    const { found, targetKey } = resolveTargetKey(s.target, key, rawKey);
    if (!found) return false;
    const deleted = s.target.delete(targetKey);
    if (deleted) {
      batch(() => {
        bump(cell(s, targetKey));
        if (!Object.is(targetKey, rawKey)) bump(cell(s, rawKey));
        if (!Object.is(targetKey, key)) bump(cell(s, key));
        bump(s.iteration);
      });
    }
    return deleted;
  },
  clear(this: Map<unknown, unknown>) {
    const s = state(this);
    if (!s.target.size) return;
    s.target.clear();
    batch(() => {
      bump(s.cleared);
      bump(s.iteration);
    });
  },
  keys(this: Map<unknown, unknown>) {
    return iterator(this, "keys");
  },
  values(this: Map<unknown, unknown>) {
    return iterator(this, "values");
  },
  entries(this: Map<unknown, unknown>) {
    return iterator(this, "entries");
  },
  [Symbol.iterator](this: Map<unknown, unknown>) {
    return iterator(this, "entries");
  },
  forEach(
    this: Map<unknown, unknown>,
    callback: (
      value: unknown,
      key: unknown,
      map: Map<unknown, unknown>,
    ) => void,
    thisArg?: unknown,
  ) {
    if (typeof callback !== "function")
      throw new TypeError("Map callback must be a function");
    const s = state(this);
    trackIteration(s);
    s.target.forEach((value, key) => {
      callback.call(thisArg, s.wrap(value), s.wrap(key), this);
    });
  },
};
export function createTrackedMap(
  target: Map<unknown, unknown>,
  wrap: State["wrap"],
  raw: State["raw"],
): Map<unknown, unknown> {
  const proxy = new Proxy(target, {
    get(source, key, receiver) {
      return Object.hasOwn(methods, key) && key in source
        ? Reflect.get(methods, key, receiver)
        : Reflect.get(source, key, receiver);
    },
  });
  states.set(proxy, {
    target,
    wrap,
    raw,
    keys: new Map(),
    objects: new WeakMap(),
  });
  return proxy;
}
