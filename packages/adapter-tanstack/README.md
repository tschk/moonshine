# `@tschk/moonshine-tanstack`

The **runtime** client API of TanStack Router / TanStack Start reimplemented on
moonshine. It imports no TanStack code and lists none as a dependency:
`Link`, `useNavigate`, `useRouterState` and friends are ordinary React
components written against `@tschk/moonshine/router`.

```ts
// bundler alias
"@tanstack/react-router" -> "@tschk/moonshine-tanstack";
```

```tsx
import {
  Link,
  Outlet,
  useNavigate,
  useSearch,
} from "@tschk/moonshine-tanstack";
import { json, createServerRoute } from "@tschk/moonshine-tanstack/server";
```

| Subpath        | Contents                                        |
| -------------- | ----------------------------------------------- |
| `.`            | client API (components + hooks + search codecs) |
| `./link`       | `Link`, `Navigate`                              |
| `./navigation` | `useNavigate`, `useRouter`, `useRouterState`, … |
| `./outlet`     | `Outlet`, `OutletProvider`                      |
| `./server`     | `json`, `createServerRoute`, moonshine server   |
| `./client`     | moonshine signals + resources                   |

## Supported

- `Link` — `to` with `$param` and `$` splat interpolation, `params`, `search`
  (record or updater), `hash`, `replace`, `resetScroll`, `preload`
  (`"intent"` hover / `"viewport"` / `"render"`), `disabled`,
  `activeProps`/`inactiveProps`, `className` and `children` render callbacks,
  `data-status="active"` and `aria-current`. Navigation runs inside
  `startTransition`.
- `Navigate` — declarative redirect on mount.
- `Outlet` / `OutletProvider`.
- `useNavigate`, `useRouter`, `useRouterState` (with `select`), `useLocation`,
  `useParams`, `useSearch` (with `select`), `useCanGoBack`.
- `redirect`, `notFound`, `isRedirect`, `isNotFound` — same "return an error you
  throw" contract as TanStack.
- Search codecs: `parseSearch` / `stringifySearch` with TanStack's JSON value
  encoding, plus `buildHref` and `interpolatePath`.

## Not supported

These require the TanStack Vite plugin, the generated route tree, or TanStack's
own loader/RPC runtime, and are **not** provided:

- **Route definition and typing**: `createFileRoute`, `createRootRoute`,
  `createRoute`, `createRouter`, `RouterProvider`, `routeTree.gen.ts`, and the
  whole type-level route registry. Every `to`, `from` and `params` here is a
  plain string/record with no route-tree inference — `from` is accepted and
  ignored, `strict` has no effect.
- **Data loading**: `loader`, `useLoaderData`, `useLoaderDeps`, `beforeLoad`,
  `validateSearch`, `router.invalidate()` (a no-op here), `useMatch`,
  `useMatches`, `useMatchRoute`, `Await`, `defer`, pending/error components.
- **Server functions**: `createServerFn`, `createMiddleware`,
  `createStartHandler` — these depend on the build plugin's client/server
  splitting. Use `createServerRoute` on a moonshine route instead.
- **Transitions/blocking**: `useBlocker`, `Block`, `isTransitioning`
  (always `false`), `useRouterState().status` (always `"idle"`),
  `matches` (always empty).
- **History state**: `location.state` is always `{}`; there is no
  `useHistoryState`.
- `useSearch` reads `window.location.search`; on the server it is empty because
  moonshine's router signal carries the pathname only.

See [Moonshine README](../../README.md).
