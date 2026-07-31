# `@tschk/moonshine-next`

Moonshine **reimplements the Next.js API surface**. It does not wrap, re-export,
or depend on Next — `next` is not a dependency, a peer dependency, or a
devDependency of this package. You keep writing `next/link`, `next/navigation`,
`next/image`; moonshine provides them, on its own signal runtime and router.

```ts
import { createSignal, useSignal } from "@tschk/moonshine-next";
import { useRouter, usePathname } from "@tschk/moonshine-next/navigation";
import Link from "@tschk/moonshine-next/link";
import Image from "@tschk/moonshine-next/image";
import { headers, cookies } from "@tschk/moonshine-next/headers";
import { moonshineRoute, moonshineJson } from "@tschk/moonshine-next/server";
```

Peers: `react` >= 18, `react-dom` >= 18. That is the whole runtime requirement.

## Drop-in: keep your existing imports

You do not have to rewrite a single import. Map the `next/*` specifiers onto
this package at build time.

### Bun

```ts
import { moonshineNextPlugin } from "@tschk/moonshine-next/aliases";

await Bun.build({
  entrypoints: ["./app/page.tsx"],
  plugins: [moonshineNextPlugin()],
});
```

For `bun run` / `bun test`, register it in a preload file:

```ts
// bun-preload.ts
import { plugin } from "bun";
import { moonshineNextPlugin } from "@tschk/moonshine-next/aliases";

plugin(moonshineNextPlugin());
```

```toml
# bunfig.toml
preload = ["./bun-preload.ts"]
```

### TypeScript

So the type checker follows the same mapping the bundler applies:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "next/link": ["@tschk/moonshine-next/link"],
      "next/navigation": ["@tschk/moonshine-next/navigation"],
      "next/image": ["@tschk/moonshine-next/image"],
      "next/script": ["@tschk/moonshine-next/script"],
      "next/headers": ["@tschk/moonshine-next/headers"],
      "next/dynamic": ["@tschk/moonshine-next/dynamic"],
      "next/font/google": ["@tschk/moonshine-next/font/google"],
    },
  },
}
```

`tsconfigPaths()` from `@tschk/moonshine-next/aliases` returns exactly that
object, and `nextAliases` is the raw specifier map if you need to feed another
bundler (esbuild `alias`, Vite `resolve.alias`, webpack `resolve.alias`).

## Supported

| Subpath          | Provides                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.` / `./client` | moonshine signals + resources (`"use client"`)                                                                                                        |
| `./navigation`   | `useRouter` `usePathname` `useSearchParams` `useParams` `redirect` `permanentRedirect` `notFound` `useSelectedLayoutSegment(s)` + `usePathnameSignal` |
| `./link`         | default `Link` — client navigation, hover/viewport prefetch                                                                                           |
| `./image`        | default `Image` — `src` `alt` `width` `height` `fill` `priority` `loading` `sizes`                                                                    |
| `./script`       | default `Script` — `strategy` mapped to `async`/`defer`                                                                                               |
| `./headers`      | `headers()` `cookies()` `draftMode()` (server only)                                                                                                   |
| `./dynamic`      | default `dynamic()` with `loading`, `ssr: false`, `.preload()`                                                                                        |
| `./font/google`  | named family loaders returning `{ className, style, variable, href }`                                                                                 |
| `./aliases`      | `next/*` → moonshine specifier mapping + Bun plugin                                                                                                   |
| `./shaders`      | moonshine WebGL fragment helpers                                                                                                                      |
| `./server`       | `moonshineRoute` / `moonshineJson` / `moonshineHtml` + page helpers                                                                                   |

Behavioural notes where moonshine deliberately differs from Next:

- **`Link` prefetch is a browser hint.** It appends `<link rel="prefetch">` on
  hover and on viewport entry. There is no RSC payload to warm, so this is not
  Next's prefetch cache — it only primes the HTTP cache.
- **`Link` scroll follows the destination.** Next always jumps to the top;
  moonshine only scrolls when the pathname or hash actually changes, so
  query-only navigation (filters, pagination, tabs) keeps your scroll position.
  Pass `scroll` explicitly to force either behaviour.
- **`router.refresh()` and `router.prefetch()` are no-ops.** Moonshine
  re-renders from its signal graph; there is no server round trip to invalidate.
- **`redirect()` / `notFound()`** throw `RedirectError` / `NotFoundError`,
  exported from `./navigation` so your renderer can catch them.
- **`useSearchParams()`** reads the live query string. The moonshine router
  stores only the pathname, so the query is recovered from `window.location`.

## Not supported

Be aware of these before migrating — none of them are stubbed to silently
"work":

- **No image optimizer.** `next/image` renders a plain `<img>`. `src` is served
  exactly as authored; `quality` and `unoptimized` are accepted and ignored.
  There is no resizing, no format negotiation, no `srcSet` generation, no
  `loader` / `remotePatterns` config, no blur placeholder.
- **No React Server Components.** No `"use server"`, no Server Actions, no
  server-only component tree, no streaming RSC payload.
- **No ISR / on-demand revalidation.** No `revalidate`, no `revalidatePath`, no
  `revalidateTag`, no `unstable_cache`, no fetch cache semantics.
- **No middleware.** `middleware.ts` is not read; there is no edge interception
  layer. Use the moonshine server directly.
- **No `next/font` self-hosting.** `next/font/google` does not download or
  subset fonts at build time. It returns Next's `{ className, style, variable }`
  shape plus an `href`, and you emit the Google Fonts `<link>` tags yourself via
  `fontLinks()`. That means a third-party request at runtime, which is exactly
  what Next's self-hosting avoids. `next/font/local` is not implemented.
- **No file-system routing conventions.** `layout.tsx`, `loading.tsx`,
  `error.tsx`, `template.tsx`, route groups, parallel and intercepting routes
  are not interpreted. Use the moonshine router.
- **No `next/headers` mutation.** `cookies()` is read-only — no `set()` or
  `delete()`. `draftMode()` always reports disabled.
- **Other `next/*` modules are absent**, including `next/server`
  (`NextRequest` / `NextResponse`), `next/og`, `next/cache`, and
  `next/navigation`'s `unstable_*` APIs. Route Handlers take and return plain
  `Request` / `Response`; see `./server`.

Does **not** export `MoonshineRouter` from the client entry — import it from
`@tschk/moonshine/router` if you want the moonshine router directly.

See [Moonshine README](../../README.md).
