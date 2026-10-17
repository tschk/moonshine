/** Compiler-private optional Vue defaults component scheduling. */
import { collectDeps, type Trackable } from "@tschk/moonshine/tracking";
import {
  createComponentScope,
  createRoot,
  createSignal,
  getOwner,
  getRenderScheduler,
  onCleanup,
  runWithOwner,
  untrack,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import {
  renderSchedulerKey,
  type RenderScheduler,
} from "@tschk/moonshine-dom/render-scheduler";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
const groupKey = /* @__PURE__ */ Symbol("moonshine.vue.render-group");
type Order = {
  parent?: Order;
  next: number;
  index: number;
  read?: () => number;
};
type Job = {
  owner: Owner;
  order: Order;
  phase: "pre" | "structural" | "render";
  run: () => void;
  pass: number;
};
type Group = {
  order?: Order;
  id: number;
  owner: Owner;
  jobs: Set<Job>;
  posts: Set<() => void>;
  blocked: boolean;
  preparing: number;
  pass: number;
};
let running: Group | undefined;
let nextId = 0,
  flushing = false,
  scheduled = false;
const pending = /* @__PURE__ */ new Set<Group>();
export function currentGroup(): Group | undefined {
  return getOwner()?.context?.get(groupKey) as Group | undefined;
}
const alive = (g: Group) => !g.owner.disposed;
function enqueue(g: Group) {
  if (!alive(g) || g.blocked) return;
  pending.add(g);
  if (!scheduled && !flushing) {
    scheduled = true;
    queueMicrotask(flush);
  }
}
function compare(a: Order, b: Order) {
  const path = (n: Order) => {
    const p: Order[] = [];
    for (let v: Order | undefined = n; v; v = v.parent) p.unshift(v);
    return p;
  };
  const x = path(a),
    y = path(b);
  let i = 0;
  while (x[i] && x[i] === y[i]) i++;
  if (!x[i] || !y[i]) return x.length - y.length;
  return untrack(
    () => (x[i]!.read?.() ?? x[i]!.index) - (y[i]!.read?.() ?? y[i]!.index),
  );
}
function drain(callbacks: Iterable<() => void>) {
  let failed = false,
    error: unknown;
  for (const cb of callbacks)
    try {
      cb();
    } catch (e) {
      if (!failed) error = e;
      failed = true;
    }
  if (failed) throw error;
}
function flush() {
  if (flushing) return;
  scheduled = false;
  flushing = true;
  let failed = false,
    error: unknown;
  const counts = new Map<Group, number>();
  const postCounts = new Map<Group, number>();
  try {
    do {
      while (pending.size) {
        // oxlint-disable-next-line unicorn/no-array-sort -- sort an already fresh snapshot.
        const g = [...pending].sort(
          (a, b) => compare(a.order!, b.order!) || a.id - b.id,
        )[0]!;
        pending.delete(g);
        if (!alive(g) || g.blocked || g.preparing) continue;
        const count = (counts.get(g) ?? 0) + 1;
        counts.set(g, count);
        try {
          if (count > 1000) throw Error("Vue render update limit exceeded");
          running = g;
          g.pass++;
          const ran = new Set<Job>();
          while (true) {
            const jobs = [...g.jobs]
              .filter(
                (j) => !j.owner.disposed && !ran.has(j) && j.pass !== g.pass,
              )
              // oxlint-disable-next-line unicorn/no-array-sort -- sort an already fresh filtered snapshot.
              .sort(
                (a, b) =>
                  (a.phase === "pre" ? 0 : a.phase === "structural" ? 1 : 2) -
                    (b.phase === "pre"
                      ? 0
                      : b.phase === "structural"
                        ? 1
                        : 2) || compare(a.order, b.order),
              );
            const job = jobs[0];
            if (!job || !alive(g) || g.blocked) break;
            ran.add(job);
            job.pass = g.pass;
            job.run();
          }
        } catch (e) {
          if (!failed) error = e;
          failed = true;
        } finally {
          running = undefined;
        }
      }
      // Child groups post before their live ancestors; callback registration order within group.
      // oxlint-disable-next-line unicorn/no-array-sort -- sort an already fresh snapshot.
      const posts = [...postGroups].sort((a, b) => {
        const ancestor = (x: Order, y: Order) => {
          for (let v: Order | undefined = y; v; v = v.parent)
            if (v === x) return true;
          return false;
        };
        return ancestor(a.order!, b.order!)
          ? 1
          : ancestor(b.order!, a.order!)
            ? -1
            : compare(a.order!, b.order!) || a.id - b.id;
      });
      postGroups.clear();
      for (const g of posts) {
        const callbacks = [...g.posts];
        g.posts.clear();
        try {
          const count = (postCounts.get(g) ?? 0) + 1;
          postCounts.set(g, count);
          if (count > 1000) throw Error("Vue post update limit exceeded");
          drain(callbacks);
        } catch (e) {
          if (!failed) error = e;
          failed = true;
        }
      }
    } while (pending.size || postGroups.size);
  } finally {
    flushing = false;
    if (pending.size || postGroups.size) {
      scheduled = true;
      queueMicrotask(flush);
    }
  }
  if (failed) throw error;
}
const postGroups = /* @__PURE__ */ new Set<Group>();
export function prepareProps<T>(group: Group | undefined, fn: () => T): T {
  if (!group) return fn();
  group.preparing++;
  let success = false;
  try {
    const value = fn();
    success = true;
    return value;
  } finally {
    group.preparing--;
    if (alive(group)) {
      group.blocked = !success;
      if (success) enqueue(group);
      else pending.delete(group);
    }
  }
}
function install<T>(
  fn: () => T,
  parent?: Order,
  existing?: Group,
  read?: () => number,
): T {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Vue scheduler requires live owner");
  const group = existing ?? {
    id: nextId++,
    owner,
    jobs: new Set<Job>(),
    posts: new Set<() => void>(),
    blocked: false,
    preparing: 0,
    pass: 0,
  };
  const order: Order = {
    parent,
    next: 0,
    index: parent ? parent.next++ : 0,
    read,
  };
  if (!existing) group.order = order;
  const before = owner.context;
  owner.context = new Map(before);
  owner.context.set(groupKey, group);
  owner.context.set(renderSchedulerKey, carrier(group, order));
  if (!existing)
    onCleanup(() => {
      pending.delete(group);
      postGroups.delete(group);
      group.posts.clear();
    });
  return fn();
}
type VueCarrier = RenderScheduler & { [groupKey]: Group };
function carrier(group: Group, parent: Order): VueCarrier {
  return {
    [groupKey]: group,
    effect(fn, initial) {
      let previous = initial;
      registerJob(group, parent, "render", () => {
        previous = fn(previous);
      });
    },
    memo: ((fn: any, initial: any, options: any) => {
      const [read, write] = createSignal(initial, options);
      registerJob(group, parent, "structural", () =>
        write(() => fn(untrack(read))),
      );
      return read;
    }) as RenderScheduler["memo"],
    component(fn) {
      return install(fn, parent);
    },
    branch(fn, order) {
      return install(fn, parent, group, order);
    },
    reorder() {
      if (running !== group) enqueue(group);
    },
    pre(fn) {
      registerJob(group, parent, "pre", () => {
        const stop = fn();
        if (typeof stop === "function") onCleanup(stop);
      });
    },
    post(fn) {
      group.posts.add(fn);
      postGroups.add(group);
      if (!scheduled && !flushing) {
        scheduled = true;
        queueMicrotask(flush);
      }
    },
  };
}
function registerJob(
  group: Group,
  parent: Order,
  phase: Job["phase"],
  fn: () => void,
) {
  const owner = createComponentScope(() => getOwner()!);
  const order: Order = { parent, next: 0, index: parent.next++ };
  let stopRun: (() => void) | undefined;
  let subscriptions = new Map<Trackable, () => void>();
  const value: Job = { owner, order, phase, run, pass: group.pass };
  group.jobs.add(value);
  function close() {
    group.jobs.delete(value);
    const old = stopRun;
    stopRun = undefined;
    const callbacks = [...subscriptions.values(), ...(old ? [old] : [])];
    subscriptions.clear();
    drain(callbacks);
  }
  function run() {
    if (owner.disposed || !alive(group)) return;
    const old = stopRun;
    stopRun = undefined;
    old?.();
    if (owner.disposed) return;
    let found: Trackable[] = [];
    const versions = new Map<Trackable, number>();
    runWithOwner(owner, () =>
      createRoot((stop) => {
        const scope = getOwner()!;
        stopRun = stop;
        scope.context = new Map(scope.context);
        scope.context.set(renderSchedulerKey, carrier(group, order));
        createComponentScope(() => {
          found = collectDeps(fn, (dep) => versions.set(dep, dep.version));
        });
        if (!owner.disposed) {
          scope.parent = owner;
          owner.children.add(scope);
        }
      }),
    );
    if (owner.disposed) {
      close();
      return;
    }
    const next = new Map<Trackable, () => void>();
    try {
      for (const dep of found)
        next.set(
          dep,
          subscriptions.get(dep) ??
            dep.subscribe(() => {
              if (running !== group || value.pass === group.pass)
                enqueue(group);
            }),
        );
    } catch (e) {
      try {
        drain(next.values());
        close();
      } catch {}
      throw e;
    }
    const removed = [...subscriptions]
      .filter(([dep]) => !next.has(dep))
      .map(([, stop]) => stop);
    subscriptions = next;
    drain(removed);
    if (found.some((dep) => versions.get(dep) !== dep.version)) enqueue(group);
  }
  runWithOwner(owner, () => onCleanup(close));
  try {
    run();
  } catch (e) {
    try {
      close();
    } catch {}
    throw e;
  }
}
export function withVueScheduler<T>(fn: () => T): T {
  if (isSSRRendering()) return fn();
  const group = currentGroup();
  const current = getRenderScheduler() as VueCarrier | undefined;
  if (group && current?.[groupKey] === group && alive(group)) {
    if (getOwner()?.disposed) throw Error("Vue scheduler requires live owner");
    return fn();
  }
  return install(fn);
}
