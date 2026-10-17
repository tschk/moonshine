# `@tschk/moonshine-waku`

Waku's **client router API** reimplemented on moonshine. It imports no Waku code
and lists none as a dependency: `Link` and the `*_UNSTABLE` hooks are ordinary
React written against `@tschk/moonshine/router`.

```ts
// bundler alias
"waku/router/client" -> "@tschk/moonshine-waku";
```

```tsx
import {
  Link,
  useRouter_UNSTABLE,
  useParams_UNSTABLE,
} from "@tschk/moonshine-waku";
import { json } from "@tschk/moonshine-waku/server";
```

| Subpath    | Contents                               |
| ---------- | -------------------------------------- |
| `.`        | client router API                      |
| `./router` | hooks, route matching, `prefetchRoute` |
| `./link`   | `Link`                                 |
| `./server` | `json` + moonshine server handling     |
| `./client` | moonshine signals + resources          |

## Supported

- `Link` — `to` as string or `{ pathname, search }`, `scroll`,
  `unstable_instant`, `unstable_prefetchOnEnter`, `unstable_prefetchOnView`
  (IntersectionObserver at 0.1 threshold), `unstable_startTransition`.
  Modifier-clicks, external URLs, fragments, non-self targets and downloads
  fall through to the browser without route prefetch. Internal navigation runs
  inside `startTransition`.
- `useRouter_UNSTABLE` / `useRouter` — spreads the current `{ path, query, hash }`
  route plus `push`, `replace`, `reload`, `back`, `forward`, `prefetch`.
- `useRoute` — Waku's route shape, with the trailing-slash `path` convention.
- `useParams_UNSTABLE({ from })` — `[slug]` and `[...rest]` matching, `null` when
  the current path does not match.
- `useSearch_UNSTABLE({ from })`, `useSetSearch_UNSTABLE({ from })`.
- `useNavigationStatus_UNSTABLE()` — `{ pending }` inside a `Link`, `{}` outside.
- `matchRouteParams`, `normalizePath`, `toHref`, `prefetchRoute`.

## Not supported

Waku's remaining surface is bound to its RSC pipeline and Vite plugin, and is
**not** provided:

- **RSC**: `Slice`, `Children`, `unstable_defineRouter`, `createPages`,
  `fsRouter`, `INTERNAL_ServerRouter`, `Router`, `ServerRoot`, the RSC wire
  format and its element/slot streaming. Moonshine renders on its own React
  renderer; there is no server-component payload to fetch.
- **Server APIs**: `waku/server` (`getContext`, `unstable_getPlatformObject`),
  `waku/config`, middleware, `unstable_cache`.
- **Typed search codecs**: `Unstable_SearchCodecsProvider` and route-level codec
  registration. `useSearch_UNSTABLE` returns a plain `URLSearchParams` instead of
  a codec-parsed object, and `useSetSearch_UNSTABLE` takes a plain string record.
- **Route prefetch**: `prefetch` warms the browser cache with
  `<link rel="prefetch">`; it does not fetch and cache an RSC payload, so
  `unstable_instant` navigation is a plain synchronous navigation.
- **Base path**: `WAKU_CONFIG_BASE_PATH` is not applied to hrefs.
- Search comes from the scoped pathname-plus-query signal. Hash follows browser
  hash/history events and owning-router navigation; its SSR snapshot is empty.

See [Moonshine README](../../README.md).

Route hashes come from the owning Moonshine runtime's fragment signal.
Unrelated renders and remounts retain that runtime's fragment after another
router navigates. Global browser hash/pop events still update mounted
consumers. SSR hash snapshots stay empty. Chromium checks cover independent
navigation, remounts and real back/forward behavior.
