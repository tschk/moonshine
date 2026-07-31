# `@tschk/crepus-moonshine`

`.crepus` source → Crepuscularity View IR → React. Parsing is done by the Rust
parser compiled to WASM (`@tschk/crepus-wasm`); it is never reimplemented here.
Solid renders the same IR through its own adapter — no shared vnode.

```ts
import { parseCrepus, renderCrepusIr } from "@tschk/crepus-moonshine";
import { renderCrepusIrSolid } from "@tschk/moonshine-solid";

const ir = parseCrepus(source, { name: "Ada" });
const element = renderCrepusIr(ir);
```

The package has a single export (`.`). IR types (`ViewIr`, `ViewNode`,
`ViewStyle`, `StackAxis`, `PickerOption`, `TabItem`) come from
`@tschk/crepus-wasm` and are re-exported here.

Template class tokens travel on `style.classes` and are emitted verbatim as
`className` / `class`, so UnoCSS or Tailwind styles the output. The lowered
`style` hints exist for native targets and are deliberately not converted to
inline CSS.

Also re-exports signals from `@tschk/moonshine` and `createApp` / `useSignal`
from `@tschk/moonshine-react` so the CLI emit can depend on one package.

In this monorepo the dependency is `"@tschk/moonshine": "workspace:*"`.
Out-of-tree, point it at a published version or `file:../core`.

See [DESIGN.md](../../DESIGN.md).
