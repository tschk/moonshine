"use client";

/**
 * `next/dynamic` on React.lazy.
 *
 * ```ts
 * const Chart = dynamic(() => import("./chart"), { ssr: false });
 * ```
 */
import {
  createElement,
  lazy,
  Suspense,
  type ComponentType,
  type ReactNode,
} from "react";

export type DynamicOptions = {
  /** `false` renders the fallback until the component mounts on the client. */
  ssr?: boolean;
  loading?: ComponentType;
};

type Loader<P> = () => Promise<
  { default: ComponentType<P> } | ComponentType<P>
>;

/** Next's `dynamic()` result also carries `preload()`, as does Solid's `lazy`. */
export type DynamicComponent<P> = ComponentType<P> & {
  preload(): Promise<{ default: ComponentType<P> }>;
};

export default function dynamic<P extends object>(
  loader: Loader<P>,
  options: DynamicOptions = {},
): DynamicComponent<P> {
  // Solid memoizes the import promise so `preload()` and the first render share
  // one in-flight request instead of importing the chunk twice.
  let pending: Promise<{ default: ComponentType<P> }> | undefined;
  const load = (): Promise<{ default: ComponentType<P> }> =>
    (pending ??= loader().then((mod) =>
      "default" in mod ? mod : { default: mod },
    ));

  const Lazy = lazy(load);
  const Loading = options.loading;
  const fallback: ReactNode = Loading ? createElement(Loading) : null;

  const DynamicComponent = (props: P): ReactNode => {
    if (options.ssr === false && typeof window === "undefined") return fallback;
    return createElement(Suspense, { fallback }, createElement(Lazy, props));
  };
  DynamicComponent.displayName = "DynamicComponent";
  DynamicComponent.preload = load;
  return DynamicComponent;
}
