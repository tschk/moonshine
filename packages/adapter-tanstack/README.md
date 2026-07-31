# `@tschk/moonshine-tanstack`

TanStack Query and React Router adapter for Moonshine. Re-exports real host
libraries plus moonshine signal bridges.

```ts
import { createQuerySignal } from "@tschk/moonshine-tanstack";
import { useQuery, useQuerySignal } from "@tschk/moonshine-tanstack/query";
import {
  Link,
  useNavigate,
  usePathnameSignal,
} from "@tschk/moonshine-tanstack/router";
```

| Subpath    | Host library             |
| ---------- | ------------------------ |
| `.`        | moonshine signals        |
| `./query`  | `@tanstack/react-query`  |
| `./router` | `@tanstack/react-router` |

Peer: `@tanstack/react-query`, `@tanstack/react-router`, `react`, `react-dom`.

See [Moonshine README](../../README.md).
