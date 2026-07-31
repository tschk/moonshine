# `@tschk/moonshine-router`

Renderer-neutral route graph and matcher. Optional React navigation helpers.

```ts
import { createRouteGraph, matchRoutes } from "@tschk/moonshine-router";
import {
  MoonshineRouter,
  Link,
  useParams,
  useNavigate,
} from "@tschk/moonshine/router";
```

Features:

- Pattern compiler with static, dynamic, optional, and rest segments.
- Route graph with ambiguity detection.
- Match precedence: `static > dynamic > optional > rest`.
- `MoonshineRouter`, `Link`, `useParams`, `useNavigate`, `useLocation`.

See [docs/ROUTING.md](../../docs/ROUTING.md).
