export * from "@tschk/moonshine-dom/ssr";
import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";
import { createIrRenderer } from "./ir";
export type { CrepusNode, CrepusIr, RenderCrepusOptions } from "./ir";
export const { renderCrepusNodeSolid, renderCrepusIrSolid } =
  /* @__PURE__ */ createIrRenderer<SSRChild>(h);

/** Portals have no server output and never evaluate their children. */
export function Portal(_props: {
  children?: unknown;
  mount?: unknown;
  isSVG?: boolean;
  useShadow?: boolean;
}): undefined {}

import { splitProps } from "./props";
import type { DynamicComponent, DynamicProps } from "./dynamic";

/** Server selection is evaluated once; no browser runtime is imported. */
export function createDynamic<T extends DynamicComponent<SSRChild>>(
  component: () => T | undefined,
  props: DynamicProps<NoInfer<T>>,
): SSRChild {
  const value = component();
  if (typeof value === "function")
    return h(value, props as Record<string, unknown>);
  if (typeof value !== "string") return undefined;
  const attributes = Object.fromEntries(
    Object.keys(props as object).map((key) => [
      key,
      () => Reflect.get(props as object, key, props),
    ]),
  );
  return h(value, attributes);
}
export function Dynamic<T extends DynamicComponent<SSRChild>>(
  props: { component: T | undefined } & DynamicProps<NoInfer<T>>,
): SSRChild {
  const [, rest] = splitProps(props, ["component"]);
  return createDynamic(() => props.component, rest as DynamicProps<T>);
}
