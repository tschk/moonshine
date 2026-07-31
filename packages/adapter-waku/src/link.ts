"use client";

/**
 * Waku's `<Link>` on the moonshine router.
 *
 * ```tsx
 * import { Link } from "@tschk/moonshine-waku/link";
 * ```
 */
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { navigate } from "@tschk/moonshine/router";
import {
  NavigationStatusContext,
  prefetchRoute,
  toHref,
  type LinkTo,
} from "./router";

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  to: LinkTo;
  /** `false` keeps the scroll position after navigating. */
  scroll?: boolean;
  /** Skips the transition and navigates synchronously. */
  unstable_instant?: boolean;
  unstable_prefetchOnEnter?: boolean;
  unstable_prefetchOnView?: boolean;
  unstable_startTransition?: (fn: () => void) => void;
  children?: ReactNode;
};

function isAltClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

export function Link({
  to,
  scroll,
  unstable_instant,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
  children,
  onClick,
  onMouseEnter,
  ...rest
}: LinkProps): ReactNode {
  const href = toHref(to);
  const ref = useRef<HTMLAnchorElement>(null);
  const [isPending, startTransition] = useTransition();
  const run = unstable_startTransition ?? startTransition;

  const warm = useCallback(() => prefetchRoute(href), [href]);

  useEffect(() => {
    const node = ref.current;
    if (
      !unstable_prefetchOnView ||
      !node ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            warm();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [unstable_prefetchOnView, warm]);

  const status = useMemo(() => ({ pending: isPending }), [isPending]);

  const anchor = createElement(
    "a",
    {
      ...rest,
      ref,
      href,
      onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => {
        if (unstable_prefetchOnEnter) warm();
        onMouseEnter?.(event);
      },
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || isAltClick(event)) return;
        event.preventDefault();
        warm();
        const go = () => {
          navigate(href);
          if (scroll !== false) globalThis.scrollTo?.(0, 0);
        };
        if (unstable_instant) go();
        else run(go);
      },
    },
    children,
  );

  return createElement(
    NavigationStatusContext.Provider,
    { value: status },
    anchor,
  );
}

export default Link;
