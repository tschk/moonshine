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
};

export type IslandRegistry = {
  entries: Map<string, IslandEntry>;
};

const IslandContext = createContext<IslandRegistry | null>(null);

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
): FunctionComponent<P> {
  const id = getIslandId(loader);
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
      });
    }
    return createElement(
      Fragment,
      null,
      createElement("div", { "data-moonshine-island": id }, children),
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

export function hydrateIslands(): void {
  if (typeof document === "undefined") return;
  const modulesEl = document.querySelector(
    "script[data-moonshine-island-modules]",
  );
  const modules = modulesEl ? JSON.parse(modulesEl.textContent ?? "{}") : {};
  const markers = document.querySelectorAll("[data-moonshine-island]");
  for (const marker of Array.from(markers)) {
    const id = marker.getAttribute("data-moonshine-island");
    if (!id) continue;
    const propsEl = document.querySelector(
      `script[data-moonshine-island-props="${id}"]`,
    );
    const props = propsEl ? JSON.parse(propsEl.textContent ?? "{}") : {};
    const specifier = modules[id];
    if (!specifier) continue;
    import(specifier).then(async (mod) => {
      const { hydrateRoot } = await import("react-dom/client");
      const { createElement } = await import("react");
      const Component = ((mod as { default?: ComponentType<unknown> })
        .default ?? mod) as FunctionComponent<unknown>;
      hydrateRoot(
        marker,
        createElement(Component, props as Record<string, unknown>),
      );
    });
  }
}
