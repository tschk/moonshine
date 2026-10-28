import {
  createContext,
  createElement,
  Fragment,
  use,
  useContext,
  type ComponentType,
  type FunctionComponent,
  type ReactNode,
} from "react";
import { serializeIslandProps } from "./serialize";

export type IslandEntry = {
  id: string;
  specifier: string;
  /** The browser loads this island through a loader `moonshine build` registered. */
  registered?: boolean;
  props: Record<string, unknown>;
  hydrate?: "load" | "idle" | "visible";
};

export type IslandRegistry = {
  entries: Map<string, IslandEntry>;
};

type IslandLoader = () => Promise<unknown>;

const IslandContext = createContext<IslandRegistry | null>(null);
const hydrationStates = new WeakMap<Element, { hydrated: boolean }>();
const islandLoaders = new Map<string, IslandLoader>();

/**
 * Makes an island's module loadable in the browser under its server ID.
 * `island()` registers itself; a bundle may also register islands directly.
 */
export function registerIsland(id: string, loader: IslandLoader): void {
  islandLoaders.set(id, loader);
}

const ISLAND_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/;

function extractSpecifier(loader: () => Promise<unknown>): string {
  const source = loader.toString();
  const match = source.match(ISLAND_IMPORT_RE);
  return match ? match[1]! : source;
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }
  return hash.toString(36);
}

/**
 * `moonshine build` tags each `island(() => import("..."))` loader with an ID
 * derived from the imported file, identical in the server and client bundles.
 * Bundling rewrites the loader's source, so its text alone is not stable.
 */
function compiledIslandId(loader: () => Promise<unknown>): string | undefined {
  const id = (loader as { moonshineIslandId?: unknown }).moonshineIslandId;
  return typeof id === "string" ? id : undefined;
}

function getIslandId(loader: () => Promise<unknown>): string {
  return (
    compiledIslandId(loader) ??
    `moonshine-island-${hashString(extractSpecifier(loader))}`
  );
}

export const IslandProvider: FunctionComponent<{
  registry: IslandRegistry;
  children?: ReactNode;
}> = ({ registry, children }) => {
  return createElement(IslandContext.Provider, { value: registry }, children);
};

export function island<P>(
  loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
  options: { hydrate?: "load" | "idle" | "visible" } = {},
): FunctionComponent<P> {
  const hydrate = options.hydrate ?? "load";
  const id = getIslandId(loader) + (hydrate === "load" ? "" : `-${hydrate}`);
  const specifier = extractSpecifier(loader);
  const registered = compiledIslandId(loader) !== undefined;
  if (registered && typeof document !== "undefined") registerIsland(id, loader);
  const IslandComponent: FunctionComponent<P> = (props) => {
    const registry = useContext(IslandContext);
    const mod = use(loader());
    const Component = ((mod as { default?: ComponentType<P> }).default ??
      mod) as FunctionComponent<P>;
    const children = createElement(
      Component as FunctionComponent<unknown>,
      props as unknown as Record<string, unknown>,
    );
    if (registry) {
      registry.entries.set(id, {
        id,
        specifier,
        registered,
        props: (props ?? {}) as Record<string, unknown>,
        hydrate,
      });
    }
    return createElement(
      Fragment,
      null,
      createElement(
        "div",
        {
          "data-moonshine-island": id,
          "data-moonshine-hydrate": hydrate === "load" ? undefined : hydrate,
        },
        children,
      ),
      createElement(
        "script",
        {
          type: "application/json",
          "data-moonshine-island-props": id,
        },
        serializeIslandProps(props),
      ),
    );
  };
  return IslandComponent;
}

export function hydrateIslands(): () => void {
  if (typeof document === "undefined") return () => {};
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const modulesEl = document.querySelector(
    "script[data-moonshine-island-modules]",
  );
  const modules = modulesEl ? JSON.parse(modulesEl.textContent ?? "{}") : {};
  const markers = document.querySelectorAll("[data-moonshine-island]");
  for (const marker of Array.from(markers)) {
    if (hydrationStates.has(marker)) continue;
    const id = marker.getAttribute("data-moonshine-island");
    if (!id) continue;
    const sibling = marker.nextElementSibling;
    const propsEl =
      sibling?.getAttribute("data-moonshine-island-props") === id
        ? sibling
        : document.querySelector(`script[data-moonshine-island-props="${id}"]`);
    const props = propsEl ? JSON.parse(propsEl.textContent ?? "{}") : {};
    const specifier: unknown = modules[id];
    const load =
      islandLoaders.get(id) ??
      (typeof specifier === "string" ? () => import(specifier) : undefined);
    if (!load) continue;
    const state = { hydrated: false };
    hydrationStates.set(marker, state);
    cleanups.push(() => {
      if (!state.hydrated && hydrationStates.get(marker) === state)
        hydrationStates.delete(marker);
    });
    let started = false;
    const hydrate = () => {
      if (disposed || started || !marker.isConnected) return;
      started = true;
      return load()
        .then(async (mod) => {
          const client = await import("react-dom/client");
          const { hydrateRoot } = client.default ?? client;
          if (disposed || !marker.isConnected) return;
          const Component = ((mod as { default?: ComponentType<unknown> })
            .default ?? mod) as FunctionComponent<unknown>;
          hydrateRoot(
            marker,
            createElement(Component, props as Record<string, unknown>),
          );
          state.hydrated = true;
        })
        .catch((error: unknown) => {
          if (hydrationStates.get(marker) === state)
            hydrationStates.delete(marker);
          if (disposed) return;
          if (typeof reportError === "function") reportError(error);
          else console.error("Moonshine island hydration failed", error);
        });
    };
    const mode = marker.getAttribute("data-moonshine-hydrate");
    if (mode === "visible" && typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver((entries) => {
        if (disposed || !entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void hydrate();
      });
      observer.observe(marker);
      cleanups.push(() => observer.disconnect());
    } else if (mode === "idle") {
      if (typeof requestIdleCallback !== "undefined") {
        const handle = requestIdleCallback(
          () => {
            if (!disposed) void hydrate();
          },
          { timeout: 2000 },
        );
        cleanups.push(() => cancelIdleCallback(handle));
      } else {
        const handle = setTimeout(() => {
          if (!disposed) void hydrate();
        }, 1);
        cleanups.push(() => clearTimeout(handle));
      }
    } else {
      void hydrate();
    }
  }
  return () => {
    disposed = true;
    for (const cleanup of cleanups) cleanup();
  };
}

/** A route's page module and its layouts, outermost first. */
export type ClientRoute = { page: unknown; layouts: readonly unknown[] };

function componentOf(mod: unknown): FunctionComponent<Record<string, unknown>> {
  return ((mod as { default?: unknown }).default ?? mod) as FunctionComponent<
    Record<string, unknown>
  >;
}

/**
 * Builds the tree the server rendered for a route: the page wrapped in its
 * layouts, outermost first.
 */
export function routeElement(
  route: ClientRoute,
  props: { params: Record<string, string>; data: unknown },
): ReactNode {
  let element: ReactNode = createElement(componentOf(route.page), props);
  for (let i = route.layouts.length - 1; i >= 0; i--)
    element = createElement(
      componentOf(route.layouts[i]),
      { ...props },
      element,
    );
  return element;
}

/**
 * Hydrates an island-mode route that declares no islands of its own: its
 * interactivity lives in the page itself, so the whole route tree hydrates.
 * The renderer marks such a route with its ID, params and loader data; a
 * layout that renders `<html>` hydrates the document, as in Next.js and Waku.
 */
export async function hydrateRoute(
  routes: Readonly<Record<string, ClientRoute>>,
): Promise<void> {
  if (typeof document === "undefined") return;
  const payload = document.querySelector("script[data-moonshine-route-props]");
  if (!payload) return;
  const { id, params, data } = JSON.parse(payload.textContent ?? "{}") as {
    id: string;
    params: Record<string, string>;
    data: unknown;
  };
  const route = Object.hasOwn(routes, id) ? routes[id] : undefined;
  if (!route) return;
  const container =
    document.querySelector(`[data-moonshine-route]`) ?? document;
  const client = await import("react-dom/client");
  const { hydrateRoot } = client.default ?? client;
  hydrateRoot(container, routeElement(route, { params, data }));
}
