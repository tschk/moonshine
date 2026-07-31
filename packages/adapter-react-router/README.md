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

## Not supported

These need react-router's own data router or build plugin and are **not**
provided — do not expect them to work by aliasing:

- **Data APIs**: `useLoaderData`, `useActionData`, `useFetcher`,
  `useRevalidator`, `useSubmit`, `useNavigation`, `useBlocker`,
  `unstable_usePrompt`, `defer`/`Await`. There is no loader/action lifecycle in
  moonshine; fetch in the component or on the moonshine server route.
- **Route configuration**: `createBrowserRouter`, `RouterProvider`, `Routes`,
  `Route`, `createRoutesFromElements`, nested route matching. Moonshine matches
  a flat route table via `MoonshineRouter`; `<Outlet>` is fed explicitly by
  `<OutletProvider>` rather than derived from nested config.
- **Progressive enhancement**: `<Form>`, `<Scripts>`, `<Meta>`, `<Links>`,
  `<ScrollRestoration>`, `<Await>`, `useFormAction`.
- **History state**: `location.state`, `location.key` stability and
  `useNavigationType` distinguishing PUSH/POP/REPLACE. `state` is always `null`
  and `useNavigationType()` always returns `"POP"`.
- **Error boundaries**: `useRouteError`, `errorElement`. `ErrorResponse` and
  `isRouteErrorResponse` exist as value types only.
- `useSearchParams` reads `window.location.search`; on the server it is empty
  because moonshine's router signal carries the pathname only.

See [Moonshine README](../../README.md).
