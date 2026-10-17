import { cleanupOrderKey } from "@tschk/moonshine-dom/reactive";
/** Opt-in owned pre/render/post phases; source lowering belongs to Crepus. */
import {
  collectDeps,
  subscribeInvalidation,
  type Trackable,
} from "@tschk/moonshine/tracking";
import {
  createRoot,
  createComponentScope,
  createSignal,
  getOwner,
  getRenderScheduler,
  onCleanup,
  onBeforeDispose,
  queuePostCommit,
  runWithOwner,
  untrack,
  type Owner,
} from "@tschk/moonshine-dom/reactive";
import {
  renderSchedulerKey,
  type RenderScheduler,
} from "@tschk/moonshine-dom/render-scheduler";
import {
  peekComponentContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { flushComponentReferences } from "@tschk/moonshine-dom/component-instance";
import { holdHistory, releaseHistory, withHistoryCleanup } from "./history";
import { queueTickWork, removeTickWork } from "./tick-queue";
const runeConsumerKey = /* @__PURE__ */ Symbol("moonshine.svelte.consumer");
const runeNodeKey = /* @__PURE__ */ Symbol("moonshine.svelte.node");
type Node = {
  source?: true;
  componentCap?: Node;
  referenceTail?: { owner: Owner; callbacks: Array<() => void> };
  consumer?: ComponentContext;
  owner: Owner;
  parent?: Node;
  order: number;
  next: number;
  orderRead?: () => number;
  disposed: boolean;
  publication?: true;
  phase?: "pre" | "render" | "structural" | "post";
};
type Job = Node & { run: () => void };
function node(owner: Owner, parent?: Node, phase?: Node["phase"]): Node {
  return {
    owner,
    parent,
    phase,
    order: parent ? parent.next++ : 0,
    next: 0,
    disposed: false,
  };
}
const rootOrder = new Map<Node, number>();
const postNodes = new WeakMap<() => void, Node>();
function queueRoot(value: Node): void {
  const root = rootOf(value);
  if (!rootOrder.has(root)) rootOrder.set(root, rootOrder.size);
}
function isAncestor(parent: Node, child: Node): boolean {
  for (let value: Node | undefined = child; value; value = value.parent)
    if (value === parent) return true;
  return false;
}
function comparePosts(leftFn: () => void, rightFn: () => void): number {
  if (leftFn === rightFn) return 0;
  const left = postNodes.get(leftFn)!,
    right = postNodes.get(rightFn)!;
  const a = left.parent!,
    b = right.parent!;
  return a === b
    ? left.order - right.order
    : isAncestor(a, b)
      ? 1
      : isAncestor(b, a)
        ? -1
        : compare(left, right);
}
let orderedPosts: Array<() => void> = [],
  postCursor = 0,
  postsDirty = true;
function firstPost(): () => void {
  if (postsDirty) {
    // oxlint-disable-next-line unicorn/no-array-sort -- sort a fresh snapshot without allocating a second array.
    orderedPosts = [...posts].sort(comparePosts);
    postCursor = 0;
    postsDirty = false;
  }
  while (postCursor < orderedPosts.length) {
    const next = orderedPosts[postCursor++]!;
    if (posts.has(next)) return next;
  }
  throw new Error("Rune scheduler lost pending post work");
}
function rootOf(value: Node): Node {
  while (value.parent) value = value.parent;
  return value;
}

const pres = new Set<Job>(),
  renders = new Set<Job>(),
  posts = new Set<() => void>();
let scheduled = false,
  flushing = false,
  epoch = 0,
  initializing = 0;
let current: Node | undefined;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  holdHistory();
  const token = ++epoch;
  queueTickWork(flushRuneWork, cancel);
  queueMicrotask(() => {
    if (token === epoch && scheduled) flush();
  });
}
/** Internal await completion commit; this is not Svelte's general flushSync API. */
export function flushRuneWork(): void {
  if (flushing || !scheduled || initializing || peekComponentContext()?.active)
    return;
  ++epoch;
  flush();
}
function alive(job: Job): boolean {
  for (let next: Node | undefined = job; next; next = next.parent)
    if (next.disposed || next.owner.disposed) return false;
  return true;
}
function compare(a: Node, b: Node): number {
  if (a === b) return 0;
  const left: Node[] = [],
    right: Node[] = [];
  for (let n: Node | undefined = a; n; n = n.parent) left.unshift(n);
  for (let n: Node | undefined = b; n; n = n.parent) right.unshift(n);
  if (left[0] !== right[0])
    return rootOrder.get(left[0]!)! - rootOrder.get(right[0]!)!;
  let i = 0;
  while (i < left.length && i < right.length && left[i] === right[i]) i++;
  if (i === left.length) return -1;
  if (i === right.length) return 1;
  const l = left[i]!,
    r = right[i]!;
  return (
    (l.phase === "pre" ? 0 : 1) - (r.phase === "pre" ? 0 : 1) ||
    untrack(() => (l.orderRead?.() ?? l.order) - (r.orderRead?.() ?? r.order))
  );
}
let ordered: Job[] = [],
  cursor = 0,
  jobsDirty = true;
function first(): Job {
  if (jobsDirty) {
    // oxlint-disable-next-line unicorn/no-array-sort -- sort a fresh snapshot without allocating a second array.
    ordered = [...pres, ...renders].sort(compare);
    cursor = 0;
    jobsDirty = false;
  }
  while (cursor < ordered.length) {
    const next = ordered[cursor++]!;
    if (pres.has(next) || renders.has(next)) return next;
  }
  throw new Error("Rune scheduler lost pending render work");
}
const completedPres = new Set<Job>();
const nextPres = new Set<Job>();
const nextRenders = new Set<Job>();
let preDepth = 0;
let inPost = false;
let inPublication = false;
let currentStructural: Job | undefined;
function flush() {
  removeTickWork(flushRuneWork);
  flushing = true;
  let failure: unknown,
    failed = false;
  const counts = new Map<unknown, number>();
  function attempt(key: unknown, fn: () => void) {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > 1000) {
      if (!failed) failure = Error("Rune scheduler update limit exceeded");
      failed = true;
      return;
    }
    try {
      fn();
    } catch (e) {
      if (!failed) failure = e;
      failed = true;
    }
  }
  try {
    while (
      pres.size ||
      renders.size ||
      posts.size ||
      nextPres.size ||
      nextRenders.size
    ) {
      if (!pres.size && !renders.size && !posts.size) {
        completedPres.clear();
        for (const job of nextPres) pres.add(job);
        for (const job of nextRenders) renders.add(job);
        nextPres.clear();
        nextRenders.clear();
        jobsDirty = true;
      }
      if (pres.size || renders.size) {
        const job = first();
        pres.delete(job);
        renders.delete(job);
        if (alive(job)) attempt(job, job.run);
        continue;
      }
      try {
        flushComponentReferences();
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
      if (pres.size || renders.size) continue;
      const post = posts.size ? firstPost() : undefined;
      if (post) {
        posts.delete(post);
        inPost = true;
        inPublication = !!postNodes.get(post)?.publication;
        try {
          attempt(post, post);
        } finally {
          inPost = false;
          inPublication = false;
        }
      }
    }
  } finally {
    scheduled = false;
    rootOrder.clear();
    completedPres.clear();
    nextPres.clear();
    nextRenders.clear();
    ordered = [];
    orderedPosts = [];
    jobsDirty = true;
    postsDirty = true;
    flushing = false;
    releaseHistory();
  }
  if (failed) throw failure;
}
function cancel(): void {
  pres.clear();
  renders.clear();
  posts.clear();
  nextPres.clear();
  nextRenders.clear();
  flushRuneWork();
}
function carrier(parent: Node | undefined): RenderScheduler & {
  readonly [runeConsumerKey]: ComponentContext | undefined;
  readonly [runeNodeKey]: Node | undefined;
} {
  return {
    get [runeNodeKey]() {
      return parent;
    },
    get [runeConsumerKey]() {
      for (let value = parent; value; value = value.parent)
        if (value.consumer) return value.consumer;
      return undefined;
    },
    reorder() {
      jobsDirty = true;
      postsDirty = true;
    },
    pre(fn) {
      ownedJob(fn, "pre", parent);
    },
    effect: (fn, initial) => {
      let previous = initial;
      ownedJob(
        () => {
          previous = fn(previous);
        },
        "render",
        parent,
      );
    },
    memo: ((fn: any, initial: any, options: any) => {
      const [value, setValue] = createSignal(initial, options);
      ownedJob(() => setValue(() => fn(untrack(value))), "structural", parent);
      return value;
    }) as RenderScheduler["memo"],
    post(fn, referencePublication) {
      let token = postNodes.get(fn);
      if (!token) {
        token = node(parent!.owner, parent, "post");
        postNodes.set(fn, token);
      }
      token.publication = referencePublication;
      queueRoot(token);
      if (!posts.has(fn)) postsDirty = true;
      posts.add(fn);
      if (!flushing) schedule();
    },
    component(fn) {
      return setupGroup(fn, parent);
    },
    branch(fn, order) {
      return setupGroup(fn, parent, order);
    },
  };
}
function setupGroup<T>(
  fn: () => T,
  parent: Node | undefined,
  order?: () => number,
): T {
  const owner = getOwner()!;
  const group = node(owner, parent);
  group.orderRead = order;
  onCleanup(() => {
    group.disposed = true;
  });
  owner.context = new Map(owner.context);
  owner.context.set(renderSchedulerKey, carrier(group));
  const previous = current;
  current = group;
  try {
    return fn();
  } finally {
    current = previous;
  }
}
function ownedJob(
  fn: () => unknown,
  phase: "pre" | "render" | "structural",
  parent: Node | undefined,
): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw Error("Scheduled work requires a live owner");
  const queue = phase === "pre" ? pres : renders;
  let stopRun: (() => void) | undefined;
  let deps = new Map<Trackable, () => void>();
  let lastVersions: Map<Trackable, number> | undefined;
  let cleanupRunning = false,
    forced = false;
  const job: Job = { ...node(owner, parent, phase), run: runWithPhase };
  function enqueue() {
    if (!alive(job)) return;
    if (cleanupRunning) forced = true;
    if (nextPres.has(job) || nextRenders.has(job)) return;
    // Reference publication starts a later pass; ordinary post cleanup still renders immediately.
    if (
      flushing &&
      ((inPublication && phase !== "structural") ||
        (phase === "pre" && !preDepth && !inPost && completedPres.has(job)) ||
        (phase === "structural" &&
          currentStructural &&
          compare(job, currentStructural) < 0))
    ) {
      queue.delete(job);
      jobsDirty = true;
      (phase === "pre" ? nextPres : nextRenders).add(job);
      queueRoot(job);
      schedule();
      return;
    }
    if (!queue.has(job)) jobsDirty = true;
    queue.add(job);
    queueRoot(job);
    schedule();
  }
  function runWithPhase() {
    if (!alive(job)) return;
    const previousStructural = currentStructural;
    if (phase === "structural") currentStructural = job;
    if (phase === "pre") {
      if (flushing) completedPres.add(job);
      preDepth++;
    }
    try {
      run();
    } finally {
      if (phase === "pre") preDepth--;
      currentStructural = previousStructural;
    }
  }
  function run() {
    if (!alive(job)) return;
    if (lastVersions && !forced) {
      let changed = false,
        completed = false;
      runWithOwner(owner, () =>
        createRoot((stop) => {
          try {
            createComponentScope(() => {
              untrack(() => {
                for (const [dep, version] of lastVersions!) {
                  dep.validate?.();
                  if (dep.version !== version) changed = true;
                }
              });
              completed = true;
            });
          } finally {
            stop();
          }
        }),
      );
      if (!completed) {
        shutdown();
        return;
      }
      if (!changed) return;
    }
    forced = false;
    const old = stopRun;
    stopRun = undefined;
    cleanupRunning = true;
    try {
      if (old) untrack(old);
    } finally {
      cleanupRunning = false;
    }
    if (!alive(job)) return;
    let failed = false,
      failure: unknown;
    const versions = new Map<Trackable, number>();
    let found: Trackable[] = [];
    runWithOwner(owner, () =>
      createRoot((stop) => {
        const scope = getOwner()!;
        stopRun = () => runWithOwner(scope, () => withHistoryCleanup(stop));
        scope.context = new Map(scope.context);
        scope.context.set(renderSchedulerKey, carrier(job));
        const previous = current;
        current = job;
        try {
          createComponentScope(() => {
            found = collectDeps(
              () => {
                try {
                  const cleanup = fn();
                  if (phase === "pre" && typeof cleanup === "function")
                    onCleanup(cleanup as () => void);
                } catch (e) {
                  failed = true;
                  failure = e;
                }
              },
              (dep) => versions.set(dep, dep.version),
            );
            if (failed) throw failure;
          });
        } finally {
          current = previous;
        }
        // Render descendants tear down before their component; pre jobs retain
        // subscription-first shutdown, including its first-error precedence.
        if (phase !== "pre" && !failed && alive(job)) {
          scope.parent = job.owner;
          job.owner.children.add(scope);
        }
      }),
    );
    // A returned failed setup was routed by the native component scope.
    // Never subscribe or revive that failed branch while its boundary commits.
    if (failed || !alive(job)) {
      shutdown();
      return;
    }
    const next = new Map<Trackable, () => void>();
    try {
      untrack(() => {
        for (const dep of found)
          next.set(
            dep,
            deps.get(dep) ??
              subscribeInvalidation(dep, { invalidate() {}, notify: enqueue }),
          );
      });
    } catch (error) {
      try {
        shutdown([...next.values()]);
      } catch {
        /* Preserve subscription failure. */
      }
      throw error;
    }
    if (!alive(job)) {
      shutdown([...next.values()]);
      return;
    }
    const previous = deps;
    deps = next;
    let unsubscribeFailed = false,
      unsubscribeFailure: unknown;
    for (const [dep, stop] of previous)
      if (!next.has(dep)) {
        try {
          untrack(stop);
        } catch (error) {
          if (!unsubscribeFailed) unsubscribeFailure = error;
          unsubscribeFailed = true;
        }
      }
    if (unsubscribeFailed) {
      try {
        shutdown();
      } catch {
        /* Preserve unsubscribe failure. */
      }
      throw unsubscribeFailure;
    }
    lastVersions = versions;
    if (found.some((dep) => dep.version !== versions.get(dep))) enqueue();
  }
  function shutdown(extra: Iterable<() => void> = []) {
    job.disposed = true;
    queue.delete(job);
    nextPres.delete(job);
    nextRenders.delete(job);
    const callbacks = new Set([
      ...deps.values(),
      ...extra,
      ...(stopRun ? [stopRun] : []),
    ]);
    deps.clear();
    stopRun = undefined;
    let failed = false,
      failure: unknown;
    for (const stop of callbacks) {
      try {
        untrack(stop);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  }
  onCleanup(shutdown);
  runWithPhase();
}
/** Internal const evaluation provenance; synthetic scheduler groups inherit it. */
export function getRuneConsumer(): ComponentContext | undefined {
  return (
    getRenderScheduler() as
      | (RenderScheduler & { readonly [runeConsumerKey]?: ComponentContext })
      | undefined
  )?.[runeConsumerKey];
}
function runeNode(): Node | undefined {
  return (
    getRenderScheduler() as
      (RenderScheduler & { readonly [runeNodeKey]?: Node }) | undefined
  )?.[runeNodeKey];
}
function sourceNode(value: Node | undefined): Node | undefined {
  for (; value; value = value.parent) if (value.source) return value;
}
/** Compiler-only: called inside an actual source control callback, not synthetic groups. */
export function markRuneSourceEffect(): void {
  const value = runeNode();
  if (
    !value ||
    value.owner !== getOwner() ||
    value.owner.disposed ||
    value.owner.disposing
  )
    throw Error("Source effects require a live current Rune group");
  value.source = true;
}
/** Internal intrinsic-reference cleanup policy; captures provenance before its synthetic branch. */
export function captureRuneReferenceCleanup(): (clear: () => void) => void {
  const value = runeNode();
  const source = sourceNode(value);
  let cap: Node | undefined;
  for (let n = value; n; n = n.parent)
    if (n.componentCap) {
      cap = n.componentCap;
      break;
    }
  if (!source || !cap || !isAncestor(cap, source))
    throw Error("Element references require valid Rune source provenance");
  const path: Node[] = [];
  for (let n: Node | undefined = source; n; n = n.parent) {
    if (n.source) path.push(n);
    if (n === cap) break;
  }
  for (const n of path) {
    if (n.referenceTail) continue;
    const owner =
      n.componentCap === n
        ? (n.consumer?.owner ?? n.owner.parent ?? n.owner)
        : n.owner;
    if (owner.disposed || owner.disposing)
      throw Error("Reference tails require live source owners");
    const callbacks: Array<() => void> = [];
    n.referenceTail = { owner, callbacks };
    runWithOwner(owner, () =>
      onBeforeDispose(() =>
        onCleanup(() => {
          let failed = false,
            failure: unknown;
          while (callbacks.length) {
            try {
              untrack(callbacks.pop()!);
            } catch (error) {
              if (!failed) failure = error;
              failed = true;
            }
          }
          if (failed) throw failure;
        }),
      ),
    );
  }
  return (clear) => {
    let selected: Node | undefined;
    for (const n of path) if (n.referenceTail!.owner.disposing) selected = n;
    if (selected) selected.referenceTail!.callbacks.push(clear);
    else queuePostCommit(clear);
  };
}
export function withRuneScheduler<T>(fn: () => T): T {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return fn();
  const parent = getOwner();
  if (!parent || parent.disposed)
    throw new Error("Rune scheduling requires a live native owner");
  const consumer = peekComponentContext();
  const inherited = runeNode();
  const inheritedSource = sourceNode(inherited);
  return createComponentScope(() => {
    const owner = getOwner()!;
    const group = node(owner, inherited ?? current);
    if (!inheritedSource) group.source = true;
    group.componentCap = inheritedSource ?? group;
    if (consumer?.active) group.consumer = consumer;
    onCleanup(() => {
      group.disposed = true;
      group.consumer = undefined;
    });
    owner.context = new Map(owner.context);
    owner.context.delete(cleanupOrderKey);
    owner.context.set(renderSchedulerKey, carrier(group));
    const previous = current;
    current = group;
    initializing++;
    try {
      return fn();
    } finally {
      initializing--;
      current = previous;
    }
  });
}
export function createRunePreEffect(fn: () => void | (() => void)): void {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
  const scheduler = getRenderScheduler();
  if (!scheduler) throw Error("Pre effects require withRuneScheduler");
  scheduler.pre(fn);
}
