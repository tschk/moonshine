# moonshine

**Hyperminimal Bun-first UI runtime.** Signals at the core. Own your app —
no metaframework required. **Adapters bring each stack’s libraries into moonshine.**

```bash
bun run moonshine -- new my-app      # Bun full-stack (default)
bun run moonshine -- new spa --vite  # client SPA only
```

## Host adapters = stack libraries + moonshine

Import the **host’s real packages** through the adapter path (peer-installed),
plus moonshine signal bridges.

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

| Subpath | Host library |
|---------|----------------|
| `/navigation` | `next/navigation` + pathname/search signals |
| `/link` | `next/link` |
| `/image` | `next/image` |
| `/headers` | `next/headers` |
| `/dynamic` | `next/dynamic` |
| `/shaders` | moonshine WebGL (Next island friendly) |
| `/server` | Route handler helpers |

### Remix

```ts
import { useLoaderSignal } from "@tschk/moonshine-remix";
import { Link, useFetcher, useLoaderData } from "@tschk/moonshine-remix/react";
import { useFetcherSignals, useLocationSignal } from "@tschk/moonshine-remix/hooks";
```

### TanStack

```ts
import { createQuerySignal } from "@tschk/moonshine-tanstack";
import { useQuery, useQuerySignal } from "@tschk/moonshine-tanstack/query";
import { Link, useNavigate, usePathnameSignal } from "@tschk/moonshine-tanstack/router";
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

## Core packages

| Package | Role |
|--------|------|
| `@tschk/moonshine` | Signals + `createResource` |
| `@tschk/moonshine/react` | `createApp`, `useSignal`, `useResource` |
| `@tschk/moonshine/server` | Pages + `staticDir` + `Bun.serve` |
| `@tschk/moonshine/router` | Instance client router |
| `@tschk/moonshine-cli` | CLI |
| `@tschk/crepus-moonshine` | View IR → React |

## Examples

| Path | What |
|------|------|
| `examples/bun-server` | Bun HTTP + static + hydrate |
| `examples/shaders-island` | WebGL via `@tschk/moonshine-shaders` (same as Next `/shaders`) |
| `examples/vite-crepus` | Vite + Crepus IR |
| `examples/catalog-gallery` | Component catalog |

## Develop

```bash
bun install && bun run check && bun run typecheck:native && bun test
```

See [DESIGN.md](./DESIGN.md) · [docs/COMPARE.md](./docs/COMPARE.md).

## License

ISC
