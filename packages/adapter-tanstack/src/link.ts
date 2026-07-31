"use client";

/**
 * TanStack Router's `<Link>` on the moonshine router.
 *
 * ```tsx
 * import { Link } from "@tschk/moonshine-tanstack";
 * ```
 */
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useTransition,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { navigate } from "@tschk/moonshine/router";
import { buildHref, type ToOptions } from "./location";
import { useParsedLocation } from "./location";

export type LinkRenderState = { isActive: boolean; isTransitioning: boolean };

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "className" | "style" | "children"
> &
  ToOptions & {
    activeOptions?: { exact?: boolean; includeHash?: boolean };
    /** `"intent"` warms the URL on hover, `"viewport"` when it scrolls in. */
    preload?: false | "intent" | "viewport" | "render";
    disabled?: boolean;
    activeProps?: Record<string, unknown>;
    inactiveProps?: Record<string, unknown>;
    className?: string | ((state: LinkRenderState) => string | undefined);
    style?: Record<string, unknown>;
    children?: ReactNode | ((state: LinkRenderState) => ReactNode);
  };

function isExternal(href: string, target?: string): boolean {
  if (target && target !== "_self") return true;
  return (
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href) ||
    href.startsWith("//") ||
    href.startsWith("#")
  );
}

const preloaded = new Set<string>();

function preloadOnce(url: string): void {
  if (preloaded.has(url) || typeof document === "undefined") return;
  preloaded.add(url);
  const tag = document.createElement("link");
  tag.rel = "prefetch";
  tag.href = url;
  document.head.append(tag);
}

function pathnameOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

export function Link({
  to,
  from: _from,
  params,
  search,
  hash,
  replace,
  resetScroll,
  activeOptions,
  preload = "intent",
  disabled,
  activeProps,
  inactiveProps,
  className,
  style,
  children,
  onClick,
  onMouseEnter,
  ...rest
}: LinkProps): ReactNode {
  const location = useParsedLocation();
  const href = buildHref({ to, params, search, hash }, location.search);
  const external = isExternal(href, rest.target);
  const ref = useRef<HTMLAnchorElement>(null);
  // Navigation runs in a transition so a slow subtree cannot block the click.
  const [, startTransition] = useTransition();
  const inert = external || disabled === true || preload === false;

  const warm = useCallback(() => {
    if (!inert) preloadOnce(href);
  }, [inert, href]);

  useEffect(() => {
    if (inert) return;
    if (preload === "render") {
      warm();
      return;
    }
    const node = ref.current;
    if (
      !node ||
      preload !== "viewport" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          warm();
          observer.disconnect();
        }
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [warm, preload, inert]);

  const target = pathnameOf(href);
  const isActive = activeOptions?.exact
    ? location.pathname === target
    : location.pathname === target ||
      location.pathname.startsWith(
        target.endsWith("/") ? target : `${target}/`,
      );
  const state: LinkRenderState = { isActive, isTransitioning: false };

  return createElement(
    "a",
    {
      ...rest,
      ...(isActive ? activeProps : inactiveProps),
      ref,
      href,
      style,
      className: typeof className === "function" ? className(state) : className,
      "data-status": isActive ? "active" : undefined,
      "aria-current": isActive ? "page" : undefined,
      onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        if (preload === "intent") warm();
      },
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey ||
          external ||
          disabled === true
        ) {
          return;
        }
        event.preventDefault();
        startTransition(() => {
          navigate(href, { replace });
          if (resetScroll !== false) globalThis.scrollTo?.(0, 0);
        });
      },
    },
    typeof children === "function" ? children(state) : children,
  );
}

export type NavigateProps = ToOptions;

/** Redirects on mount. */
export function Navigate(props: NavigateProps): null {
  const location = useParsedLocation();
  const href = buildHref(props, location.search);
  useEffect(() => {
    navigate(href, { replace: props.replace });
  }, [href, props.replace]);
  return null;
}
