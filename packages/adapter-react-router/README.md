# `@tschk/moonshine-react-router`

The `react-router` / `@remix-run/react` **client API reimplemented on
moonshine**. It imports no react-router code and lists none as a dependency:
`Link`, `NavLink`, `useNavigate` and friends are ordinary React components
written against `@tschk/moonshine/router`.

An existing app can alias the import and drop the dependency:

```ts
// bunfig.toml / tsconfig paths / bundler alias
"react-router" -> "@tschk/moonshine-react-router"
"@remix-run/react" -> "@tschk/moonshine-react-router"
```

```tsx
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useSearchParams,
} from "@tschk/moonshine-react-router";
import { json, redirect } from "@tschk/moonshine-react-router/server";
```

| Subpath        | Contents                                                |
| -------------- | ------------------------------------------------------- |
| `.`            | full client API (components + hooks + response helpers) |
| `./link`       | `Link`, `NavLink`, `Navigate`                           |
| `./navigation` | `useNavigate`, `useLocation`, `useParams`, …            |
| `./outlet`     | `Outlet`, `OutletProvider`, `useOutletContext`          |
| `./responses`  | `json`, `data`, `redirect`, `ErrorResponse`             |
| `./server`     | response helpers + moonshine server handling            |
| `./client`     | moonshine signals + resources                           |

## Supported

- `Link` — `to` as string or partial path, `replace`, `preventScrollReset`,
  `reloadDocument`, `prefetch` (`"intent"` hover, `"render"`, `"viewport"`);
  modifier-clicks, external URLs and non-`_self` targets fall through to the
  browser. Navigation runs inside `startTransition`.
- `NavLink` — `end`, `caseSensitive`, `className`/`style`/`children` as render
  callbacks, `aria-current="page"`, default `.active` class.
- `Navigate` — declarative redirect on mount.
- `Outlet`, `OutletProvider`, `useOutlet`, `useOutletContext`.
- `useNavigate` (path or numeric delta), `useLocation`, `useParams`,
  `useSearchParams` (with setter), `useHref`, `useResolvedPath`,
  `useNavigationType`.
- `json`, `data`, `redirect`, `redirectDocument`, `replace`, `ErrorResponse`,
  `isRouteErrorResponse`.

`data(payload, init)` keeps the payload unencoded for native server renderers
and applies status/headers to the rendered response before `after` middleware.
Loader metadata merges in layout-to-page order; explicit action metadata wins.
Cookies remain separate fields. Returned or thrown `Response` objects retain
precedence, and thrown data wrappers are unsupported. This does not add client
loader hooks or the React Router data router.

## Not supported

These need react-router's own data router or build plugin and are **not**
provided — do not expect them to work by aliasing:

- **Data APIs**: `useLoaderData`, `useActionData`, `useFetcher`,
  `useRevalidator`, `useSubmit`, `useNavigation`, `useBlocker`,
  `unstable_usePrompt`, `defer`/`Await`. These client lifecycles are not wired in
  the adapter. Moonshine server routes have loaders/actions, but their results
  are not exposed through React Router client hooks.
- **Route configuration**: `createBrowserRouter`, `RouterProvider`, `Routes`,
  `Route`, `createRoutesFromElements`, nested route matching. Moonshine matches
  a flat route table via `MoonshineRouter`; `<Outlet>` is fed explicitly by
  `<OutletProvider>` rather than derived from nested config.
- **Progressive enhancement**: `<Form>`, `<Scripts>`, `<Meta>`, `<Links>`,
  `<ScrollRestoration>`, `<Await>`, `useFormAction`.
- **History keys**: `location.state` and PUSH/POP/REPLACE navigation types are
  supported, but `location.key` is URL-derived rather than unique per entry.
- **Error boundaries**: `useRouteError`, `errorElement`. `ErrorResponse` and
  `isRouteErrorResponse` exist as value types only.
- `useSearchParams` reads the owning router's pathname-plus-query signal,
  including its scoped server snapshot.

See [Moonshine README](../../README.md).
