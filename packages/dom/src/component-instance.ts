/** Native exported-instance references; not a Svelte class/component ABI. */
import {
  getComponentContext,
  peekComponentContext,
  type ComponentContext,
} from "./component";
import {
  batch,
  getRenderScheduler,
  createComputed,
  onCleanup,
  queuePostCommit,
  runWithOwner,
  untrack,
  type Owner,
} from "./reactive";

export const componentRef = /* @__PURE__ */ Symbol("moonshine.component.ref");
/** Optional compiler-supplied paths retain tuple types; fixed cells keep zero arguments. */
export type ComponentReference<
  T extends object,
  Parts extends readonly unknown[] = [],
  Current = T,
> = {
  /** Opt into clearing after the enclosing DOM commit; default is a microtask. */
  cleanup?: "commit";
  /** Compiler opt-in: publish after child lifecycle posts, before ancestor posts.
   * Requires a render scheduler; default references publish before mounts. */
  publication?: "post";
  get: (...parts: Parts) => Current | null | undefined;
  set: (value: T | null, ...parts: Parts) => void;
} & (Parts extends readonly []
  ? { parts?: () => Parts }
  : { parts: () => Parts });
const exposed = new WeakSet<ComponentContext>();
const instancePrototype = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ Object.create(null),
);

const publications = new Set<() => void>();
let scheduled = false;
let flushing = false;

/** Commit all pending instance references before post-DOM lifecycle callbacks. */
export function flushComponentReferences(): void {
  if (flushing || !publications.size || peekComponentContext()?.active) return;
  flushing = true;
  let failed = false;
  let failure: unknown;
  let waves = 0;
  try {
    while (publications.size) {
      // Fresh publishers can perpetuate feedback without repeating a callback.
      if (++waves > 1000) {
        if (!failed)
          failure = new Error("Component reference update limit exceeded");
        failed = true;
        publications.clear();
        break;
      }
      // oxlint-disable-next-line unicorn/no-useless-spread -- Freeze the wave so newly queued callbacks count toward the limit.
      for (const publish of [...publications]) {
        if (!publications.delete(publish)) continue;
        try {
          publish();
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (failed) throw failure;
}

/** Preserve export descriptors in an opaque instance; publish and clear in microtasks. */
export function exposeComponent<T extends object>(exports: T): T {
  const frame = getComponentContext();
  if (
    exports === null ||
    typeof exports !== "object" ||
    (Object.getPrototypeOf(exports) !== Object.prototype &&
      Object.getPrototypeOf(exports) !== null)
  )
    throw new TypeError(
      "Component exports must be a plain object of named exports",
    );
  if (exposed.has(frame))
    throw new Error("Component exports may be exposed only once per instance");
  const instance = Object.create(
    instancePrototype,
    Object.getOwnPropertyDescriptors(exports),
  ) as T;
  if (frame.mode === "ssr") {
    exposed.add(frame);
    return instance;
  }
  const props = frame.props;
  const reference =
    props && (typeof props === "object" || typeof props === "function")
      ? Reflect.get(props, componentRef)
      : undefined;
  if (
    reference !== undefined &&
    (!reference ||
      typeof reference.get !== "function" ||
      typeof reference.set !== "function")
  )
    throw new TypeError("Component reference requires get and set functions");
  if (reference?.cleanup !== undefined && reference.cleanup !== "commit")
    throw new TypeError(
      "Component reference cleanup must be commit when provided",
    );
  const publication = reference?.publication;
  if (publication !== undefined && publication !== "post")
    throw new TypeError(
      "Component reference publication must be post when provided",
    );
  const enqueue = publisher(publication);
  exposed.add(frame);
  frame.capture?.(instance);
  if (!reference) return instance;
  if ("parts" in reference) {
    enqueue(bindOwnedReference(frame.owner, instance, reference, enqueue));
    return instance;
  }
  const binding = reference as ComponentReference<T>;
  let published = false;
  const clear = () =>
    untrack(() => {
      if (binding.get() === instance) binding.set(null);
    });
  const publish = () => {
    if (frame.owner.disposed) return;
    const commit = () =>
      untrack(() => {
        published = true;
        try {
          binding.set(instance);
        } catch (error) {
          try {
            clear();
          } catch {
            /* Preserve the publishing failure. */
          }
          throw error;
        }
      });
    runPublication(binding, commit);
  };
  onCleanup(() => {
    publications.delete(publish);
    if (published) scheduleClear(binding, clear);
  });
  enqueue(publish);
  return instance;
}

function enqueuePublication(publish: () => void): void {
  publications.add(publish);
  if (!scheduled && !flushing) {
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      flushComponentReferences();
    });
  }
}

function runPublication(
  binding: { cleanup?: "commit" },
  publish: () => void,
): void {
  if (binding.cleanup === "commit") batch(publish);
  else publish();
}

function scheduleClear(
  binding: { cleanup?: "commit" },
  clear: () => void,
  enqueueClear?: (clear: () => void) => void,
): void {
  if (enqueueClear) enqueueClear(clear);
  else if (binding.cleanup === "commit") queuePostCommit(clear);
  else queueMicrotask(clear);
}

export type OwnedReference<T extends object> = {
  cleanup?: "commit";
  publication?: "post";
  parts?: () => readonly unknown[];
  get: (...parts: unknown[]) => T | null | undefined;
  set: (value: T | null, ...parts: unknown[]) => void;
};
/** Internal shared target protocol; the caller chooses when parts initialize. */
export function bindOwnedReference<T extends object>(
  owner: Owner,
  instance: T,
  binding: OwnedReference<T>,
  enqueue: (fn: () => void) => void,
  policy?: {
    cleanup?: "commit";
    previousCheck?: "after-set";
    enqueueClear?: (clear: () => void) => void;
  },
): () => void {
  const cleanupPolicy = policy ?? binding;
  let current: readonly unknown[] | undefined;
  let next: readonly unknown[] | undefined;
  const clear = (parts: readonly unknown[]) =>
    untrack(() => {
      if (binding.get(...parts) === instance) binding.set(null, ...parts);
    });
  const publish = () => {
    if (owner.disposed || !next) return;
    const target = next;
    next = undefined;
    const commit = () =>
      untrack(() => {
        // Distinct path tuples can address the same actual cell.
        if (binding.get(...target) === instance) {
          current = target;
          return;
        }
        const previous = current;
        const ownedPrevious =
          previous &&
          (policy?.previousCheck === "after-set" ||
            binding.get(...previous) === instance);
        try {
          binding.set(instance, ...target);
        } catch (error) {
          try {
            clear(target);
          } catch {
            /* Preserve the publishing failure. */
          }
          throw error;
        }
        current = target;
        // The setter can dispose its component before the new path is recorded.
        if (owner.disposed)
          scheduleClear(
            cleanupPolicy,
            () => clear(target),
            policy?.enqueueClear,
          );
        if (ownedPrevious) clear(previous);
      });
    // A setter can synchronously dispose the component. Keep its final target
    // cleanup inside the same native commit, after ancestor teardown callbacks.
    runPublication(cleanupPolicy, commit);
  };
  const initialize = () => {
    if (owner.disposed) return;
    runWithOwner(owner, () =>
      createComputed(() => {
        const parts = binding.parts;
        if (parts !== undefined && typeof parts !== "function")
          throw new TypeError("Component reference parts must be a function");
        const values = parts ? parts.call(binding) : [];
        if (!Array.isArray(values))
          throw new TypeError("Component reference parts must return an array");
        next = Array.from(values);
        enqueue(publish);
      }),
    );
  };
  onCleanup(() => {
    publications.delete(initialize);
    publications.delete(publish);
    next = undefined;
    const last = current;
    if (last)
      scheduleClear(cleanupPolicy, () => clear(last), policy?.enqueueClear);
  });
  return initialize;
}

function publisher(publication?: "post"): (fn: () => void) => void {
  if (publication !== "post") return enqueuePublication;
  const scheduler = getRenderScheduler();
  if (!scheduler)
    throw new Error(
      "Post component reference publication requires an opt-in render scheduler",
    );
  return (fn) => scheduler.post(fn, true);
}
