# `@tschk/moonshine-vue`

Hosting adapter. Vue compiles `.vue` files; moonshine cannot replace that
compiler. `vue` is a peer dependency, re-exported on subpaths, alongside
moonshine signal bridges.

This is not a reimplementation — you cannot alias `vue` onto this package
and drop Vue.

```ts
import { fromMoonshineSignal } from "@tschk/moonshine-vue";
import { ref } from "@tschk/moonshine-vue/vue";
```

| Subpath          | Provides                        |
| ---------------- | ------------------------------- |
| `.`              | signal bridges, crepus renderer |
| `./vue`          | `vue` runtime re-exports        |
| `./compiler-sfc` | `vue/compiler-sfc` re-exports   |

Peer: `vue` >= 3.

`<script>` / Composition API bodies are still Vue's. Adopt compiles markup
to View IR; refs and lifecycle hooks are not executed.
