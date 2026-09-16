# `@tschk/moonshine-nuxt`

Hosting adapter. Nuxt compiles Vue SFCs and owns Nitro; moonshine cannot
replace that compiler. `nuxt` and `vue` are peer dependencies, re-exported
on subpaths, alongside moonshine signal bridges.

This is not a reimplementation — you cannot alias `nuxt` onto this package
and drop Nuxt.

```ts
import { fromMoonshineSignal } from "@tschk/moonshine-nuxt";
import { useState } from "@tschk/moonshine-nuxt/app";
```

| Subpath | Provides                         |
| ------- | -------------------------------- |
| `.`     | signal bridges, crepus renderer  |
| `./app` | `nuxt/app` composable re-exports |
| `./vue` | `vue` runtime re-exports         |

Peer: `nuxt` >= 3, `vue` >= 3.

Pages and middleware are still Nuxt's. Adopt treats Nuxt as Vue templates
for markup IR; Nitro, `useFetch`, and file-based routing conventions are
not provided by moonshine.
