# `@tschk/moonshine-astro`

Hosting adapter. Astro compiles `.astro` files; moonshine cannot replace
that compiler. `astro` is a peer dependency. The compiler is re-exported
on a subpath, alongside moonshine signal bridges.

This is not a reimplementation — you cannot alias `astro` onto this
package and drop Astro.

```ts
import { fromMoonshineSignal } from "@tschk/moonshine-astro";
import { transform } from "@tschk/moonshine-astro/compiler";
```

| Subpath      | Provides                        |
| ------------ | ------------------------------- |
| `.`          | signal bridges, crepus renderer |
| `./compiler` | `astro/compiler` re-exports     |

Peer: `astro` >= 4.

Frontmatter is still Astro's. Adopt compiles markup to View IR; imports,
top-level awaits, and `Astro.props` are not executed. Imported component
tags and `<slot />` are parse errors in the shared AST.
