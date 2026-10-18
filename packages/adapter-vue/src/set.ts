/** Independent Set instrumentation on the native graph. */
import { isTracking } from "@tschk/moonshine/tracking";
import { batch, createSignal } from "@tschk/moonshine-dom/reactive";

type Cell = ReturnType<typeof createSignal<number>>;
type State = {
  target: Set<unknown>;
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
  if (!found) throw new TypeError("Set method requires a native reactive Set");
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
function changed(s: State, key: unknown): void {
  batch(() => {
    bump(cell(s, key));
    bump(s.iteration);
  });
}
function iterator(receiver: Set<unknown>, entries: boolean): SetIterator<any> {
  const s = state(receiver);
  trackIteration(s);
  return (function* () {
    for (const value of s.target) {
      const wrapped = s.wrap(value);
      yield entries ? [wrapped, wrapped] : wrapped;
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
  has(this: Set<unknown>, key: unknown) {
    const s = state(this),
      raw = s.raw(key);
    trackKey(s, key);
    if (!Object.is(key, raw)) trackKey(s, raw);
    return s.target.has(key) || s.target.has(raw);
  },
  add(this: Set<unknown>, value: unknown) {
    const s = state(this),
      key = s.raw(value);
    if (!s.target.has(key)) {
      s.target.add(key);
      changed(s, key);
    }
    return this;
  },
  delete(this: Set<unknown>, value: unknown) {
    const s = state(this),
      key = s.target.has(value) ? value : s.raw(value);
    const deleted = s.target.delete(key);
    if (deleted) changed(s, key);
    return deleted;
  },
  clear(this: Set<unknown>) {
    const s = state(this);
    if (!s.target.size) return;
    s.target.clear();
    batch(() => {
      bump(s.cleared);
      bump(s.iteration);
    });
  },
  keys(this: Set<unknown>) {
    return iterator(this, false);
  },
  values(this: Set<unknown>) {
    return iterator(this, false);
  },
  entries(this: Set<unknown>) {
    return iterator(this, true);
  },
  [Symbol.iterator](this: Set<unknown>) {
    return iterator(this, false);
  },
  forEach(
    this: Set<unknown>,
    callback: (value: unknown, key: unknown, set: Set<unknown>) => void,
    thisArg?: unknown,
  ) {
    if (typeof callback !== "function")
      throw new TypeError("Set callback must be a function");
    const s = state(this);
    trackIteration(s);
    s.target.forEach((value) => {
      const wrapped = s.wrap(value);
      callback.call(thisArg, wrapped, wrapped, this);
    });
  },
};
export function createTrackedSet(
  target: Set<unknown>,
  wrap: State["wrap"],
  raw: State["raw"],
): Set<unknown> {
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
