/** DOM-free Solid control-flow components shared by `/solid`, `/ssr`, and `/web`. */
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import {
  ErrorBoundary as nativeErrorBoundary,
  Match as nativeMatch,
  Show as nativeShow,
  Switch as nativeSwitch,
  type MatchBranch,
} from "@tschk/moonshine-dom/control";
import {
  createComponentScope,
  createMemo,
  onCleanup,
  untrack,
  type Accessor,
} from "@tschk/moonshine-dom/reactive";
import { children as resolveChildren } from "./children";
import { registerErrorBoundaryReset } from "./primitives";

export type ConditionalProps<T, U, Keyed extends boolean = false> = {
  readonly when: T;
  readonly children:
    | U
    | ((
        value: Keyed extends true ? NonNullable<T> : Accessor<NonNullable<T>>,
      ) => U);
  readonly fallback?: U;
  readonly keyed?: Keyed;
};

function conditional<T, U>(
  props: ConditionalProps<T, U, boolean>,
  value: any,
): U {
  const child = props.children;
  return typeof child === "function" && child.length > 0
    ? (child as (value: any) => U)(value)
    : (child as U);
}

function keyedBranch<T, U>(
  props: ConditionalProps<T, U, boolean>,
): Accessor<MatchBranch<T, U>> {
  return createMemo(() => {
    const value = props.when;
    return nativeMatch({
      when: () => value,
      children: () => conditional(props, value),
    });
  });
}

const keyedBranches = /* @__PURE__ */ new WeakMap<
  object,
  Accessor<MatchBranch<any, any>>
>();

export function Show<T, U>(
  props: ConditionalProps<T, U, true> & { readonly keyed: true },
): Accessor<U | undefined>;
export function Show<T, U>(
  props: ConditionalProps<T, U>,
): Accessor<U | undefined>;
export function Show<T, U>(
  props: ConditionalProps<T, U, boolean>,
): Accessor<U | undefined> {
  return createComponentScope(() => {
    if (props.keyed) {
      const condition = createMemo(() => props.when);
      return createMemo(() => {
        const value = condition();
        return value
          ? untrack(() => conditional(props, value))
          : props.fallback;
      });
    }
    return nativeShow({
      when: () => props.when,
      children: (value) => conditional(props, value),
      fallback: () => props.fallback,
    });
  });
}

export function Match<T, U>(
  props: ConditionalProps<T, U, true> & { readonly keyed: true },
): MatchBranch<T, U>;
export function Match<T, U>(props: ConditionalProps<T, U>): MatchBranch<T, U>;
export function Match<T, U>(
  props: ConditionalProps<T, U, boolean>,
): MatchBranch<T, U> {
  if (props.keyed) {
    const branch = keyedBranch(props);
    const initial = untrack(branch);
    keyedBranches.set(initial, branch);
    return initial;
  }
  return nativeMatch({
    when: () => props.when,
    children: (value) => conditional(props, value),
  });
}

export type SwitchChild<U> =
  | MatchBranch<any, U>
  | boolean
  | readonly SwitchChild<U>[]
  | (() => SwitchChild<U>);

export function Switch<U>(props: {
  readonly children: SwitchChild<U>;
  readonly fallback?: U;
}): Accessor<U | undefined> {
  return createComponentScope(() => {
    const resolved = resolveChildren<any>(() => props.children);
    return nativeSwitch({
      children: () => {
        const value = resolved();
        const branches = Array.isArray(value) ? value : [value];
        return branches
          .filter((branch) => typeof branch !== "boolean")
          .map((branch) => keyedBranches.get(branch)?.() ?? branch);
      },
      fallback: () => props.fallback,
    });
  });
}

export function ErrorBoundary<T>(props: {
  readonly children: T;
  readonly fallback: T | ((error: Error, reset: () => void) => T);
}): Accessor<T | undefined> {
  if (peekComponentContext()?.mode === "ssr")
    throw new Error("Native Solid ErrorBoundary does not support SSR");
  return nativeErrorBoundary({
    children: () => props.children,
    get fallback() {
      const fallback = props.fallback;
      return (error: Error, reset: () => void) => {
        const unregister = registerErrorBoundaryReset(reset);
        onCleanup(unregister);
        return typeof fallback === "function" && fallback.length
          ? (fallback as (error: Error, reset: () => void) => T)(error, reset)
          : (fallback as T);
      };
    },
  });
}
