"use client";

/**
 * @tschk/moonshine-astro
 *
 * Astro ships HTML first; hydrate interactive islands with React
 * (`client:load` / `client:visible`). Import moonshine from this package
 * inside those islands — same API as `@tschk/moonshine/react`.
 *
 * ```astro
 * ---
 * // Counter.tsx is a client island
 * import Counter from "../components/Counter";
 * ---
 * <Counter client:load />
 * ```
 *
 * ```tsx
 * // Counter.tsx
 * "use client";
 * import { createSignal, useSignal } from "@tschk/moonshine-astro";
 * ```
 */

export {
  createSignal,
  createMemo,
  createStore,
  batch,
} from "@tschk/moonshine";

export type { Memo, Signal, StoreSetter } from "@tschk/moonshine";

export {
  createApp,
  createMoonshineApp,
  useSignal,
  useStore,
} from "@tschk/moonshine/react";

export type { MoonshineApp, MoonshineAppOptions } from "@tschk/moonshine/react";

export { jsx, jsxs, Fragment } from "@tschk/moonshine/jsx-runtime";

export {
  Link,
  MoonshineRouter,
  matchPath,
  matchRoutes,
  navigate,
  useLocation,
  useNavigate,
  useParams,
} from "@tschk/moonshine/router";

export {
  createFullscreenFragment,
  useFragmentShader,
  wrapFragmentSource,
} from "@tschk/moonshine/shaders";

export { state, derived, effect } from "@tschk/moonshine/runes";
