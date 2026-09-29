# `@tschk/moonshine-svelte`

Hosting adapter. Svelte compiles `.svelte` files; moonshine cannot replace
that compiler. `svelte` is a peer dependency, re-exported on subpaths,
alongside moonshine signal bridges.

This is not a reimplementation — you cannot alias `svelte` onto this package
and drop Svelte.

```ts
import { fromMoonshineSignal } from "@tschk/moonshine-svelte";
import { onMount } from "@tschk/moonshine-svelte/svelte";
```

| Subpath    | Provides                        |
| ---------- | ------------------------------- |
| `.`        | signal bridges, crepus renderer |
| `./svelte` | `svelte` runtime re-exports     |
| `./store`  | `svelte/store` re-exports       |

Peer: `svelte` >= 4.

`<script>` blocks are still Svelte's. Adopt compiles markup to View IR;
runes, stores, and handlers are not executed. Port that logic to moonshine
signals or keep running Svelte.
