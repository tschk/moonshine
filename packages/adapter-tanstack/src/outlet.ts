"use client";

/**
 * `<Outlet>` for TanStack-style nested layouts.
 *
 * Moonshine matches a flat route table, so the child element is supplied
 * explicitly by the layout rather than derived from a generated route tree.
 */
import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

const OutletContext = createContext<ReactNode>(null);

export type OutletProviderProps = {
  /** The child route element rendered where `<Outlet />` appears. */
  value: ReactNode;
  children?: ReactNode;
};

export function OutletProvider({
  value,
  children,
}: OutletProviderProps): ReactNode {
  return createElement(OutletContext.Provider, { value }, children);
}

export function Outlet(): ReactNode {
  return useContext(OutletContext);
}
