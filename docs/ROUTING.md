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

- `+layout.tsx` — wraps child routes.
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

## API reference

- `@tschk/moonshine-router` — `compilePattern`, `matchPath`, `createRouteGraph`,
  `matchRoutes`.
- `@tschk/moonshine-compiler` — `discoverRoutes`, `mergeRoutes`,
  `segmentToPattern`.
- `@tschk/moonshine-framework` — `defineRoute`, `RenderMode`, `RouteDefinition`.
