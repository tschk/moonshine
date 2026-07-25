"use client";

/**
 * @tschk/moonshine-next
 *
 * Next.js App Router is React. Use this package from Client Components
 * (`"use client"`) for signals and createApp. Server Components can still
 * import static helpers via `@tschk/moonshine/server` if needed.
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
