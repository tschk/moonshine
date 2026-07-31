# moonshine

Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
signal kernel. Start with signals; add only the routing, rendering, server,
compiler, and deployment layers your project needs.

```bash
bun run moonshine -- new my-app
bun run moonshine -- build
bun run moonshine -- inspect
```

## What you get

| Package                              | Role                                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| `@tschk/moonshine`                   | Signal-only kernel                                            |
| `@tschk/moonshine-router`            | Renderer-neutral route graph and matcher                      |
| `@tschk/moonshine-server`            | Request pipeline, loaders, actions, middleware, static files  |
| `@tschk/moonshine-compiler`          | Filesystem discovery, analysis, bundles, and manifest         |
| `@tschk/moonshine-framework`         | Public contracts: routes, manifest, renderer, adapter, config |
| `@tschk/moonshine-react`             | React SSR, streaming, islands, and hydration                  |
| `@tschk/moonshine-solid`             | Solid renderer and signal bridges                             |
| `@tschk/crepus-moonshine`            | Crepus View IR rendering and emit integration                 |
| `@tschk/moonshine-cli`               | `new`, `dev`, `build`, `preview`, `inspect`                   |
| `@tschk/moonshine-deploy-bun`        | Bun server deployment                                         |
| `@tschk/moonshine-deploy-node`       | Node HTTP deployment                                          |
| `@tschk/moonshine-deploy-cloudflare` | Cloudflare Workers deployment                                 |
| `@tschk/moonshine-deploy-vercel`     | Vercel functions, edge, and static output                     |

`@tschk/moonshine` still re-exports optional framework pieces on compatibility
subpaths (`/react`, `/runes`, `/router`, `/server`, `/shaders`) during the
`0.3.x` line.

## Host adapters

Optional adapters expose real host libraries (peer-installed) plus moonshine
signal bridges. See each adapter's README for subpaths.

### Next

```ts
import { createSignal, useSignal } from "@tschk/moonshine-next";
import { useRouter, usePathnameSignal } from "@tschk/moonshine-next/navigation";
import Link from "@tschk/moonshine-next/link";
import Image from "@tschk/moonshine-next/image";
import { headers } from "@tschk/moonshine-next/headers";
import { useFragmentShader } from "@tschk/moonshine-next/shaders";
import { moonshineRoute, moonshineJson } from "@tschk/moonshine-next/server";
```

### Remix

```ts
import { useLoaderSignal } from "@tschk/moonshine-remix";
import { Link, useFetcher, useLoaderData } from "@tschk/moonshine-remix/react";
import {
  useFetcherSignals,
  useLocationSignal,
} from "@tschk/moonshine-remix/hooks";
```

### TanStack

```ts
import { createQuerySignal } from "@tschk/moonshine-tanstack";
import { useQuery, useQuerySignal } from "@tschk/moonshine-tanstack/query";
import {
  Link,
  useNavigate,
  usePathnameSignal,
} from "@tschk/moonshine-tanstack/router";
```

### Vue / Nuxt / Svelte / Solid

```ts
import { ref, computed } from "@tschk/moonshine-vue/vue";
import { refFromSignal } from "@tschk/moonshine-vue";

import { useFetch, navigateTo } from "@tschk/moonshine-nuxt/app";
import { useMoonshineAsyncData } from "@tschk/moonshine-nuxt";

import { writable, get } from "@tschk/moonshine-svelte/store";
import { moonshineWritable } from "@tschk/moonshine-svelte";

import { createSignal as solidSignal, For } from "@tschk/moonshine-solid/solid";
import { renderCrepusIrSolid } from "@tschk/moonshine-solid";
```

### Astro / Waku / Angular-like

```ts
import { defineIsland } from "@tschk/moonshine-astro";
import { useFragmentShader } from "@tschk/moonshine-astro/shaders";

import { createSharedIslandSignal } from "@tschk/moonshine-waku";
import { Link, useWakuPathSignal } from "@tschk/moonshine-waku/router";

import { signal, computed, effect } from "@tschk/moonshine-angular";
import { fromSignal } from "@tschk/moonshine-angular/rxjs";
```

## Examples

| Path                       | What                                                    |
| -------------------------- | ------------------------------------------------------- |
| `examples/hybrid-app`      | Static, SSR, island, SPA, and API routes in one project |
| `examples/bun-server`      | Bun HTTP + static + hydrate                             |
| `examples/shaders-island`  | WebGL via `@tschk/moonshine-shaders`                    |
| `examples/vite-crepus`     | Vite + Crepus IR                                        |
| `examples/catalog-gallery` | Component catalog                                       |

## Documentation

- [DESIGN.md](./DESIGN.md)
- [docs/ROUTING.md](./docs/ROUTING.md)
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- [docs/MANIFEST.md](./docs/MANIFEST.md)
- [docs/COMPARE.md](./docs/COMPARE.md)

## Develop

```bash
bun install && bun run check && bun run typecheck:native && bun test
```

## License

ISC
