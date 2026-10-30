# Routing

Moonshine uses filesystem routes by default. Programmatic routes can be merged
with the same `RouteDefinition` contract.

## Filesystem conventions

A route tree lives under `src/routes` by default.

```text
src/routes/
  +layout.tsx
  +error.tsx
  +middleware.ts
  index.tsx
  about.tsx
  blog/
    [slug].tsx
    [slug].data.ts
  docs/
    [...path].tsx
  account/
    [[tab]].tsx
  api/
    health.server.ts
```

### Route files

- `index.tsx` maps to the directory path.
- `about.tsx` maps to `/about`.
- `blog/[slug].tsx` maps to `/blog/:slug`.
- `docs/[...path].tsx` maps to `/docs/*path`.
- `account/[[tab]].tsx` maps to `/account/:tab?`.
- `api/health.server.ts` maps to `/api/health`.

### Parameter syntax

| Pattern  | Example file          | Matches                                |
| -------- | --------------------- | -------------------------------------- |
| Static   | `about.tsx`           | `/about`                               |
| Dynamic  | `blog/[slug].tsx`     | `/blog/hello` (param `slug`)           |
| Optional | `account/[[tab]].tsx` | `/account` or `/account/settings`      |
| Rest     | `docs/[...path].tsx`  | `/docs/a/b/c` (param `path` = `a/b/c`) |

### Special files

Special files are prefixed with `+` and inherit through the route tree.

- `+layout.tsx` — wraps child routes. With the React renderer, the root
  layout may render the whole document (`<html>`, `<head>`, `<body>`); React
  then hoists `<title>`, `<meta>` and `<link>` elements from any page into that
  `<head>`, and Moonshine adds only its stylesheets and scripts.
- `+error.tsx` — error boundary; the nearest one wins.
- `+middleware.ts` — runs before/after child routes.

Special files do not become routes themselves and are skipped by discovery.

### Data files

A file named `[slug].data.ts` or `[slug].data.tsx` next to a route file is
attached as `dataFile`. It can export `loader`, `action`, `headers`, and cache
config.

### Suffix files

- `.server.ts` or `.server.tsx` forces the route to `api` mode.
- `.client.ts` or `.client.tsx` marks the route root as a client boundary and
  forces `spa` mode.

## Inheritance

For each route, the compiler walks from the routes root to the route directory.

- `layouts` and `middleware` are collected root-to-leaf.
- The nearest `+error` becomes `errorBoundary`.

Programmatic routes can also set `layouts`, `middleware`, and `errorBoundary`.

## Precedence

Route patterns are matched by segment score. Higher scores win.

```text
static (3) > dynamic (2) > optional (1) > rest (0)
```

This means `/blog/new` matches a static route before `/blog/:slug`, and
`/blog/:slug` matches before `/blog/*rest`.

The matcher also rejects ambiguous routes. Two routes with the same normalized
pattern and the same segment precedence throw an error at graph build time.

## Explicit route mode override

The compiler classifies each route automatically, but an explicit `mode` always
wins.

### From a programmatic route

```ts
import { defineRoute } from "@tschk/moonshine-framework";

export default defineRoute({
  id: "home",
  path: "/",
  file: "src/routes/index.tsx",
  mode: "static",
});
```

### Automatic classification

When `mode` is `auto` (or omitted), the compiler applies these rules in order:

1. Explicit `mode` on the route.
2. API handler exports (`handler` or `GET`/`POST`/...) select `api`.
3. `.client` boundary or `"use client"` directive selects `spa`.
4. Request-bound loaders, actions, cookies, headers, or server-only imports
   select `ssr`.
5. Interactive subtrees (event handlers or `island()` calls) select `island`.
6. Deterministic renderable routes select `static`.
7. Unresolved dynamic behavior falls back to `ssr` with an explanation.

Use `moonshine inspect` to see the resolved mode and reason for every route.

### Not-found page

A page route at `/404` — Waku's `pages/404.tsx`, Next.js's `pages/404` —
renders every `GET` or `HEAD` request no route matches, and every page
request whose loader returns or throws a bodiless 404 (Next.js's
`notFound()`), with status 404 and the page's own headers. An explicit `notFound` handler option takes
precedence; other methods get the plain 404.

### Hydration (React)

The client entry `moonshine build` emits hydrates every
`island(() => import("./X"))` the server rendered. The build tags each such
loader with an ID derived from the imported file and bundles the island into
the client entry, so islands need no separate module URL.

A route whose page is interactive itself — as every page is under Next.js or
Waku — sets `hydrate: "route"`. The browser then hydrates the whole route
tree, page and layouts, with the same params and loader data the server used.
A layout that renders `<html>` hydrates the document.

Navigations through the moonshine router — its `Link`, Waku's `Link` and
`useRouter` from `@tschk/moonshine-waku`, `navigate()`, Back and Forward —
then render the next `hydrate: "route"` page in place: the client fetches the
page's server HTML for its route ID, params and data and re-renders the same
root, so layout state survives. Any other page loads as a document.

```ts
defineRoute({
  id: "home",
  path: "/",
  file: "src/pages/index.tsx",
  hydrate: "route",
});
```

## API reference

- `@tschk/moonshine-router` — `compilePattern`, `matchPath`, `createRouteGraph`,
  `matchRoutes`.
- `@tschk/moonshine-compiler` — `discoverRoutes`, `mergeRoutes`,
  `segmentToPattern`.
- `@tschk/moonshine-framework` — `defineRoute`, `RenderMode`, `RouteDefinition`.
