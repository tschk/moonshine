"use client";

/**
 * `<Outlet>` for nested layouts.
 *
 * Moonshine's router matches a flat route table, so the child element is
 * supplied explicitly by the layout instead of being derived from a nested
 * route config.
 *
 * ```tsx
 * <OutletProvider value={<Page />}>
 *   <Layout />
 * </OutletProvider>
 * ```
 */
import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

export type OutletContextValue = {
  element: ReactNode;
  context: unknown;
};

const OutletContext = createContext<OutletContextValue>({
  element: null,
  context: undefined,
});

export type OutletProviderProps = {
  /** The child route element rendered where `<Outlet />` appears. */
  value: ReactNode;
  /** Value returned by `useOutletContext()` inside the child. */
  context?: unknown;
  children?: ReactNode;
};

export function OutletProvider({
  value,
  context,
  children,
}: OutletProviderProps): ReactNode {
  return createElement(
    OutletContext.Provider,
    { value: { element: value, context } },
    children,
  );
}

export type OutletProps = { context?: unknown };

export function Outlet({ context }: OutletProps = {}): ReactNode {
  const outlet = useContext(OutletContext);
  if (context === undefined) return outlet.element;
  return createElement(
    OutletContext.Provider,
    { value: { element: outlet.element, context } },
    outlet.element,
  );
}

export function useOutlet(): ReactNode {
  return useContext(OutletContext).element;
}

export function useOutletContext<T = unknown>(): T {
  return useContext(OutletContext).context as T;
}
