# `@tschk/moonshine-adapter-conformance`

Reusable deployment contract suite for Moonshine adapters.

```ts
import {
  adapterConformance,
  artifactConformance,
  nodeRuntime,
} from "@tschk/moonshine-adapter-conformance";

adapterConformance(nodeAdapter, nodeHarness);
artifactConformance(nodeAdapter, nodeRuntime, adapterPackageDir);
```

Adapters implement `DeploymentAdapter` from `@tschk/moonshine-framework`.
`adapterConformance` checks request handling, static assets, streaming and
cancellation through the adapter's in-process harness. `artifactConformance`
builds a React fixture app with `moonshine build --adapter <name>` and runs the
output on the adapter's real runtime (`bunRuntime`, `nodeRuntime`,
`workerdRuntime` or `vercelRuntime`), checking assets, static and SSR pages,
hooks, API routes, redirects, 404s, SPA shells, `cache.revalidate` and Edge
routes over HTTP. The Node-based runtimes need `node` on `PATH`.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and
[DESIGN.md](../../DESIGN.md).
