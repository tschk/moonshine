import { createSignal, type Signal } from "@tschk/moonshine";
import { createMoonshineRouter, type MoonshineRouterInstance } from "./runtime";

export type RouteDataContext = { location: string; signal: AbortSignal };
export type RouteDataSeed<T> = { location: string; data: T };
export type RouteDataState<T> = {
  location: string;
  status: "pending" | "ready" | "errored";
  data: T | undefined;
  error: unknown;
};
export type DataRouter<T> = Omit<
  MoonshineRouterInstance,
  "data" | "invalidate" | "submit" | "submitting"
> & {
  data: Signal<RouteDataState<T>>;
  submitting: Signal<boolean>;
  invalidate(): Promise<T | undefined>;
  submit<R>(action: (context: RouteDataContext) => R | Promise<R>): Promise<R>;
  dispose(): void;
};

/** Opt-in client data ownership. Loaders/actions receive cancellation, not server code. */
export function createDataRouter<T>(
  load: (context: RouteDataContext) => T | Promise<T>,
  initialPath?: string,
  initialData?: RouteDataSeed<T>,
): DataRouter<T> {
  const runtime = createMoonshineRouter(initialPath);
  const location = runtime.location.peek();
  const seed = initialData?.location === location ? initialData : undefined;
  const data = createSignal<RouteDataState<T>>({
    location,
    status: seed ? "ready" : "pending",
    data: seed?.data,
    error: undefined,
  });
  const submitting = createSignal(false);
  let disposed = false;
  let generation = 0;
  let actionGeneration = 0;
  let controller: AbortController | undefined;
  let actionController: AbortController | undefined;

  let pending:
    ReturnType<typeof Promise.withResolvers<T | undefined>> | undefined;
  function invalidate(): Promise<T | undefined> {
    if (disposed) return Promise.reject(new Error("Data router is disposed"));
    const previous = pending;
    const current = Promise.withResolvers<T | undefined>();
    pending = current;
    previous?.resolve(current.promise);
    void runLoad(++generation).then(current.resolve, current.reject);
    return current.promise;
  }

  async function runLoad(token: number): Promise<T | undefined> {
    const previous = controller;
    const current = new AbortController();
    controller = current;
    previous?.abort();
    if (disposed || token !== generation) return undefined;
    const location = runtime.location.peek();
    data.set({
      location,
      status: "pending",
      data: data.peek().location === location ? data.peek().data : undefined,
      error: undefined,
    });
    if (disposed || token !== generation) return undefined;
    let value: T;
    try {
      value = await load({ location, signal: current.signal });
    } catch (error) {
      if (disposed || token !== generation) return undefined;
      data.set({ ...data.peek(), status: "errored", error });
      throw error;
    }
    if (disposed || token !== generation) return undefined;
    data.set({ location, status: "ready", data: value, error: undefined });
    return value;
  }

  function cancelAction() {
    const token = ++actionGeneration;
    const previous = actionController;
    actionController = undefined;
    previous?.abort();
    if (token === actionGeneration) submitting.set(false);
  }

  async function submit<R>(
    action: (context: RouteDataContext) => R | Promise<R>,
  ): Promise<R> {
    if (disposed) throw new Error("Data router is disposed");
    const token = ++actionGeneration;
    const previous = actionController;
    const current = new AbortController();
    actionController = current;
    previous?.abort();
    current.signal.throwIfAborted();
    if (disposed || token !== actionGeneration)
      throw new DOMException("Action superseded", "AbortError");
    const location = runtime.location.peek();
    submitting.set(true);
    try {
      current.signal.throwIfAborted();
      const result = await action({ location, signal: current.signal });
      if (!disposed) await invalidate().catch(() => {});
      return result;
    } finally {
      if (!disposed && token === actionGeneration) submitting.set(false);
    }
  }

  const unsubscribe = runtime.location.subscribe(() => {
    cancelAction();
    void invalidate().catch(() => {});
  });
  if (!seed) void invalidate().catch(() => {});
  return {
    ...runtime,
    data,
    submitting,
    invalidate,
    submit,
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      pending?.resolve(undefined);
      pending = undefined;
      unsubscribe();
      controller?.abort();
      cancelAction();
    },
  };
}
