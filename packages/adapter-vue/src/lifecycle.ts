/** Opt-in lifecycle for native component scopes, not Vue's component runtime ABI. */
import {
  getRenderScheduler,
  onBeforeDispose,
  onAfterDispose,
  queuePostCommit,
  runWithOwner,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import {
  getComponentContext,
  onComponentReady,
  withComponentConsumer,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { flushComponentReferences } from "@tschk/moonshine-dom/component-instance";
import { registerErrorCaptured, type ErrorCapturedHook } from "./error-context";
export type { ErrorCapturedHook } from "./error-context";

type FrameMountQueue = {
  before: Array<() => void>;
  mounted: Array<() => void>;
  beforeUpdate: Array<() => void>;
  updated: Array<() => void>;
  activated: Array<() => void>;
  deactivated: Array<() => void>;
  serverPrefetch: Array<() => Promise<unknown>>;
};
const frameQueues = /* @__PURE__ */ new WeakMap<
  ComponentContext,
  FrameMountQueue
>();

function component(fn: (...args: any[]) => unknown) {
  const frame = getComponentContext();
  if (typeof fn !== "function")
    throw new TypeError("Lifecycle callback must be a function");
  return frame;
}
function ensureMountQueue(frame: ComponentContext): FrameMountQueue {
  let queue = frameQueues.get(frame);
  if (!queue) {
    queue = {
      before: [],
      mounted: [],
      beforeUpdate: [],
      updated: [],
      activated: [],
      deactivated: [],
      serverPrefetch: [],
    };
    frameQueues.set(frame, queue);
    const post = getRenderScheduler()?.post ?? queuePostCommit;
    onComponentReady(() => {
      if (frame.owner.disposed) return;
      let failed = false;
      let failure: unknown;
      while (queue!.before.length > 0 && !frame.owner.disposed) {
        const callback = queue!.before.shift()!;
        try {
          runWithOwner(frame.owner, () =>
            untrack(() => {
              if (!frame.owner.disposed) withComponentConsumer(frame, callback);
            }),
          );
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
      if (!frame.owner.disposed) {
        for (const callback of queue!.mounted.splice(0)) {
          post(() => {
            if (frame.owner.disposed) return;
            runWithOwner(frame.owner, () =>
              untrack(() => {
                flushComponentReferences();
                if (!frame.owner.disposed)
                  withComponentConsumer(frame, callback);
              }),
            );
          });
        }
      }
      if (failed) throw failure;
    });
  }
  return queue;
}
export function onBeforeMount(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  ensureMountQueue(frame).before.push(fn);
}
export function onMounted(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  ensureMountQueue(frame).mounted.push(fn);
}
export function onBeforeUpdate(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  ensureMountQueue(frame).beforeUpdate.push(fn);
}
export function onUpdated(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  ensureMountQueue(frame).updated.push(fn);
}
export function onActivated(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  const queue = ensureMountQueue(frame);
  queue.activated.push(fn);
  queue.mounted.push(fn);
}
export function onDeactivated(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  ensureMountQueue(frame).deactivated.push(fn);
  onBeforeUnmount(fn);
}
export function onServerPrefetch(fn: () => Promise<any>): void {
  const frame = component(fn);
  if (frame.mode !== "ssr") return;
  if (!frame.owner.disposed) {
    void Promise.resolve(
      runWithOwner(frame.owner, () =>
        untrack(() => withComponentConsumer(frame, fn)),
      ),
    ).catch(() => {});
  }
}
export function onBeforeUnmount(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  runWithOwner(frame.owner, () =>
    onBeforeDispose(() => {
      runWithOwner(frame.owner, () =>
        untrack(() => withComponentConsumer(frame, fn)),
      );
    }),
  );
}
export function onUnmounted(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  const post = getRenderScheduler()?.post ?? queuePostCommit;
  runWithOwner(frame.owner, () =>
    onAfterDispose(() => {
      post(() => runWithOwner(frame.owner, () => untrack(fn)));
    }),
  );
}
export function onErrorCaptured<TError = unknown>(
  hook: ErrorCapturedHook<TError>,
): void {
  const frame = component(hook);
  registerErrorCaptured(frame, hook);
}
