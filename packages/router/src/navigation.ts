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

function getBrowserPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export type MoonshineRouterInstance = {
  /** Navigate via History API (no full reload). */
  navigate: (to: string, options?: { replace?: boolean }) => void;
  /** Current pathname (reactive signal). */
  getLocation: () => string;
  /** Subscribe-friendly location signal. */
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
    location.set(url.pathname);
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

/** Current pathname (reactive; active or fallback router). */
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
  const pathname = props.path ?? browserPath;
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
export function Link(props: {
  href: string;
  children?: ReactNode;
  className?: string;
  replace?: boolean;
}): ReactNode {
  const nav = useNavigate();
  const href = safeHref(props.href);
  return createElement(
    "a",
    {
      href,
      className: props.className,
      onClick: (event: MouseEvent) => {
        if (
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
