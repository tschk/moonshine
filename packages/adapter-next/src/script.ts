/**
 * `next/script` as a plain `<script>`.
 *
 * ```ts
 * import Script from "@tschk/moonshine-next/script";
 * ```
 */
import {
  createElement,
  type ReactNode,
  type ScriptHTMLAttributes,
} from "react";

export type ScriptProps = ScriptHTMLAttributes<HTMLScriptElement> & {
  /** Next's loading hints map onto `async` / `defer`. */
  strategy?: "beforeInteractive" | "afterInteractive" | "lazyOnload" | "worker";
};

export default function Script({
  strategy = "afterInteractive",
  children,
  ...rest
}: ScriptProps): ReactNode {
  return createElement(
    "script",
    {
      ...rest,
      async: rest.async ?? strategy === "lazyOnload",
      defer: rest.defer ?? strategy === "afterInteractive",
    },
    children,
  );
}
