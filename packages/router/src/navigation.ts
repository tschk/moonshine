import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { type RouteDefinition } from "@tschk/moonshine-framework";
import { createRouteGraph, matchRoutes, type RouteMatch } from "./graph.js";

import {
  createMoonshineRouter,
  getBrowserPath,
  splitLocation,
  type HistorySnapshot,
  type MoonshineRouterInstance,
} from "./runtime.js";

export type RouteParams = Record<string, string>;

export { createMoonshineRouter, splitLocation } from "./runtime.js";
export type { MoonshineRouterInstance } from "./runtime.js";

const INITIAL_HISTORY: HistorySnapshot = { action: "POP", state: null };

/** Mount tokens keep module-level navigation valid regardless of unmount order. */
const mountedRouters: Array<{ runtime: MoonshineRouterInstance }> = [];
/** Fallback when nothing mounted (tests / early navigate). */
const fallbackRouter = createMoonshineRouter();

function currentRouter(): MoonshineRouterInstance {
  return mountedRouters.at(-1)?.runtime ?? fallbackRouter;
}

/** Navigate via History API (targets active mounted router). */
export function navigate(
  to: string,
  options?: { replace?: boolean; state?: unknown },
): void {
  currentRouter().navigate(to, options);
}

/** The router `navigate` targets: the innermost mounted one, else the fallback. */
export function getRouter(): MoonshineRouterInstance {
  return currentRouter();
}

/** Current pathname and query (reactive; active or fallback router). */
export function getLocation(): string {
  return currentRouter().getLocation();
}

export function useLocation(): string {
  const ctx = useContext(RouterContext);
  const source = ctx?.runtime.location ?? fallbackRouter.location;
  return useSyncExternalStore(
    source.subscribe,
    () => source.peek(),
    () => ctx?.runtime.location.peek() ?? "/",
  );
}

/** Read scoped history without leaking process-level fallback state into SSR. */
export function useHistory(): HistorySnapshot {
  const ctx = useContext(RouterContext);
  const source = ctx?.runtime.history ?? fallbackRouter.history;
  return useSyncExternalStore(
    source.subscribe,
    source.peek,
    () => ctx?.runtime.history.peek() ?? INITIAL_HISTORY,
  );
}

type RouterContextValue = {
  match: RouteMatch<InternalRoute> | null;
  params: RouteParams;
  navigate: typeof navigate;
  runtime: MoonshineRouterInstance;
};

const RouterContext = createContext<RouterContextValue | null>(null);

export function useParams(): RouteParams {
  return useContext(RouterContext)?.params ?? {};
}

export function useNavigate(): typeof navigate {
  return useContext(RouterContext)?.navigate ?? navigate;
}

export function useRouter(): MoonshineRouterInstance {
  return useContext(RouterContext)?.runtime ?? fallbackRouter;
}

export type MoonshineRouteDefinition = Partial<RouteDefinition> & {
  path: string;
  element: ReactNode;
};

type InternalRoute = RouteDefinition & { element: ReactNode };

export type MoonshineRouterProps = {
  routes: MoonshineRouteDefinition[];
  /** Fallback when no route matches. */
  fallback?: ReactNode;
  /** Controlled path (defaults to browser location). */
  path?: string;
  /**
   * Optional external runtime. When omitted, each mount owns an isolated
   * instance (no cross-app global path bleed).
   */
  runtime?: MoonshineRouterInstance;
};

/**
 * Minimal file-ish router: declarative routes with `:param` segments.
 *
 * ```tsx
 * <MoonshineRouter
 *   routes={[
 *     { path: "/", element: <Home /> },
 *     { path: "/users/:id", element: <User /> },
 *   ]}
 *   fallback={<NotFound />}
 * />
 * ```
 */
export function MoonshineRouter(props: MoonshineRouterProps): ReactNode {
  const owned = useRef<MoonshineRouterInstance | null>(null);
  if (!owned.current && !props.runtime) {
    owned.current = createMoonshineRouter(props.path ?? getBrowserPath());
  }
  const runtime = props.runtime ?? owned.current!;

  const browserPath = useSyncExternalStore(
    runtime.location.subscribe,
    () => runtime.location.peek(),
    () => props.path ?? "/",
  );
  // Routes are matched on the pathname alone; the query rides along in the
  // signal only so that changing it re-renders.
  const pathname = splitLocation(props.path ?? browserPath)[0];

  // Compiling every pattern is a sizeable share of this component's render, and
  // the result depends only on the route list.
  const graph = useMemo(
    () =>
      createRouteGraph<InternalRoute>(
        props.routes.map((route) => ({
          ...route,
          id: route.id ?? route.path,
          file: route.file ?? "",
        })),
      ),
    [props.routes],
  );

  useEffect(() => {
    const mounted = { runtime };
    mountedRouters.push(mounted);
    const deactivate = () => {
      const index = mountedRouters.indexOf(mounted);
      if (index !== -1) mountedRouters.splice(index, 1);
    };
    if (props.path === undefined) {
      runtime.syncFromBrowser();
      const onPop = () => runtime.syncFromBrowser();
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
        deactivate();
      };
    }
    return deactivate;
  }, [runtime, props.path]);

  const matched = matchRoutes<InternalRoute>(graph, pathname);
  const value: RouterContextValue = {
    match: matched,
    params: matched?.params ?? {},
    navigate: runtime.navigate,
    runtime,
  };

  return createElement(
    RouterContext.Provider,
    { value },
    matched?.route.element ?? props.fallback ?? null,
  );
}

function stripControls(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:", "ftp:"]);

/**
 * A scheme-bearing href reaches the browser on modifier/middle click, where
 * the click handler deliberately does nothing, so `javascript:` and friends
 * would execute. Allow relative targets and known-safe schemes only.
 */
export function safeHref(href: string): string {
  // Browsers strip embedded control characters before parsing the scheme, so
  // strip them here too or "java\tscript:" would slip past the check.
  const trimmed = stripControls(href).trim();
  if (trimmed === "") return "#";
  // Leading "/", "?", "#" are unambiguously relative and cannot carry a scheme.
  if (/^[/?#]/.test(trimmed)) return trimmed;
  const scheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.exec(trimmed);
  if (!scheme) return trimmed;
  return SAFE_SCHEMES.has(scheme[0].toLowerCase()) ? trimmed : "#";
}

/** Anchor that uses client-side navigation. */
/**
 * Whether the browser should keep its own handling of `href`.
 *
 * A client router may only intercept a same-document navigation. Anything
 * carrying a scheme (`https:`, `mailto:`, `tel:`), a protocol-relative `//host`,
 * a bare fragment, or an explicit non-`_self` target belongs to the browser: it
 * opens a mail client, a new tab, or another origin, none of which this router
 * can do. A present `download` attribute also belongs to the browser; null
 * and false match React's omitted-attribute behavior.
 *
 * `safeHref` deliberately allows those schemes through — it only strips ones
 * that could execute. Allowing a scheme is not the same as claiming to handle
 * it, and conflating the two is how `<Link href="https://github.com/me">` came
 * to push `/me` onto the app's own origin: preventDefault ran, `navigate`
 * rebuilt the URL against `window.location.origin`, and the user landed on a
 * 404 instead of GitHub.
 *
 * Exported so the host adapters share one definition rather than each carrying
 * a copy — three of them already did, byte for byte, and the copy this module
 * lacked is exactly the one that was wrong.
 */
export function isExternal(
  href: string,
  target?: string,
  download?: unknown,
): boolean {
  if (download != null && download !== false) return true;
  if (target && target !== "_self") return true;
  return (
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(href) ||
    href.startsWith("//") ||
    href.startsWith("#")
  );
}

export function Link(props: {
  href: string;
  children?: ReactNode;
  className?: string;
  replace?: boolean;
  target?: string;
}): ReactNode {
  const nav = useNavigate();
  const href = safeHref(props.href);
  const external = isExternal(href, props.target);
  return createElement(
    "a",
    {
      href,
      className: props.className,
      target: props.target,
      onClick: (event: MouseEvent) => {
        if (
          external ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }
        event.preventDefault();
        nav(href, { replace: props.replace });
      },
    },
    props.children,
  );
}
