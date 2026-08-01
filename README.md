# moonshine

Moonshine is a hyperminimal, Bun-first UI runtime built around a signal-only
kernel. Start with signals; add only the compiler, routing, rendering, server,
and deployment layers your project needs, then ship to Bun, Node, Cloudflare, or
Vercel. `.crepus` templates are parsed by the crepuscularity Rust parser
compiled to WebAssembly and rendered to React or Solid, with template class
tokens preserved so UnoCSS or Tailwind styles the output.

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
| `@tschk/crepus-moonshine`            | `.crepus` parsing (Rust parser via WASM) and View IR renderer |
| `@tschk/moonshine-cli`               | `new`, `adopt`, `dev`, `build`, `preview`, `inspect`          |
| `@tschk/moonshine-next`              | Next.js API reimplemented on moonshine (no `next` dependency) |
| `@tschk/moonshine-react-router`      | react-router / Remix client API reimplemented on moonshine    |
| `@tschk/moonshine-tanstack`          | TanStack Router / Start client API reimplemented on moonshine |
| `@tschk/moonshine-waku`              | Waku client router API reimplemented on moonshine             |
| `@tschk/moonshine-deploy-bun`        | Bun server deployment                                         |
| `@tschk/moonshine-deploy-node`       | Node HTTP deployment                                          |
| `@tschk/moonshine-deploy-cloudflare` | Cloudflare Workers deployment                                 |
| `@tschk/moonshine-deploy-vercel`     | Vercel functions, edge, and static output                     |

`@tschk/moonshine` still re-exports optional framework pieces on compatibility
subpaths (`/react`, `/runes`, `/router`, `/server`, `/shaders`) during the
`0.3.x` line.

## Host adapters

There are two kinds, and the difference decides whether the host package stays
installed.

**Reimplementing** — `@tschk/moonshine-next`, `@tschk/moonshine-react-router`,
`@tschk/moonshine-tanstack`, `@tschk/moonshine-waku`. Each one rewrites the
host's public API as ordinary React on moonshine's router and signal kernel. It
imports nothing from the host and lists it in no dependency field, so an app
aliases the host specifier onto the adapter and removes the host entirely. This
is only possible where the host's public API is plain React —
`packages/core/test/adapters-contract.test.ts` enforces the no-import and
no-dependency rules.

**Hosting** — `@tschk/moonshine-solid`. The host's real runtime is a peer
dependency, re-exported on subpaths alongside moonshine signal bridges. Required
wherever the host's component format is compiled rather than written as React
(Svelte, Vue, Angular, `.astro`); moonshine cannot replace that compiler.

Each adapter's README lists its subpaths and, for the reimplementing ones, an
explicit **Not supported** section. Read it before aliasing: RSC, loader/action
data APIs, file-system routing conventions, and image optimization are not
provided by any of them.

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

### Adopting an existing Next app

`moonshine adopt` points at a Next project and makes it run on moonshine without
`next` installed. It edits **no source files**: every `next/*` specifier the
adapter implements is remapped through `compilerOptions.paths`, which Bun honours
in both `bun run` and `Bun.build`, and `moonshine.config.ts` records the route
directory and convention so `moonshine build` reads `app/` or `pages/` in place.

```bash
moonshine adopt --dry-run   # print the plan, write nothing
moonshine adopt             # apply; running twice is a no-op
bun install && moonshine build && moonshine preview
```

It ends with a scorecard naming what it cannot carry over — middleware,
`next.config`, the metadata API, ISR, server actions, async server components,
parallel and intercepting routes, and image optimization — file by file, rather
than stubbing them to silently "work".

### Solid

```ts
import { createSignal as solidSignal, For } from "@tschk/moonshine-solid/solid";
import { parseCrepus } from "@tschk/crepus-moonshine";
import { renderCrepusIrSolid } from "@tschk/moonshine-solid";

const view = renderCrepusIrSolid(parseCrepus(source));
```

Class tokens from the template are emitted verbatim as `class`; the renderers
never turn View IR style hints into inline CSS.

## Examples

| Path                         | What                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `examples/hybrid-app`        | Static, SSR, island, SPA, and API routes in one project |
| `examples/bun-server`        | Bun HTTP + static + hydrate                             |
| `examples/svelte-adopt`      | Real `svelte` SSR rendered by the moonshine server      |
| `examples/deploy-cloudflare` | Minimal app targeting Cloudflare Workers                |
| `examples/deploy-vercel`     | Minimal app targeting Vercel                            |

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
