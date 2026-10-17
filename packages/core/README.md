# `@tschk/moonshine`

Signal-only kernel of the Moonshine framework. Bun-first.

```ts
import { createSignal, createMemo, createStore, batch } from "@tschk/moonshine";
import { createApp, useSignal } from "@tschk/moonshine/react";
import { state, derived, effect } from "@tschk/moonshine/runes";
```

The default export contains only signals, memos, stores, and resources. Router,
server, compiler, and deployment packages are separate imports.

Installing the kernel installs no runtime dependencies. Compatibility subpaths
use optional peers: install `@tschk/moonshine-react`, `@tschk/moonshine-router`,
`@tschk/moonshine-server`, or `@tschk/moonshine-shaders` when using its matching
subpath. `/runes` needs no extra package. The React bridge also needs `react` and
`react-dom`.

The opt-in `/tracking` entry exposes dependency collection for native schedulers.
It can observe first-read versions and preserve an enclosing memo's dependencies;
it adds no scheduling or rendering behavior to the default kernel.

See [Moonshine README](../../README.md), [DESIGN.md](../../DESIGN.md), and
[docs/MANIFEST.md](../../docs/MANIFEST.md).
