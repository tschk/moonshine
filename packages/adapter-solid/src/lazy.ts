import { createComponent } from "./component-factory";
/** Independent client component loading; no Suspense, hydration or async SSR. */
import { createResource } from "@tschk/moonshine-dom/resource";
import {
  createMemo,
  getOwner,
  untrack,
  type Accessor,
} from "@tschk/moonshine-dom/reactive";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";

function guard() {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr")
    throw new Error("Native lazy components are client-only");
}

export function lazy<P, T>(
  loader: () => Promise<{ default: (props: P) => T }>,
): ((props: P) => Accessor<T | "">) & {
  preload: () => Promise<{ default: (props: P) => T }>;
} {
  let pending: Promise<{ default: (props: P) => T }> | undefined;
  let component: ((props: P) => T) | undefined;
  const load = () => {
    guard();
    if (!pending) {
      // Invoke before assigning: synchronous loader failures remain retryable.
      const result = untrack(loader);
      pending = Promise.resolve(result).then((module) => {
        const resolved = module?.default;
        if (typeof resolved !== "function")
          throw new TypeError(
            "Lazy modules require a default component function",
          );
        component = resolved;
        return module;
      });
      // Observe the internal cache; callers still receive its rejecting promise.
      void pending.catch(() => {});
    }
    return pending;
  };
  return Object.assign(
    (props: P) => {
      guard();
      const owner = getOwner();
      if (!owner || owner.disposed)
        throw new Error(
          "Lazy component invocation requires a live native owner",
        );
      if (component)
        return createMemo(() => createComponent(component!, props));
      const [module] = createResource(load);
      return createMemo(() => {
        const ready = module();
        return ready ? createComponent(component!, props) : "";
      });
    },
    { preload: load },
  );
}
