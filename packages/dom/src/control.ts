/** Owned control flow for Moonshine lowering, not Solid's compiled ABI. */
import {
  batch,
  createMemo,
  createRenderMemo,
  getRenderScheduler,
  getOwner,
  type Owner,
  createRoot,
  createComponentScope,
  createSignal,
  onCleanup,
  type Accessor,
  type Setter,
} from "./reactive";

type Entry<T, U> = {
  item: T;
  value: U;
  index: Setter<number>;
  dispose: () => void;
  scope?: Owner;
};

function owned<T>(
  fn: () => T,
  order?: () => number,
  owner?: Owner | null,
): { value: T; dispose: () => void; scope?: Owner } {
  let stop: (() => void) | undefined;
  try {
    return createRoot((dispose) => {
      stop = dispose;
      const scheduler = getRenderScheduler();
      const value = scheduler ? scheduler.branch(fn, order) : fn();
      if (owner && !owner.disposed) {
        const scope = getOwner()!;
        scope.parent = owner;
        owner.children.add(scope);
      }
      return owner
        ? { value, dispose, scope: getOwner()! }
        : { value, dispose };
    });
  } catch (error) {
    try {
      stop?.();
    } catch {
      // Preserve the mapper failure after all owned cleanups run.
    }
    throw error;
  }
}

function disposeAll(entries: Iterable<{ dispose: () => void }>): void {
  let failed = false;
  let failure: unknown;
  for (const entry of entries) {
    try {
      entry.dispose();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
}

/** Optional deferRemoved takes ownership of removed roots; throwing falls back to disposal. */
export function mapArray<T, U>(
  list: Accessor<readonly T[]>,
  map: (item: T, index: Accessor<number>) => U,
  deferRemoved?: (dispose: () => void) => void,
  schedule: (read: () => U[]) => Accessor<U[]> = createRenderMemo,
): Accessor<U[]> {
  const owner = getRenderScheduler()
    ? createComponentScope(() => getOwner()!)
    : undefined;
  let entries: Entry<T, U>[] = [];
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    const previous = entries;
    entries = [];
    disposeAll(previous);
  });
  return schedule(() => {
    const items = list();
    const available = new Map<T, Entry<T, U>[]>();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      const bucket = available.get(entry.item);
      if (bucket) bucket.push(entry);
      else available.set(entry.item, [entry]);
    }
    const created: Entry<T, U>[] = [];
    let next: Entry<T, U>[];
    try {
      next = [];
      for (let position = 0; position < items.length; position++) {
        if (disposed) break;
        const item = items[position]!;
        const retained = available.get(item)?.pop();
        if (retained) {
          next.push(retained);
          continue;
        }
        const [index, setIndex] = createSignal(position);
        const root = owned(() => map(item, index), index, owner);
        const entry = { item, ...root, index: setIndex };
        created.push(entry);
        next.push(entry);
      }
    } catch (error) {
      try {
        disposeAll(created);
      } catch {
        // Preserve the mapper failure after all new entries are disposed.
      }
      throw error;
    }
    if (disposed) {
      disposeAll(created);
      return [];
    }
    let removed: Entry<T, U>[] = [];
    if (entries.length !== next.length - created.length) {
      const retained = new Set(next);
      removed = entries.filter((entry) => !retained.has(entry));
    }
    const reordered = next.some((entry, index) => entry !== entries[index]);
    entries = next;
    if (owner && reordered) {
      const pending = [...owner.children];
      owner.children.clear();
      for (const entry of next)
        if (entry.scope) owner.children.add(entry.scope);
      // Deferred removals remain owned until their explicit commit/disposal.
      for (const child of pending) owner.children.add(child);
    }
    batch(() => {
      next.forEach((entry, index) => entry.index(index));
      if (reordered) getRenderScheduler()?.reorder();
      if (deferRemoved && removed.length) {
        try {
          deferRemoved(() => disposeAll(removed));
        } catch (error) {
          try {
            disposeAll(removed);
          } catch {}
          throw error;
        }
      } else disposeAll(removed);
    });
    return disposed ? [] : next.map((entry) => entry.value);
  });
}

/** Retain each position while its item accessor follows the current list value. */
export function indexArray<T, U>(
  list: Accessor<readonly T[]>,
  map: (item: Accessor<T>, index: number) => U,
  schedule: (read: () => U[]) => Accessor<U[]> = createRenderMemo,
): Accessor<U[]> {
  const owner = getRenderScheduler()
    ? createComponentScope(() => getOwner()!)
    : undefined;
  let entries: Array<{
    value: U;
    dispose: () => void;
    write: Setter<T>;
    scope?: Owner;
  }> = [];
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    const previous = entries;
    entries = [];
    disposeAll(previous);
  });
  return schedule(() => {
    const items = list();
    const next = entries.slice(0, items.length);
    const created: typeof entries = [];
    try {
      for (let index = next.length; index < items.length; index++) {
        if (disposed) break;
        const [item, write] = createSignal<T>(items[index]!);
        const entry = {
          ...owned(() => map(item, index), undefined, owner),
          write,
        };
        created.push(entry);
        next.push(entry);
      }
    } catch (error) {
      try {
        disposeAll(created);
      } catch {
        // Preserve the mapper failure after all new entries are disposed.
      }
      throw error;
    }
    if (disposed) {
      disposeAll(created);
      return [];
    }
    const removed = entries.slice(items.length);
    entries = next;
    batch(() => {
      next.forEach((entry, index) => entry.write(() => items[index]!));
      disposeAll(removed);
    });
    return disposed ? [] : next.map((entry) => entry.value);
  });
}

export function Index<T, U>(props: {
  each: Accessor<readonly T[]>;
  children: (item: Accessor<T>, index: number) => U;
}): Accessor<U[]> {
  return indexArray(props.each, props.children);
}

export function For<T, U>(
  props: {
    each: Accessor<readonly T[]>;
    children: (item: T, index: Accessor<number>) => U;
  },
  schedule: (read: () => U[]) => Accessor<U[]> = createRenderMemo,
): Accessor<U[]> {
  return mapArray(props.each, props.children, undefined, schedule);
}

export function Show<T, U>(
  props: {
    when: Accessor<T>;
    children: (value: Accessor<NonNullable<T>>) => U;
    fallback?: () => U;
  },
  schedule: (
    read: () => U | undefined,
  ) => Accessor<U | undefined> = createRenderMemo,
): Accessor<U | undefined> {
  const owner = getRenderScheduler() ? getOwner() : undefined;
  let branch: { value: U | undefined; dispose: () => void } | undefined;
  let visible: boolean | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    branch?.dispose();
    branch = undefined;
  });
  const value = createMemo(props.when);
  if (disposed) return () => undefined;
  const condition = createMemo(() => Boolean(value()));
  if (disposed) return () => undefined;
  return schedule(() => {
    const nextVisible = condition();
    if (visible !== nextVisible) {
      branch?.dispose();
      branch = undefined;
      visible = undefined;
      if (disposed) return undefined;
      branch = owned(
        () =>
          nextVisible
            ? props.children(() => {
                const current = value();
                if (!current) throw new Error("Show branch is inactive");
                return current as NonNullable<T>;
              })
            : props.fallback?.(),
        undefined,
        owner,
      );
      if (disposed) {
        const cancelled = branch;
        branch = undefined;
        cancelled.dispose();
        return undefined;
      }
      visible = nextVisible;
    }
    return branch?.value;
  });
}

const MATCH = /* @__PURE__ */ Symbol("moonshine-match");
export type MatchBranch<T, U> = {
  readonly [MATCH]: true;
  readonly when: Accessor<T>;
  readonly children: (value: Accessor<NonNullable<T>>) => U;
};
/** Describe a branch without evaluating its condition or creating its contents. */
export function Match<T, U>(props: {
  when: Accessor<T>;
  children: (value: Accessor<NonNullable<T>>) => U;
}): MatchBranch<T, U> {
  return { [MATCH]: true, when: props.when, children: props.children };
}

/** First truthy branch wins; retained branches keep their owner and live value. */
export function Switch<U>(props: {
  children: Accessor<readonly MatchBranch<any, U>[]>;
  fallback?: () => U;
}): Accessor<U | undefined> {
  const owner = getRenderScheduler() ? getOwner() : undefined;
  let current: MatchBranch<any, U> | undefined;
  let branch: { value: U | undefined; dispose: () => void } | undefined;
  let initialized = false;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    branch?.dispose();
    branch = undefined;
  });
  const branches = createMemo(props.children);
  if (disposed) return () => undefined;
  const selection = createMemo(() => {
    for (const candidate of branches()) {
      if (!candidate || candidate[MATCH] !== true)
        throw new TypeError("Switch children must be Match branches");
      const value = candidate.when();
      if (value) return { candidate, value };
    }
    return undefined;
  });
  if (disposed) return () => undefined;
  const selected = createMemo(() => selection()?.candidate);
  return createRenderMemo(() => {
    const next = selected();
    if (!initialized || current !== next) {
      branch?.dispose();
      branch = undefined;
      initialized = false;
      current = undefined;
      if (disposed) return undefined;
      branch = owned(
        () =>
          next
            ? next.children(() => {
                const chosen = selection();
                if (chosen?.candidate !== next)
                  throw new Error("Match branch is inactive");
                return chosen.value;
              })
            : props.fallback?.(),
        undefined,
        owner,
      );
      if (disposed) {
        const cancelled = branch;
        branch = undefined;
        cancelled.dispose();
        return undefined;
      }
      current = next;
      initialized = true;
    }
    return branch?.value;
  });
}

export { ErrorBoundary } from "./error";
