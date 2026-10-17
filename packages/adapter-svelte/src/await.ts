/** Independent await-block control; no async SSR, hydration, or transitions. */
import {
  createComponentScope,
  createRenderEffect,
  createSignal,
  getOwner,
  getRenderScheduler,
  onCleanup,
  runWithOwner,
  untrack,
  type Accessor,
} from "@tschk/moonshine-dom/reactive";
import { mapArray } from "@tschk/moonshine-dom/control";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { flushRuneWork } from "./pre";
/** Compiler-facing awaited source type; erased from runtime output. */
export type AwaitValue<Read extends () => unknown> = Awaited<ReturnType<Read>>;
export type AwaitInput<T> = T | PromiseLike<T>;
export type AwaitBranches<T, R> = {
  pending?: () => R;
  then?: (value: Accessor<T>) => R;
  catch?: (error: Accessor<unknown>) => R;
};
function promise(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}
export function awaitBlock<T, R>(
  read: () => T | PromiseLike<T>,
  branches: AwaitBranches<T, R>,
  schedule?: (read: () => (R | undefined)[]) => Accessor<(R | undefined)[]>,
): Accessor<(R | undefined)[]> {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") {
    const input = read();
    let child: R | undefined;
    if (promise(input)) {
      input.then(null, () => {});
      child = branches.pending?.();
    } else child = branches.then?.(() => input);
    const result = child === undefined ? [] : [child];
    return () => result;
  }
  const outer = getOwner();
  if (!outer || outer.disposed || !getRenderScheduler())
    throw Error("Await blocks require a live owner and withRuneScheduler");
  return createComponentScope(() => {
    const owner = getOwner()!;
    let starting = true;
    let generation = 0,
      disposed = false;
    const [state, setState] = createSignal<
      "pending" | "then" | "catch" | undefined
    >(undefined);
    const [value, setValue] = createSignal<T | undefined>(undefined),
      [error, setError] = createSignal<unknown>(undefined);
    onCleanup(() => {
      disposed = true;
      generation++;
    });
    function alive(token: number) {
      return !disposed && !owner.disposed && generation === token;
    }
    createRenderEffect(() => {
      const token = ++generation;
      const input = read();
      if (!promise(input)) {
        setValue(() => input);
        setState("then");
        return;
      }
      let settled = false;
      const publish = (kind: "then" | "catch", next: unknown) => {
        if (!alive(token)) return;
        settled = true;
        try {
          runWithOwner(owner, () =>
            untrack(() => {
              if (kind === "then") setValue(() => next as T);
              else setError(() => next);
              setState(kind);
              if (!starting) flushRuneWork();
            }),
          );
        } catch (failure) {
          queueMicrotask(() => {
            throw failure;
          });
        }
      };
      input.then(
        (next) => publish("then", next),
        (reason) => publish("catch", reason),
      );
      queueMicrotask(() => {
        if (!settled && alive(token))
          runWithOwner(owner, () => {
            setState("pending");
            flushRuneWork();
          });
      });
    });
    const view = mapArray(
      () => {
        const current = state();
        return current === undefined ? [] : [current];
      },
      (kind) => {
        if (kind === "pending") return branches.pending?.();
        if (kind === "then") return branches.then?.(value as Accessor<T>);
        if (!branches.catch) throw untrack(error);
        return branches.catch(error);
      },
      undefined,
      schedule,
    );
    starting = false;
    return view;
  });
}
