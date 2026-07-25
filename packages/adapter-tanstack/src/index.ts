"use client";

/**
 * @tschk/moonshine-tanstack
 *
 * TanStack Start and TanStack Router are React-first. Use moonshine signals
 * in client components; leave server functions / loaders on the server.
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
