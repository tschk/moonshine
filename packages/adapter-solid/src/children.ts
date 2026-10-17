/** Memoized native child normalization; no JSX compiler instruction ABI. */
import { createMemo, type Accessor } from "@tschk/moonshine-dom/reactive";

export type ResolvedChildren<T> = T extends (...args: infer P) => infer R
  ? P extends []
    ? ResolvedChildren<R>
    : T
  : T extends readonly (infer U)[]
    ? Array<ChildValue<ResolvedChildren<U>>>
    : T;
export type ChildValue<T> = T extends readonly (infer U)[] ? ChildValue<U> : T;

function resolve(value: any): any {
  while (typeof value === "function" && value.length === 0) value = value();
  return Array.isArray(value)
    ? value.flatMap((child) => resolve(child))
    : value;
}
export function children<T>(fn: Accessor<T>): Accessor<ResolvedChildren<T>> & {
  toArray(): Array<ChildValue<ResolvedChildren<T>>>;
} {
  const source = createMemo(fn);
  const resolved = createMemo(() => resolve(source()));
  return Object.assign(resolved, {
    toArray: () => {
      const value = resolved();
      return Array.isArray(value) ? value : value == null ? [] : [value];
    },
  });
}
