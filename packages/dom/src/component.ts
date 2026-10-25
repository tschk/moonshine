import { cleanupOrderKey } from "./cleanup-order";
/** Native component ownership/context ABI; no source-language compiler runtime. */
import {
  cleanupComputationKey,
  createComponentScope,
  getOwner,
  getRenderScheduler,
  type Owner,
} from "./reactive";

const componentKey = /* @__PURE__ */ Symbol("moonshine.component");
const contextSourceKey = /* @__PURE__ */ Symbol(
  "moonshine.component.contextSource",
);
type ComponentContextSource = ComponentContext & {
  readonly [contextSourceKey]?: ReadonlyMap<unknown, unknown>;
};
/** Explicit per-instance event listener map; interpreted by compiler adapters. */
export const componentEvents = /* @__PURE__ */ Symbol(
  "moonshine.component.events",
);
export interface ComponentContext<P = unknown> {
  readonly props: P;
  readonly owner: Owner;
  readonly mode: "dom" | "ssr";
  readonly contexts: ReadonlyMap<unknown, unknown>;
  active: boolean;
  ready?: Array<() => void>;
  capture?: (instance: object) => void;
}
export function peekComponentContext(): ComponentContext | undefined {
  return getOwner()?.context?.get(componentKey) as ComponentContext | undefined;
}
export function getComponentContext(): ComponentContext {
  const frame = peekComponentContext();
  const owner = getOwner();
  if (
    !frame?.active ||
    !owner ||
    (owner.disposed && !owner.context?.has(cleanupComputationKey))
  )
    throw new Error(
      "Component context is available only during native component initialization",
    );
  return frame;
}
export interface ComponentInvocation {
  contexts?: ReadonlyMap<unknown, unknown>;
  capture?: (instance: object) => void;
}
export function createComponent<P, T>(
  fn: (props: P) => T,
  props: P,
  mode: "dom" | "ssr",
  options?: ComponentInvocation,
): T {
  const inherited = peekComponentContext() as
    ComponentContextSource | undefined;
  return createComponentScope(() => {
    const owner = getOwner()!;
    let captured = false;
    let contexts: Map<unknown, unknown> | undefined;
    const frame: ComponentContext<P> & ComponentContextSource = {
      props,
      owner,
      mode,
      // Skip untouched ancestors without initializing their context maps.
      get [contextSourceKey]() {
        return (
          contexts ??
          options?.contexts ??
          (inherited &&
            (contextSourceKey in inherited
              ? inherited[contextSourceKey]
              : inherited.contexts))
        );
      },
      get contexts() {
        return (contexts ??= new Map(frame[contextSourceKey]));
      },
      active: true,
    };
    if (options?.capture)
      frame.capture = (instance) => {
        captured = true;
        options.capture!(instance);
      };
    owner.context = new Map(owner.context);
    // Native component frames start their own default cleanup policy.
    owner.context.delete(cleanupOrderKey);
    owner.context.set(componentKey, frame);
    let result: T;
    try {
      const scheduler = getRenderScheduler();
      result = scheduler ? scheduler.component(() => fn(props)) : fn(props);
    } finally {
      frame.active = false;
    }
    if (!captured && !owner.disposed) options?.capture?.(Object.create(null));
    const ready = frame.ready?.splice(0);
    if (ready && !owner.disposed) {
      let failed = false;
      let failure: unknown;
      for (const callback of ready) {
        if (owner.disposed) break;
        try {
          callback();
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
      if (failed) throw failure;
    }
    return result;
  });
}
/** Internal setup completion, before the enclosing component scope returns. */
export function onComponentReady(fn: () => void): void {
  (getComponentContext().ready ??= []).push(fn);
}

export function getContext<T>(key: unknown): T | undefined {
  return getComponentContext().contexts.get(key) as T | undefined;
}
export function setContext<T>(key: unknown, value: T): T {
  (getComponentContext().contexts as Map<unknown, unknown>).set(key, value);
  return value;
}
export function hasContext(key: unknown): boolean {
  return getComponentContext().contexts.has(key);
}
/** Snapshot: callers cannot mutate an inactive component's context through it. */
export function getAllContexts(): Map<unknown, unknown> {
  return new Map(getComponentContext().contexts);
}

/** Internal compiler adapter boundary: retain the invocation owner/attempt. */
export function withComponentConsumer<T>(
  frame: ComponentContext,
  fn: () => T,
): T {
  return withConsumer(frame, fn, false);
}
/** Internal historical computation boundary; current owner stays disposed if already stopped. */
export function withComponentCleanupConsumer<T>(
  frame: ComponentContext,
  fn: () => T,
): T {
  return withConsumer(frame, fn, true);
}
function withConsumer<T>(
  frame: ComponentContext,
  fn: () => T,
  cleanup: boolean,
): T {
  const owner = getOwner();
  if (!owner || (!cleanup && (owner.disposed || frame.owner.disposed)))
    throw new Error("Live component consumer required");
  const context = owner.context,
    active = frame.active,
    wasDisposed = owner.disposed;
  if (!cleanup && active && context?.get(componentKey) === frame) {
    try {
      return fn();
    } finally {
      frame.active = active;
      owner.context =
        owner.disposed && !wasDisposed && !context.has(cleanupComputationKey)
          ? undefined
          : context;
    }
  }
  owner.context = new Map(context);
  owner.context.set(componentKey, frame);
  if (cleanup) owner.context.set(cleanupComputationKey, true);
  frame.active = true;
  try {
    return fn();
  } finally {
    frame.active = active;
    owner.context =
      owner.disposed && !wasDisposed && !context?.has(cleanupComputationKey)
        ? undefined
        : context;
  }
}
