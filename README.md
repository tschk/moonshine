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
| `@tschk/crepus-moonshine`            | `.crepus` parsing (Rust parser via WASM) and View IR renderer |
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

| Path                  | What                                                    |
| --------------------- | ------------------------------------------------------- |
| `examples/hybrid-app` | Static, SSR, island, SPA, and API routes in one project |
| `examples/bun-server` | Bun HTTP + static + hydrate                             |

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
