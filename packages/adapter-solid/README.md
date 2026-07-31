# `@tschk/moonshine-solid`

Solid renderer and signal bridge for Moonshine. Solid keeps its own native
rendering model; Moonshine does not share a vnode with React.

```ts
import { createSignal as solidSignal, For } from "@tschk/moonshine-solid/solid";
import { renderCrepusIrSolid } from "@tschk/moonshine-solid";
import { createMoonshineSignal } from "@tschk/moonshine-solid";
```

| Subpath   | Provides                                  |
| --------- | ----------------------------------------- |
| `.`       | Solid renderer, Crepus IR, signal bridges |
| `./solid` | `solid-js` re-exports                     |
| `./h`     | `solid-js/h` factory                      |
| `./store` | Solid store helpers                       |

Peer: `solid-js` >= 1.8.

See [Moonshine README](../../README.md) and [DESIGN.md](../../DESIGN.md).
