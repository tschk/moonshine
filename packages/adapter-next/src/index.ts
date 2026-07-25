"use client";

/**
 * @tschk/moonshine-next
 *
 * Next.js App Router is React. Use this package from Client Components
 * (`"use client"`) for signals and createApp. Server Components can still
 * import static helpers via `@tschk/moonshine/server` if needed.
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
  matchPath,
  matchRoutes,
  navigate,
  useLocation,
  useNavigate,
  useParams,
} from "@tschk/moonshine/router";
