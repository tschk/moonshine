/**
 * Stands in for an untouched Waku app: the import below is a real
 * `waku/router/client` specifier, resolved only by the alias plugin.
 */
import { createElement } from "react";
import { Link, useRouter_UNSTABLE } from "waku/router/client";

export function Page() {
  return createElement(
    "main",
    null,
    createElement(Link, { to: "/about" }, "About"),
    useRouter_UNSTABLE().path,
  );
}
