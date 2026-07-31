# `@tschk/moonshine-adapter-conformance`

Reusable deployment contract suite for Moonshine adapters.

```ts
import { adapterConformance } from "@tschk/moonshine-adapter-conformance";
```

Adapters implement `DeploymentAdapter` from `@tschk/moonshine-framework` and
pass the same conformance tests for request handling, static assets,
streaming, and edge behavior.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[DESIGN.md](../../DESIGN.md).
