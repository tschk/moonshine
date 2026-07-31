import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createSignal, type Signal } from "./signal";

export type RouteParams = Record<string, string>;

export type RouteMatch = {
  path: string;
  pattern: string;
  params: RouteParams;
};

export type RouteDefinition = {
  /** Path pattern, e.g. `/`, `/about`, `/users/:id`. */
  path: string;
  element: ReactNode;
};

/** Compile `/users/:id` → matcher with named params. */
export function matchPath(pattern: string, pathname: string): RouteMatch | null {
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(pathname);

  if (patternParts.length !== pathParts.length) return null;

  const params: RouteParams = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }

  return { path: pathname, pattern, params };
}

function splitPath(path: string): string[] {
  return path
    .replace(/\/+$/, "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
}

/** Resolve first matching route definition. */
export function matchRoutes(
  routes: RouteDefinition[],
  pathname: string,
): (RouteMatch & { element: ReactNode }) | null {
  for (const route of routes) {
    const match = matchPath(route.path, pathname);
    if (match) return { ...match, element: route.element };
  }
  return null;
}

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
  match: (RouteMatch & { element: ReactNode }) | null;
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

export type MoonshineRouterProps = {
  routes: RouteDefinition[];
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
    owned.current = createMoonshineRouter(
      props.path ?? getBrowserPath(),
    );
  }
  const runtime = props.runtime ?? owned.current!;

  const browserPath = useSyncExternalStore(
    runtime.location.subscribe,
    () => runtime.location.peek(),
    () => props.path ?? "/",
  );
  const pathname = props.path ?? browserPath;
  const [ready, setReady] = useState(typeof window === "undefined" || props.path !== undefined);

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

  const matched = matchRoutes(props.routes, pathname);
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
    matched?.element ?? props.fallback ?? null,
  );
}

/** Anchor that uses client-side navigation. */
export function Link(props: {
  href: string;
  children?: ReactNode;
  className?: string;
  replace?: boolean;
}): ReactNode {
  const nav = useNavigate();
  return createElement(
    "a",
    {
      href: props.href,
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
        nav(props.href, { replace: props.replace });
      },
    },
    props.children,
  );
}
