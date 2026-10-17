/** Internal opt-in render/structural/post phase carrier inherited through owner context. */
import type { createMemo } from "./reactive";
export const renderSchedulerKey = /* @__PURE__ */ Symbol(
  "native-render-scheduler",
);
export interface RenderScheduler {
  effect<T>(fn: (previous: T) => T, initial: T): void;
  memo: typeof createMemo;
  /** Compiler reference jobs defer their reactive render work until current posts finish. */
  post(fn: () => void, referencePublication?: true): void;
  pre(fn: () => void | (() => void)): void;
  component<T>(fn: () => T): T;
  /** Called after a keyed control updates retained index accessors. */
  reorder(): void;
  /** The existing control index supplies live logical sibling order. */
  branch<T>(fn: () => T, order?: () => number): T;
}
