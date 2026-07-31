/**
 * Stands in for an untouched TanStack Router app: the import below is a real
 * `@tanstack/react-router` specifier, resolved only by the alias plugin.
 */
import { createElement } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";

export function Page() {
  return createElement(
    "main",
    null,
    createElement(Link, { to: "/posts/$id", params: { id: "1" } }, "Post"),
    createElement(Outlet),
    useRouterState({ select: (state) => state.location.pathname }),
  );
}
