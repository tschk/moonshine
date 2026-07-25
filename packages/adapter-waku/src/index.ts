"use client";

/**
 * @tschk/moonshine-waku
 *
 * Waku is React (RSC + client islands). Moonshine works natively —
 * mark interactive islands with `"use client"` and import signals/createApp
 * from `@tschk/moonshine`. No vnode translation needed.
 *
 * ```tsx
 * "use client";
 * import { createSignal, useSignal } from "@tschk/moonshine-waku";
 * ```
 */

export {
  createApp,
  createMoonshineApp,
  createSignal,
  createMemo,
  createStore,
  useSignal,
  useStore,
  batch,
  jsx,
  jsxs,
  Fragment,
} from "@tschk/moonshine";

export type {
  MoonshineApp,
  MoonshineAppOptions,
  Memo,
  Signal,
  StoreSetter,
} from "@tschk/moonshine";

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
