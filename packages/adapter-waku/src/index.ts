"use client";

/**
 * @tschk/moonshine-waku
 *
 * Waku is React (RSC + client islands). Moonshine works natively —
 * mark interactive islands with `"use client"` and import signals/createApp
 * from `@tschk/moonshine/react`. No vnode translation needed.
 *
 * ```tsx
 * "use client";
 * import { createSignal, useSignal } from "@tschk/moonshine-waku";
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
  getLocation,
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
