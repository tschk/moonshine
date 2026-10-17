import type { StoreSource } from "./store-binding.js";
export interface WritableStoreSource<T> extends StoreSource<T> {
  set(value: T): void;
}
export function setStoreValue<T, V extends T>(
  store: WritableStoreSource<T>,
  value: V,
): V {
  store.set(value);
  return value;
}
export function mutateStoreValue<T, R>(
  store: WritableStoreSource<T>,
  expression: R,
  payload: NoInfer<T>,
): R {
  store.set(payload);
  return expression;
}
export function updateStoreValue<T>(
  store: WritableStoreSource<T>,
  old: NoInfer<T>,
  delta: 1 | -1,
  prefix: boolean,
): T {
  // Svelte's store update helpers use addition, including its string/BigInt behavior.
  const value = ((old as unknown as number) + delta) as T;
  store.set(value);
  return prefix ? value : old;
}
export function mutateServerStore<T, R>(
  reference: { get(store: StoreSource<T>): T | undefined },
  store: WritableStoreSource<T>,
  expression: R,
): R {
  store.set(reference.get(store)!);
  return expression;
}
