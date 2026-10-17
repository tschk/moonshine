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
} from "@tschk/moonshine-dom/component";
import { flushComponentReferences } from "@tschk/moonshine-dom/component-instance";

function component(fn: () => void) {
  const frame = getComponentContext();
  if (typeof fn !== "function")
    throw new TypeError("Lifecycle callback must be a function");
  return frame;
}
export function onMounted(fn: () => void): void {
  const frame = component(fn);
  if (frame.mode === "ssr") return;
  const post = getRenderScheduler()?.post ?? queuePostCommit;
  onComponentReady(() =>
    post(() => {
      if (frame.owner.disposed) return;
      runWithOwner(frame.owner, () =>
        untrack(() => {
          flushComponentReferences();
          if (!frame.owner.disposed) withComponentConsumer(frame, fn);
        }),
      );
    }),
  );
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
