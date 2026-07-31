# Moonshine vs other web stacks

Honest map: what Moonshine is, what it is not, and where the trade-offs sit.

## One-line identity

> Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
> signal kernel. Start with signals; add only the routing, rendering, server,
> compiler, and deployment layers your project needs.

## Comparison matrix

| Dimension             | Moonshine                                                             | Astro                                           | Waku                                             | SolidStart                                                   | SvelteKit                                                          | Next.js                                                        | OpenNext                                    |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| Default kernel weight | ~2.83 KiB minified (`scripts/check-size.ts`)                          | 0 KB client JS for `.astro`; per-island runtime | React 19 / RSC; client JS scales with components | Solid runtime + Vinxi / Nitro                                | Svelte compiler + runtime; reported ~32.5 KiB gzipped client entry | React + Next runtime; reported ~57 KiB gzipped framework chunk | Next.js output; adapter adds no runtime     |
| Route modes           | `static`, `ssr`, `island`, `spa`, `api` (per route, auto or explicit) | Static, SSR, islands via `client:*` directives  | RSC + client components                          | SSR, SPA, API, experimental islands                          | `+page`, `+page.server`, `+page.client`, `+server`                 | RSC, SSR, static, client, route handlers                       | Next.js modes, built for serverless/edge    |
| Deployment targets    | Bun, Node, Cloudflare, Vercel                                         | Netlify, Vercel, Node, Cloudflare, Deno, static | Node, Cloudflare, Vercel                         | Nitro presets (Node, Cloudflare, Vercel, Netlify, Deno, ...) | Node, Cloudflare, Vercel, Netlify, static                          | Vercel-first; Node, Docker, static                             | AWS, Cloudflare (Next.js build wrapper)     |
| Renderer model        | Renderer contract; React / Solid / Crepus own output; no shared vnode | `.astro` compiler + framework islands           | React Server Components                          | Solid SSR / hydration via Vinxi                              | Svelte compiler + server/client data                               | React (RSC / SSR / CSR)                                        | Next.js renderer unchanged                  |
| Opt-in capabilities   | Router, compiler, server, renderers, deploy adapters, host adapters   | Images, content collections, view transitions   | RSC, middleware, client islands                  | Server functions, actions, serialization, islands            | Forms, server loads, actions, adapters                             | RSC, image/font, cache, PPR, platform integrations             | Edge, serverless, static, incremental cache |

No speed ranking is included; the repository only reports the core bundle size
measured by `scripts/check-size.ts`.

## When to pick Moonshine

- You want Solid-like signals first and React/Solid/Crepus only when you opt in.
- Bun is the install, test, bundler, and HTTP runtime.
- You want one project to mix static pages, SSR, islands, SPAs, and API routes.
- You are comfortable composing auth, databases, caches, and deployment yourself.

## When not to pick Moonshine

- You need a full RSC / PPR / image pipeline platform → **Next.js**.
- Your site is content-first with many framework-island pages → **Astro**.
- You want a single-vendor edge platform with managed primitives → **Vercel + Next.js** or **SvelteKit**.
- You are only building an HTTP API → **Hono** or a router of choice.

## Primary documentation

- [Moonshine — README](../README.md) · [DESIGN.md](../DESIGN.md) · [ROUTING.md](./ROUTING.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [MANIFEST.md](./MANIFEST.md)
- [Astro](https://docs.astro.build)
- [Waku](https://waku.gg)
- [SolidStart](https://start.solidjs.com)
- [SvelteKit](https://kit.svelte.dev)
- [Next.js](https://nextjs.org)
- [OpenNext](https://opennext.js.org)

## Bottom line

Moonshine is a framework built from a signal kernel: install only the pieces you
need, mix route modes, and deploy to Bun, Node, Cloudflare, or Vercel from the
same manifest. It is not a platform, not a compiler monopoly, and not a host
framework replacement.
