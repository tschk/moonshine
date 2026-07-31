# `@tschk/moonshine-svelte`

Svelte 5 rune-friendly store adapter for Moonshine. Re-exports real
`svelte/store` APIs plus moonshine signal bridges.

```ts
import { writable, get } from "@tschk/moonshine-svelte/store";
import { moonshineWritable } from "@tschk/moonshine-svelte";
```

| Subpath   | Host library             |
| --------- | ------------------------ |
| `.`       | moonshine signal bridges |
| `./store` | `svelte/store`           |

Peer: `svelte` >= 5.

See [Moonshine README](../../README.md).
