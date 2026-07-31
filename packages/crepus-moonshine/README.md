# `@tschk/crepus-moonshine`

Crepuscularity View IR → React / Solid. Shared IR helpers; no shared vnode.

```ts
import { renderCrepusIr } from "@tschk/crepus-moonshine";
import { renderCrepusIrSolid } from "@tschk/moonshine-solid";
```

Also re-exports signals from `@tschk/moonshine` and `createApp` / `useSignal`
from `@tschk/moonshine-react` so the CLI emit can depend on one package.

In this monorepo the dependency is `"@tschk/moonshine": "workspace:*"`.
Out-of-tree, point it at a published version or `file:../core`.

See [DESIGN.md](../../DESIGN.md).
