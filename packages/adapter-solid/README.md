# `@tschk/moonshine-solid`

Solid renderer and signal bridge for Moonshine. Solid keeps its own native
rendering model; Moonshine does not share a vnode with React.

This is a **hosting** adapter: `solid-js` is a real peer dependency, re-exported
on subpaths, and Moonshine renders its output. It is not a reimplementation —
unlike `@tschk/moonshine-next`, `-react-router`, `-tanstack` and `-waku`, you
cannot alias `solid-js` onto this package and drop Solid. Solid's component
format is compiled, so there is nothing to alias.

```ts
import { createSignal as solidSignal, For } from "@tschk/moonshine-solid/solid";
import { parseCrepus } from "@tschk/crepus-moonshine";
import { renderCrepusIrSolid } from "@tschk/moonshine-solid";
import { createMoonshineSignal } from "@tschk/moonshine-solid";

const view = renderCrepusIrSolid(parseCrepus(source), { rootTag: "main" });
```

| Subpath   | Provides                                  |
| --------- | ----------------------------------------- |
| `.`       | Solid renderer, Crepus IR, signal bridges |
| `./solid` | `solid-js` re-exports                     |
| `./h`     | `solid-js/h` factory                      |
| `./store` | Solid store helpers                       |

View IR types come from `@tschk/crepuscularity-wasm`, the same source of truth the React
renderer uses. Template class tokens (`style.classes`) are emitted verbatim as
`class`; View IR style hints are never converted to inline CSS.

Peer: `solid-js` >= 1.8.

See [Moonshine README](../../README.md) and [DESIGN.md](../../DESIGN.md).
