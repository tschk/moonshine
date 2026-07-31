# `@tschk/moonshine-nuxt`

Nuxt adapter for Moonshine. Re-exports real Nuxt `#app` composables plus
moonshine signal bridges.

```ts
import { createSignal } from "@tschk/moonshine-nuxt";
import { useFetch, navigateTo } from "@tschk/moonshine-nuxt/app";
import { useMoonshineAsyncData } from "@tschk/moonshine-nuxt";
```

| Subpath | Host library             |
| ------- | ------------------------ |
| `.`     | moonshine signal bridges |
| `./app` | Nuxt `#app` composables  |

Peer: `nuxt`, `vue`.

See [Moonshine README](../../README.md).
