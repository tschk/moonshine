"use client";

/**
 * `next/link` implemented on the moonshine router.
 *
 * ```ts
 * import Link from "@tschk/moonshine-next/link";
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

export type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  replace?: boolean;
  scroll?: boolean;
  /**
   * Emits a `<link rel="prefetch">` browser hint. Moonshine has no RSC payload
   * to warm, so this is not Next's prefetch cache.
   */
  prefetch?: boolean | null;
  children?: ReactNode;
};

function hrefToString(href: LinkProps["href"]): string {
  if (typeof href === "string") return href;
  const pathname = href.pathname ?? "";
  const entries = Object.entries(href.query ?? {});
  if (entries.length === 0) return pathname;
  return `${pathname}?${new URLSearchParams(entries).toString()}`;
}

/** External and non-navigational targets must keep the browser's own handling. */
function isExternal(href: string, target?: string): boolean {
  if (target && target !== "_self") return true;
  return (
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href) ||
    href.startsWith("//") ||
    href.startsWith("#")
  );
}

const prefetched = new Set<string>();

/** Warms the browser cache for `url` once, the way Waku prefetches a route. */
function prefetchOnce(url: string): void {
  if (prefetched.has(url) || typeof document === "undefined") return;
  if (isCurrentUrl(url)) return;
  prefetched.add(url);
  const tag = document.createElement("link");
  tag.rel = "prefetch";
  tag.href = url;
  document.head.append(tag);
}

/** True when `url` resolves to the page already showing. */
function isCurrentUrl(url: string): boolean {
  if (typeof window === "undefined") return false;
  return new URL(url, window.location.href).href === window.location.href;
}

/**
 * Next always jumps to the top; Waku only scrolls when the destination is a
 * different document position. Following Waku keeps query-only navigations
 * (filters, tabs) from throwing the reader back to the top of the page.
 */
function shouldScrollByDefault(url: string): boolean {
  if (typeof window === "undefined") return false;
  const next = new URL(url, window.location.href);
  return (
    next.pathname !== window.location.pathname ||
    next.hash !== window.location.hash
  );
}

export default function Link({
  href,
  replace,
  scroll,
  prefetch = true,
  children,
  onClick,
  onMouseEnter,
  ...rest
}: LinkProps): ReactNode {
  const url = hrefToString(href);
  const external = isExternal(url, rest.target);
  const ref = useRef<HTMLAnchorElement>(null);
  // Navigation runs in a transition so a slow subtree cannot block the click.
  const [, startTransition] = useTransition();

  const warm = useCallback(() => {
    if (prefetch !== false && !external) prefetchOnce(url);
  }, [prefetch, external, url]);

  useEffect(() => {
    const node = ref.current;
    if (!node || prefetch === false || external) return;
    if (typeof IntersectionObserver === "undefined") return;
    // Waku's threshold: a one-pixel sliver of a link is not intent to visit it.
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
  }, [warm, prefetch, external]);

  return createElement(
    "a",
    {
      ...rest,
      ref,
      href: url,
      onMouseEnter: (event: MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        warm();
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
          external
        ) {
          return;
        }
        event.preventDefault();
        if (isCurrentUrl(url)) return;
        const jump = scroll ?? shouldScrollByDefault(url);
        startTransition(() => {
          navigate(url, { replace });
          if (jump) globalThis.scrollTo?.(0, 0);
        });
      },
    },
    children,
  );
}
