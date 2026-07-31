# `@tschk/moonshine-remix`

Remix / React Router adapter for Moonshine. Re-exports real host libraries plus
moonshine signal bridges.

```ts
import { useLoaderSignal } from "@tschk/moonshine-remix";
import { Link, useFetcher, useLoaderData } from "@tschk/moonshine-remix/react";
import {
  useFetcherSignals,
  useLocationSignal,
} from "@tschk/moonshine-remix/hooks";
```

| Subpath   | Host library       |
| --------- | ------------------ |
| `.`       | moonshine signals  |
| `./react` | `@remix-run/react` |
| `./hooks` | signal bridges     |

Peer: `@remix-run/react`, `react`, `react-dom`.

See [Moonshine README](../../README.md).
