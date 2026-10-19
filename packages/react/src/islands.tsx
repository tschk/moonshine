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
  props: Record<string, unknown>;
  hydrate?: "load" | "idle" | "visible";
};

export type IslandRegistry = {
  entries: Map<string, IslandEntry>;
};

const IslandContext = createContext<IslandRegistry | null>(null);
const hydrationStates = new WeakMap<Element, { hydrated: boolean }>();

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

function getIslandId(loader: () => Promise<unknown>): string {
  return `moonshine-island-${hashString(extractSpecifier(loader))}`;
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
          dangerouslySetInnerHTML: { __html: serializeIslandProps(props) },
        },
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
    const specifier = modules[id];
    if (!specifier) continue;
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
      return import(specifier)
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
