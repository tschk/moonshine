import { createElement, type ReactElement } from "react";

/**
 * The two names that recur in the prose always point at the same places, so
 * they are components rather than repeated anchors with hand-copied `rel`.
 */

const EXTERNAL = { rel: "noopener noreferrer", target: "_blank" } as const;

export function Crepuscularity(): ReactElement {
  return createElement(
    "a",
    { href: "https://crepuscularity.tsc.hk", ...EXTERNAL },
    "crepuscularity",
  );
}

export function TscHk(): ReactElement {
  return createElement("a", { href: "https://tsc.hk", ...EXTERNAL }, "tsc.hk");
}
