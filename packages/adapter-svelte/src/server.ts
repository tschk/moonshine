/** Independent Svelte 5 `svelte/server` `render(component, options)` runtime using Moonshine's native SSR & head collector. */
import { createComponent } from "@tschk/moonshine-dom/component";
import { renderWithHead } from "@tschk/moonshine-dom/head-ssr";
import { getOwner } from "@tschk/moonshine-dom/reactive";
import type { SSRChild } from "@tschk/moonshine-dom/ssr";
import { setRootIdPrefix } from "./prop-id";

export interface RenderOptions<
  Props extends Record<string, any> = Record<string, any>,
> {
  props?: Props;
  context?: Map<any, any>;
  idPrefix?: string;
}

export interface RenderOutput {
  body: string;
  head: string;
  html: string;
}

/**
 * Renders a native Svelte server component to `{ body, head, html }`,
 * supporting `props`, `context` (`getContext`/`setContext`), `idPrefix` (`$props.id()`),
 * `<svelte:head>` / `<title>`, and server `onDestroy` hooks.
 */
export function render<Props extends Record<string, any> = Record<string, any>>(
  component: (props: Props) => SSRChild,
  options?: RenderOptions<Props>,
): RenderOutput {
  if (typeof component !== "function") {
    throw new TypeError("svelte/server render() requires a component function");
  }
  if (options?.context !== undefined && !(options.context instanceof Map)) {
    throw new TypeError("svelte/server render() context must be a Map");
  }
  if (options?.idPrefix !== undefined && typeof options.idPrefix !== "string") {
    throw new TypeError("svelte/server render() idPrefix must be a string");
  }
  const props = (options?.props ?? {}) as Props;
  const { body, head } = renderWithHead(() => {
    const owner = getOwner();
    if (owner && options?.idPrefix) {
      setRootIdPrefix(owner, options.idPrefix);
    }
    return createComponent(component, props, "ssr", {
      contexts: options?.context,
    });
  });

  return {
    body,
    head,
    html: body,
  };
}
