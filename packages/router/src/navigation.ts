import { createSignal, type Signal } from "@tschk/moonshine";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { type RouteDefinition } from "@tschk/moonshine-framework";
import { createRouteGraph, matchRoutes, type RouteMatch } from "./graph.js";

export type RouteParams = Record<string, string>;

/**
 * The location the signal carries: pathname plus query.
 *
 * The query has to be in the signal, not read off `window.location` at render
 * time. A navigation that changes only the query would otherwise write the
 * same pathname back, notify no subscriber, and leave every `useSearchParams`
 * caller rendering the previous query — a tab bar driven by `?section=` would
 * change the URL and not the page. The hash stays out: it is still pushed to
 * history, but these hooks do not read it and including it would corrupt the
 * query when consumers split on the first "?".
 */
function getBrowserPath(): string {
  if (typeof window === "undefined") return "/";
  return (window.location.pathname || "/") + window.location.search;
}

/** Splits `"/a/b?x=1"` into its pathname and its raw query string. */
export function splitLocation(location: string): [string, string] {
  const index = location.indexOf("?");
  return index === -1
    ? [location, ""]
    : [location.slice(0, index), location.slice(index + 1)];
}

export type MoonshineRouterInstance = {
  /** Navigate via History API (no full reload). */
  navigate: (to: string, options?: { replace?: boolean }) => void;
  /** Current pathname and query (reactive signal). */
  getLocation: () => string;
  /** Subscribe-friendly location signal, carrying pathname and query. */
  location: Signal<string>;
  /** Sync signal from `window.location`. */
  syncFromBrowser: () => void;
};

/** Create an isolated router runtime (no shared global path). */
export function createMoonshineRouter(
  initialPath = getBrowserPath(),
): MoonshineRouterInstance {
  const location = createSignal(initialPath);

  const syncFromBrowser = () => {
    location.set(getBrowserPath());
  };

  const navigate = (to: string, options?: { replace?: boolean }) => {
    if (typeof window === "undefined") {
      location.set(to);
      return;
    }
    const url = new URL(to, window.location.origin);
    if (options?.replace) {
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } else {
      window.history.pushState({}, "", url.pathname + url.search + url.hash);
    }
    location.set(url.pathname + url.search);
  };

  return {
    navigate,
    getLocation: () => location(),
    location,
    syncFromBrowser,
  };
}

/** Active mounted router for module-level navigate/getLocation. */
let activeRouter: MoonshineRouterInstance | null = null;
/** Fallback when nothing mounted (tests / early navigate). */
const fallbackRouter = createMoonshineRouter();

function currentRouter(): MoonshineRouterInstance {
  return activeRouter ?? fallbackRouter;
}

/** Navigate via History API (targets active mounted router). */
export function navigate(to: string, options?: { replace?: boolean }): void {
  currentRouter().navigate(to, options);
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
    () => "/",
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
  const [ready, setReady] = useState(
    typeof window === "undefined" || props.path !== undefined,
  );

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
    const prev = activeRouter;
    activeRouter = runtime;
    if (props.path === undefined) {
      runtime.syncFromBrowser();
      setReady(true);
      const onPop = () => runtime.syncFromBrowser();
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
        activeRouter = prev;
      };
    }
    return () => {
      activeRouter = prev;
    };
  }, [runtime, props.path]);

  const matched = matchRoutes<InternalRoute>(graph, pathname);
  const value: RouterContextValue = {
    match: matched,
    params: matched?.params ?? {},
    navigate: runtime.navigate,
    runtime,
  };

  if (!ready && props.path === undefined && typeof window !== "undefined") {
    // Avoid hydration flicker on first client paint before popstate sync
  }

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
 * can do.
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
export function isExternal(href: string, target?: string): boolean {
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
