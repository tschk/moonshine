"use client";

/**
 * `<Link>`, `<NavLink>` and `<Navigate>` on the moonshine router.
 *
 * ```tsx
 * import { Link, NavLink } from "@tschk/moonshine-react-router";
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
import { toHref, type To } from "./location";
import { useLocation } from "./navigation";

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  to: To;
  replace?: boolean;
  preventScrollReset?: boolean;
  /** Accepted for source compatibility; history state is not tracked. */
  state?: unknown;
  reloadDocument?: boolean;
  /** `"intent"` warms the URL on hover, `"render"` on mount. */
  prefetch?: "none" | "intent" | "render" | "viewport";
  children?: ReactNode;
};

function isExternal(href: string, target?: string): boolean {
  if (target && target !== "_self") return true;
  return (
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href) ||
    href.startsWith("//") ||
    href.startsWith("#")
  );
}

const prefetched = new Set<string>();

function prefetchOnce(url: string): void {
  if (prefetched.has(url) || typeof document === "undefined") return;
  prefetched.add(url);
  const tag = document.createElement("link");
  tag.rel = "prefetch";
  tag.href = url;
  document.head.append(tag);
}

export function Link({
  to,
  replace,
  preventScrollReset,
  state: _state,
  reloadDocument,
  prefetch = "intent",
  children,
  onClick,
  onMouseEnter,
  ...rest
}: LinkProps): ReactNode {
  const href = toHref(to);
  const external = isExternal(href, rest.target);
  const ref = useRef<HTMLAnchorElement>(null);
  // Navigation runs in a transition so a slow subtree cannot block the click.
  const [, startTransition] = useTransition();
  const inert = external || reloadDocument === true || prefetch === "none";

  const warm = useCallback(() => {
    if (!inert) prefetchOnce(href);
  }, [inert, href]);

  useEffect(() => {
    if (inert) return;
    if (prefetch === "render") {
      warm();
      return;
    }
    const node = ref.current;
    if (
      !node ||
      prefetch !== "viewport" ||
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
  }, [warm, prefetch, inert]);

  return createElement(
    "a",
    {
      ...rest,
      ref,
      href,
      onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        if (prefetch === "intent") warm();
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
          reloadDocument === true
        ) {
          return;
        }
        event.preventDefault();
        startTransition(() => {
          navigate(href, { replace });
          if (preventScrollReset !== true) globalThis.scrollTo?.(0, 0);
        });
      },
    },
    children,
  );
}

export type NavLinkRenderState = { isActive: boolean; isPending: boolean };

export type NavLinkProps = Omit<
  LinkProps,
  "className" | "style" | "children"
> & {
  end?: boolean;
  caseSensitive?: boolean;
  className?: string | ((state: NavLinkRenderState) => string | undefined);
  style?: Record<string, unknown> | ((state: NavLinkRenderState) => never);
  children?: ReactNode | ((state: NavLinkRenderState) => ReactNode);
};

function pathnameOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

export function NavLink({
  end,
  caseSensitive,
  className,
  style,
  children,
  ...rest
}: NavLinkProps): ReactNode {
  const { pathname } = useLocation();
  const target = pathnameOf(toHref(rest.to));
  const [a, b] = caseSensitive
    ? [pathname, target]
    : [pathname.toLowerCase(), target.toLowerCase()];
  const isActive = end
    ? a === b || a === `${b}/`
    : a === b || a.startsWith(b.endsWith("/") ? b : `${b}/`);
  // Moonshine navigations resolve synchronously, so nothing is ever pending.
  const state: NavLinkRenderState = { isActive, isPending: false };

  return createElement(
    Link,
    {
      ...rest,
      "aria-current": isActive ? "page" : undefined,
      className:
        typeof className === "function"
          ? className(state)
          : (className ?? (isActive ? "active" : undefined)),
      style: (typeof style === "function" ? style(state) : style) as never,
    } as LinkProps,
    typeof children === "function" ? children(state) : children,
  );
}

export type NavigateProps = {
  to: To;
  replace?: boolean;
  state?: unknown;
};

/** Redirects on mount, the declarative form of `useNavigate()`. */
export function Navigate({ to, replace }: NavigateProps): null {
  const href = toHref(to);
  useEffect(() => {
    navigate(href, { replace });
  }, [href, replace]);
  return null;
}

export default Link;
