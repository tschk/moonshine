# `@tschk/moonshine-vue`

Vue 3 adapter for Moonshine. Re-exports real Vue runtime APIs plus moonshine
signal bridges.

```ts
import { ref, computed } from "@tschk/moonshine-vue/vue";
import { refFromSignal } from "@tschk/moonshine-vue";
```

| Subpath | Host library             |
| ------- | ------------------------ |
| `.`     | moonshine signal bridges |
| `./vue` | `vue` `ref` / `computed` |

Peer: `vue` >= 3.4.

See [Moonshine README](../../README.md).
