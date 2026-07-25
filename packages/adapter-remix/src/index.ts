"use client";

/**
 * @tschk/moonshine-remix
 *
 * Remix and React Router v7 are React. Prefer moonshine signals inside
 * client components / route modules that run in the browser. Keep loaders
 * and actions free of client-only hooks.
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

export { state, derived, effect } from "@tschk/moonshine/runes";
