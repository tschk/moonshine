# moonshine

**Hyperminimal Bun-first UI runtime.** Signals at the core. Own your app —
no metaframework required.

```bash
bun run moonshine -- new my-app      # Bun full-stack (default)
bun run moonshine -- new spa --vite  # client SPA only
cd my-app && bun install && bun run dev
```

## Greenfield path

| Layer | Use |
|-------|-----|
| Full-stack | `moonshine new` → Bun `/server` + static + hydrate |
| Client SPA | `moonshine new --vite` → Vite + `/react` |
| Async data | `createResource` / `useResource` |
| DSL | `.crepus` → IR → `.tsx` |

## Packages

| Package | Role |
|--------|------|
| `@tschk/moonshine` | Signals + `createResource` |
| `@tschk/moonshine/react` | `createApp`, `useSignal`, `useResource` |
| `@tschk/moonshine/server` | Pages + `staticDir` + `Bun.serve` |
| `@tschk/moonshine/router` | Instance client router |
| `@tschk/moonshine-cli` | CLI |
| `@tschk/crepus-moonshine` | View IR → React |

## Host adapters (real APIs)

| Host | Package | Real API highlights |
|------|---------|---------------------|
| **Next** | `@tschk/moonshine-next` | `/client` islands, `/server` `moonshineRoute`/`Json`/`Html` |
| **Remix** | `@tschk/moonshine-remix` | `useLoaderSignal`, `createSearchParamSignal`, resources |
| **TanStack** | `@tschk/moonshine-tanstack` | `createQuerySignal`, `createMutationSignal`, pathname |
| **Angular-like** | `@tschk/moonshine-angular` | `signal`/`computed`/`effect`/`resource` |
| **Solid** | `@tschk/moonshine-solid` | IR renderer + signal bridge + resources |
| **Vue** | `@tschk/moonshine-vue` | `refFromSignal`, `watchSignal`, `resourceRefs` |
| **Nuxt** | `@tschk/moonshine-nuxt` | `useMoonshineState`, `useMoonshineAsyncData` |
| **Svelte** | `@tschk/moonshine-svelte` | writable/readable + `readableResource` |
| **Astro** | `@tschk/moonshine-astro` | `defineIsland`, `preloadIslandData`, router/shaders |
| **Waku** | `@tschk/moonshine-waku` | `useWakuSignal`, `createSharedIslandSignal` |

Greenfield still prefers Bun + Vite. Adapters are for embedding in foreign hosts.

## Examples

| Path | What |
|------|------|
| `examples/bun-server` | Bun HTTP + static + hydrate |
| `examples/vite-crepus` | Vite + Crepus IR |
| `examples/catalog-gallery` | Component catalog |

## Develop

```bash
bun install && bun run check && bun run typecheck:native && bun test
```

See [DESIGN.md](./DESIGN.md) · [docs/COMPARE.md](./docs/COMPARE.md).

## License

ISC
