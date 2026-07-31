/**
 * Stands in for an untouched react-router app: the import below is a real
 * `react-router` specifier, resolved only by the alias plugin.
 */
import { createElement } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

export function Page() {
  return createElement(
    "main",
    null,
    createElement(Link, { to: "/about" }, "About"),
    createElement(NavLink, { to: "/" }, "Home"),
    createElement(Outlet),
    useLocation().pathname,
  );
}
