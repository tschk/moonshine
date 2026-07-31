# Ground-Up Moonshine Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Moonshine into a ground-up, Bun-first hybrid web framework assembled from a signal-only kernel, with automatic route optimization and portable deployment artifacts.

**Architecture:** `@tschk/moonshine` remains signal-only. Optional router, framework-contract, compiler, server, renderer, and deployment packages communicate through Web APIs and a versioned manifest. Filesystem routes and programmatic routes feed one route graph; compiler analysis chooses static, SSR, island, SPA, or API output conservatively and records every decision.

**Tech Stack:** Bun 1.3+, TypeScript 7.0.2, `@typescript/native-preview`, React 19, Solid 1.9, Web Fetch/Streams APIs, Bun bundler, Bun test, Prettier, Oxlint.

## Global Constraints

- Keep `@tschk/moonshine` default export signal-only; React remains opt-in.
- Use Bun workspaces, Bun commands, and `"type": "module"` everywhere.
- Apps author `.tsx`; `.crepus` continues emitting `.tsx` through the existing Jaspr/CLI contract.
- Never create a shared vnode for Solid; renderer packages share route and manifest contracts only.
- Preserve existing public subpaths through compatibility re-exports during the `0.3.x` line.
- Runtime boundaries use `Request`, `Response`, `ReadableStream`, `URL`, `Headers`, and `AbortSignal`.
- Auto classification falls back to SSR when analysis is uncertain and records a human-readable reason.
- No native C++ implementation ships without a checked-in benchmark, portable TypeScript fallback, and measurable improvement.
- No auth, database, billing, or application-state policy enters framework packages.
- Every package provides `format`, `lint`, `typecheck`, and `test` scripts through Bun.
- Every task ends with clean focused tests and a pushed commit on `main`; do not create branches.
- Release target is `0.3.0`; publication occurs only after clean external install fixtures and npm ownership checks.

---

## File Map

### Existing files retained or migrated

- `packages/core/src/signal.ts` and `packages/core/src/resource.ts`: kernel implementation.
- `packages/core/src/router.ts`: compatibility re-export after router extraction.
- `packages/core/src/server.ts`: compatibility re-export after server extraction.
- `packages/core/src/react.ts`: compatibility re-export after React renderer extraction.
- `packages/cli/src/*.ts`: command orchestration replaced with compiler/framework calls.
- `packages/adapter-solid/`: extended into Solid framework renderer while preserving host exports.
- `packages/crepus-moonshine/`: extended with framework renderer contract.

### New framework units

- `packages/framework/`: public route, manifest, renderer, adapter, and config contracts.
- `packages/router/`: filesystem-independent route graph, matcher, inheritance, and navigation.
- `packages/compiler/`: discovery, analysis, bundling, prerendering, and manifest output.
- `packages/server/`: middleware, loaders, actions, errors, serialization, and request pipeline.
- `packages/react/`: React SSR, stream rendering, island encoding, and hydration.
- `packages/deploy-bun/`, `deploy-node/`, `deploy-cloudflare/`, `deploy-vercel/`: manifest consumers.
- `packages/adapter-conformance/`: reusable deployment contract suite.
- `examples/hybrid-app/`: one real fixture containing all five route modes.
- `scripts/check-packages.ts`, `scripts/check-size.ts`, `scripts/release.ts`: repository gates.

---

### Task 1: Establish repository-wide quality gates and package policy

**Files:**

- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/check-packages.ts`
- Create: `scripts/check-size.ts`
- Test: `scripts/check-packages.test.ts`

**Interfaces:**

- Consumes: existing Bun workspace manifests.
- Produces: `checkPackageManifest(path: string): string[]` and root commands `format`, `lint`, `typecheck`, `typecheck:native`, `test`, `check`, `check:size`.

- [ ] **Step 1: Write manifest-policy tests**

```ts
import { describe, expect, test } from "bun:test";
import { checkPackageManifest } from "./check-packages";

describe("package policy", () => {
  test("requires four gates and ESM", () => {
    expect(checkPackageManifest("packages/core/package.json")).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify policy test fails**

Run: `bun test scripts/check-packages.test.ts`

Expected: FAIL because `checkPackageManifest` does not exist.

- [ ] **Step 3: Add minimal policy checker and root dependencies**

```ts
export function checkPackageManifest(path: string): string[] {
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    type?: string;
    scripts?: Record<string, string>;
  };
  const errors = pkg.type === "module" ? [] : [`${path}: type must be module`];
  for (const gate of ["format", "lint", "typecheck", "test"]) {
    if (!pkg.scripts?.[gate]) errors.push(`${path}: missing ${gate}`);
  }
  return errors;
}
```

Add pinned `prettier` and `oxlint` dev dependencies with Bun. Add package scripts using `bunx prettier --check`, `bunx oxlint`, `bunx tsc`, and `bun test`. Update every existing TypeScript package manifest in the same commit because the new policy gate applies repository-wide.

- [ ] **Step 4: Add kernel and scaffold size budgets**

`scripts/check-size.ts` must bundle `packages/core/src/index.ts`, fail above 12 KiB minified, and later accept a hybrid scaffold budget of 90 KiB initial browser JavaScript. Use `Bun.build` directly and count emitted bytes.

- [ ] **Step 5: Run all baseline gates**

Run: `bun run format && bun run lint && bun run typecheck && bun run typecheck:native && bun test && bun run check:size`

Expected: all commands exit 0; kernel bundle is at most 12 KiB.

- [ ] **Step 6: Expand CI matrix and commit**

CI must run JavaScript gates on `ubuntu-latest` and `macos-latest`, retain Dart analysis/tests, use `bun install --frozen-lockfile`, and run no duplicate test command.

```bash
git add package.json bun.lock .github/workflows/ci.yml packages scripts
git commit -m "chore: enforce framework quality gates"
git push
```

### Task 2: Define stable framework and manifest contracts

**Files:**

- Create: `packages/framework/package.json`
- Create: `packages/framework/tsconfig.json`
- Create: `packages/framework/src/index.ts`
- Create: `packages/framework/src/routes.ts`
- Create: `packages/framework/src/manifest.ts`
- Create: `packages/framework/src/config.ts`
- Create: `packages/framework/src/renderer.ts`
- Create: `packages/framework/src/adapter.ts`
- Test: `packages/framework/test/contracts.test.ts`

**Interfaces:**

- Produces: `RenderMode`, `RuntimeTarget`, `RouteDefinition`, `RouteArtifact`, `MoonshineManifest`, `MoonshineConfig`, `Renderer`, `DeploymentAdapter`, `defineConfig`, `defineRoute`.
- Consumes: Web API types only.

- [ ] **Step 1: Write contract tests**

```ts
import { expect, test } from "bun:test";
import { defineConfig, defineRoute, MANIFEST_VERSION } from "../src";

test("contracts preserve exact input and version one", () => {
  const route = defineRoute({
    id: "home",
    path: "/",
    file: "src/routes/index.tsx",
  });
  expect(route.path).toBe("/");
  expect(defineConfig({ mode: "auto" }).mode).toBe("auto");
  expect(MANIFEST_VERSION).toBe(1);
});
```

- [ ] **Step 2: Verify tests fail**

Run: `bun test packages/framework/test/contracts.test.ts`

Expected: FAIL with missing package modules.

- [ ] **Step 3: Implement exact route contracts**

```ts
export type RenderMode = "auto" | "static" | "ssr" | "island" | "spa" | "api";
export type RuntimeTarget = "bun" | "node" | "cloudflare" | "vercel-edge";

export type RouteDefinition = {
  id: string;
  path: string;
  file: string;
  mode?: RenderMode;
  runtime?: RuntimeTarget;
  layouts?: string[];
  middleware?: string[];
  errorBoundary?: string;
  dataFile?: string;
};
```

- [ ] **Step 4: Implement exact manifest contracts**

```ts
export const MANIFEST_VERSION = 1 as const;

export type RouteArtifact = RouteDefinition & {
  mode: Exclude<RenderMode, "auto">;
  runtime: RuntimeTarget;
  decision: string;
  serverEntry?: string;
  clientEntries: string[];
  staticOutput?: string;
  cache?: { control?: string; revalidate?: number };
  headers?: Record<string, string>;
};

export type MoonshineManifest = {
  version: typeof MANIFEST_VERSION;
  frameworkVersion: string;
  routes: RouteArtifact[];
  assets: Array<{ path: string; file: string; integrity?: string }>;
  entries: { server?: string; client?: string };
  capabilities: Array<"streaming" | "islands" | "edge" | "revalidation">;
};
```

- [ ] **Step 5: Implement renderer and adapter contracts**

```ts
export type RenderContext = {
  request: Request;
  route: RouteArtifact;
  params: Record<string, string>;
  data: unknown;
  signal: AbortSignal;
};

export type Renderer = {
  name: string;
  render(context: RenderContext): Promise<Response>;
  prerender(context: RenderContext): Promise<string>;
};

export type DeploymentAdapter = {
  name: string;
  runtimes: RuntimeTarget[];
  capabilities: MoonshineManifest["capabilities"];
  build(manifest: MoonshineManifest, outDir: string): Promise<void>;
};
```

- [ ] **Step 6: Verify package gates and commit**

Run: `bun test packages/framework && bun run typecheck && bun run typecheck:native`

```bash
git add packages/framework package.json bun.lock
git commit -m "feat: define framework build contracts"
git push
```

### Task 3: Extract renderer-neutral route graph and matcher

**Files:**

- Create: `packages/router/package.json`
- Create: `packages/router/tsconfig.json`
- Create: `packages/router/src/index.ts`
- Create: `packages/router/src/pattern.ts`
- Create: `packages/router/src/graph.ts`
- Create: `packages/router/src/navigation.ts`
- Test: `packages/router/test/pattern.test.ts`
- Test: `packages/router/test/graph.test.ts`
- Modify: `packages/core/src/router.ts`
- Modify: `packages/core/package.json`

**Interfaces:**

- Consumes: `RouteDefinition` from `@tschk/moonshine-framework`.
- Produces: `compilePattern`, `matchRoutes`, `createRouteGraph`, `MoonshineRouterInstance`.

- [ ] **Step 1: Write precedence and parameter tests**

```ts
test("static beats dynamic beats rest", () => {
  const graph = createRouteGraph([
    { id: "rest", path: "/blog/*rest", file: "rest.tsx" },
    { id: "slug", path: "/blog/:slug", file: "slug.tsx" },
    { id: "new", path: "/blog/new", file: "new.tsx" },
  ]);
  expect(matchRoutes(graph, "/blog/new")?.route.id).toBe("new");
  expect(matchRoutes(graph, "/blog/post")?.params).toEqual({ slug: "post" });
});
```

- [ ] **Step 2: Write ambiguity test**

Two routes with equal normalized pattern and precedence must throw
`Ambiguous routes "a" and "b" both match /users/:param` during graph creation.

- [ ] **Step 3: Verify tests fail**

Run: `bun test packages/router`

Expected: FAIL with missing exports.

- [ ] **Step 4: Implement segment ranking and matching**

Use segment kinds `static = 3`, `dynamic = 2`, `optional = 1`, `rest = 0`.
Decode matched values with `decodeURIComponent`; malformed encoding returns no
match instead of crashing request handling.

- [ ] **Step 5: Preserve client router compatibility**

Move browser navigation logic from `packages/core/src/router.ts` into
`packages/router/src/navigation.ts`. Replace core file with explicit re-exports
from `@tschk/moonshine-router` and retain current exported names.

- [ ] **Step 6: Verify and commit**

Run: `bun test packages/router packages/core/test && bun run check`

```bash
git add packages/router packages/core package.json bun.lock
git commit -m "feat: add renderer-neutral route graph"
git push
```

### Task 4: Implement filesystem route discovery and inheritance

**Files:**

- Create: `packages/compiler/package.json`
- Create: `packages/compiler/tsconfig.json`
- Create: `packages/compiler/src/index.ts`
- Create: `packages/compiler/src/discover.ts`
- Create: `packages/compiler/src/inherit.ts`
- Test: `packages/compiler/test/discover.test.ts`
- Test fixtures: `packages/compiler/test/fixtures/routes/**`

**Interfaces:**

- Consumes: `RouteDefinition`, `MoonshineConfig`, `createRouteGraph`.
- Produces: `discoverRoutes(options: DiscoverOptions): Promise<RouteDefinition[]>`, `mergeRoutes(filesystem, programmatic)`.

- [ ] **Step 1: Create fixture tree**

Fixture must include root layout/error/middleware, `index.tsx`, `about.tsx`,
`blog/[slug].tsx`, `blog/[slug].data.ts`, `docs/[...path].tsx`,
`account/[[tab]].tsx`, and `api/health.server.ts`.

- [ ] **Step 2: Write expected discovery snapshot**

Assert exact route IDs, paths, inherited layout/middleware/error files, paired
data file, and API mode. Assert discovery output is sorted deterministically.

- [ ] **Step 3: Verify discovery tests fail**

Run: `bun test packages/compiler/test/discover.test.ts`

- [ ] **Step 4: Implement filename conversion**

```ts
export function segmentToPattern(segment: string): string {
  if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return `*${segment.slice(4, -1)}`;
  if (/^\[\[[^\]]+\]\]$/.test(segment)) return `:${segment.slice(2, -2)}?`;
  if (/^\[[^\]]+\]$/.test(segment)) return `:${segment.slice(1, -1)}`;
  return segment;
}
```

Use `node:fs/promises` and `node:path`; do not add a glob dependency.

- [ ] **Step 5: Implement inheritance and duplicate rejection**

Walk parent directories from route directory to routes root. Layout and
middleware arrays order root-to-leaf; nearest error boundary wins. Feed merged
routes through `createRouteGraph` so filesystem and programmatic routes share
ambiguity behavior.

- [ ] **Step 6: Verify and commit**

Run: `bun test packages/compiler/test/discover.test.ts packages/router && bun run typecheck`

```bash
git add packages/compiler package.json bun.lock
git commit -m "feat: discover filesystem routes"
git push
```

### Task 5: Implement compiler-aware route classification

**Files:**

- Create: `packages/compiler/src/analyze.ts`
- Create: `packages/compiler/src/classify.ts`
- Test: `packages/compiler/test/classify.test.ts`
- Test fixtures: `packages/compiler/test/fixtures/modes/**`

**Interfaces:**

- Consumes: discovered routes and `MoonshineConfig`.
- Produces: `analyzeModule(file, program): ModuleFacts`, `classifyRoute(input): ModeDecision`.

- [ ] **Step 1: Define facts and decisions in tests**

```ts
export type ModuleFacts = {
  clientBoundary: boolean;
  serverOnly: boolean;
  exportsHandler: boolean;
  exportsLoader: boolean;
  exportsAction: boolean;
  requestBound: boolean;
  interactive: boolean;
  unresolvedDynamicImport: boolean;
};

export type ModeDecision = {
  mode: "static" | "ssr" | "island" | "spa" | "api";
  reason: string;
};
```

Test explicit override, API export, root client boundary, request-bound loader,
interactive child, deterministic static module, and unresolved dynamic import.

- [ ] **Step 2: Verify classification tests fail**

Run: `bun test packages/compiler/test/classify.test.ts`

- [ ] **Step 3: Implement TypeScript AST analysis**

Use `typescript` compiler API. Detect top-level `"use client"`, `.client` and
`.server` suffixes, exported `handler`/HTTP methods, exported `loader`/`action`,
imports of `cookies`, `headers`, and `request`, JSX event properties matching
`/^on[A-Z]/`, and non-literal dynamic imports. Do not execute modules.

- [ ] **Step 4: Implement ordered classification**

```ts
export function classifyRoute(input: ClassificationInput): ModeDecision {
  if (input.explicit && input.explicit !== "auto")
    return { mode: input.explicit, reason: "explicit route configuration" };
  if (input.facts.exportsHandler)
    return { mode: "api", reason: "exports request handler" };
  if (input.facts.clientBoundary)
    return { mode: "spa", reason: "route root is a client boundary" };
  if (
    input.facts.requestBound ||
    input.facts.serverOnly ||
    input.facts.exportsLoader ||
    input.facts.exportsAction
  )
    return { mode: "ssr", reason: "uses request-time server data" };
  if (input.facts.interactive)
    return { mode: "island", reason: "contains an interactive client subtree" };
  if (!input.facts.unresolvedDynamicImport)
    return { mode: "static", reason: "deterministic build-time route" };
  return {
    mode: "ssr",
    reason: "dynamic behavior could not be resolved safely",
  };
}
```

- [ ] **Step 5: Verify deterministic output and commit**

Run classification twice and compare JSON byte-for-byte. Then run:
`bun test packages/compiler && bun run typecheck:native`.

```bash
git add packages/compiler
git commit -m "feat: classify hybrid route output"
git push
```

### Task 6: Generate and inspect versioned build manifests

**Files:**

- Create: `packages/compiler/src/manifest.ts`
- Create: `packages/compiler/src/build.ts`
- Test: `packages/compiler/test/manifest.test.ts`
- Modify: `packages/cli/src/build.ts`
- Create: `packages/cli/src/inspect.ts`
- Modify: `packages/cli/bin/moonshine.ts`
- Test: `packages/cli/test/inspect.test.ts`

**Interfaces:**

- Consumes: discovered routes, mode decisions, `MoonshineManifest` contracts.
- Produces: `buildProject(options): Promise<MoonshineManifest>`, `readManifest(path)`, `formatInspection(manifest): string`.

- [ ] **Step 1: Write manifest snapshot test**

Build fixture project and assert `version: 1`, exact route ordering, decision
strings, entries, assets, capabilities, and relative POSIX paths. Assert
absolute source paths and environment variables are absent.

- [ ] **Step 2: Verify test fails**

Run: `bun test packages/compiler/test/manifest.test.ts`

- [ ] **Step 3: Implement Bun builds and manifest writer**

Call `Bun.build` separately for server and browser entry sets. Hash assets with
`Bun.CryptoHasher("sha256")`. Write sorted JSON with two-space indentation and
trailing newline to `.moonshine/manifest.json`.

- [ ] **Step 4: Implement CLI inspection**

Output one deterministic line per route:

```text
static  /                 deterministic build-time route
island  /counter          contains an interactive client subtree
ssr     /account/:id      uses request-time server data
api     /api/health       exports request handler
```

`inspect --json` prints the manifest unchanged.

- [ ] **Step 5: Verify build and CLI tests, then commit**

Run: `bun test packages/compiler packages/cli && bun run check`

```bash
git add packages/compiler packages/cli
git commit -m "feat: emit inspectable build manifest"
git push
```

### Task 7: Build shared server request pipeline

**Files:**

- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/pipeline.ts`
- Create: `packages/server/src/data.ts`
- Create: `packages/server/src/errors.ts`
- Create: `packages/server/src/serialize.ts`
- Create: `packages/server/src/static.ts`
- Test: `packages/server/test/pipeline.test.ts`
- Test: `packages/server/test/serialize.test.ts`
- Modify: `packages/core/src/server.ts`

**Interfaces:**

- Consumes: route graph, manifest, renderer contract.
- Produces: `createRequestHandler(options): (request: Request) => Promise<Response>`, `redirect`, `json`, `serializeData`, `resolveStaticPath`.

- [ ] **Step 1: Write pipeline-order and cancellation tests**

Assert middleware order `root before → child before → loader → child after →
root after`. Abort request signal during loader and assert loader sees
`signal.aborted === true` and rendering does not run.

- [ ] **Step 2: Write errors and serialization tests**

Assert thrown redirects preserve status/location; nearest error boundary handles
ordinary errors; production response omits stack. Assert serialization escapes
`<`, `>`, `&`, U+2028, and U+2029 and rejects functions, symbols, and cycles.

- [ ] **Step 3: Verify tests fail**

Run: `bun test packages/server`

- [ ] **Step 4: Implement public data types**

```ts
export type RouteContext = {
  request: Request;
  params: Record<string, string>;
  signal: AbortSignal;
};
export type Loader = (context: RouteContext) => unknown | Promise<unknown>;
export type Action = (
  context: RouteContext,
) => unknown | Response | Promise<unknown | Response>;
export type Middleware = (
  context: RouteContext,
  next: () => Promise<Response>,
) => Promise<Response>;
```

- [ ] **Step 5: Implement pipeline and safe serialization**

Use request signal directly. Execute independent layout and route loaders with
`Promise.all`; action runs before loaders for non-GET/HEAD requests. Merge
headers root-to-leaf with leaf precedence. Preserve existing static traversal
guard and MIME behavior by moving code, not rewriting semantics.

- [ ] **Step 6: Add core compatibility re-export and commit**

Run: `bun test packages/server packages/core/test examples/bun-server && bun run check`

```bash
git add packages/server packages/core package.json bun.lock
git commit -m "feat: add web-standard request pipeline"
git push
```

### Task 8: Implement React static, SSR, streaming, SPA, and islands

**Files:**

- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/src/index.ts`
- Create: `packages/react/src/renderer.tsx`
- Create: `packages/react/src/islands.tsx`
- Create: `packages/react/src/client.tsx`
- Create: `packages/react/src/serialize.ts`
- Test: `packages/react/test/renderer.test.tsx`
- Test: `packages/react/test/islands.test.tsx`
- Modify: `packages/core/src/react.ts`

**Interfaces:**

- Consumes: `Renderer`, `RenderContext`, route artifacts.
- Produces: `reactRenderer`, `island`, `hydrateIslands`, existing `createApp` and `useSignal` exports.

- [ ] **Step 1: Write mode fixture tests**

Assert static and SSR output contain accessible HTML, streaming response exposes
a `ReadableStream`, SPA returns root/client script shell, and API routes never
invoke React renderer.

- [ ] **Step 2: Write island safety tests**

```tsx
const Counter = island(() => import("./fixtures/Counter"));
```

Assert server output contains stable `data-moonshine-island` ID, escaped JSON
props, one modulepreload per shared entry, and no hydration script when route has
zero islands.

- [ ] **Step 3: Verify React tests fail**

Run: `bun test packages/react`

- [ ] **Step 4: Implement renderer with React server APIs**

Use `react-dom/server` `renderToReadableStream` when available and
`renderToString` for prerender. Use `hydrateRoot` per island and `createRoot` for
SPA mode. Do not add a Moonshine vnode.

- [ ] **Step 5: Preserve existing React API**

Move current `createApp`, `createMoonshineApp`, `useSignal`, and `useResource`
implementation into package. Re-export it from `@tschk/moonshine/react` so
existing consumers compile unchanged.

- [ ] **Step 6: Verify, enforce size, and commit**

Run: `bun test packages/react packages/core/test && bun run check:size && bun run check`

```bash
git add packages/react packages/core package.json bun.lock
git commit -m "feat: render React hybrid routes"
git push
```

### Task 9: Integrate Solid and Crepus renderer contracts

**Files:**

- Create: `packages/adapter-solid/src/framework.ts`
- Modify: `packages/adapter-solid/src/index.ts`
- Modify: `packages/adapter-solid/package.json`
- Test: `packages/adapter-solid/test/framework.test.tsx`
- Create: `packages/crepus-moonshine/src/framework.ts`
- Modify: `packages/crepus-moonshine/src/index.ts`
- Modify: `packages/crepus-moonshine/package.json`
- Test: `packages/crepus-moonshine/test/framework.test.ts`

**Interfaces:**

- Consumes: `Renderer` and `RenderContext` only.
- Produces: `solidRenderer`, `crepusRenderer`.

- [ ] **Step 1: Write renderer contract tests**

Run the same static/SSR response assertions against both renderers. Solid test
must assert framework implementation imports `solid-js/web`, not React or
Crepus React renderer. Crepus test must render all documented View IR kinds.

- [ ] **Step 2: Verify tests fail**

Run: `bun test packages/adapter-solid/test/framework.test.tsx packages/crepus-moonshine/test/framework.test.ts`

- [ ] **Step 3: Implement Solid renderer natively**

Use Solid `renderToStringAsync`/`renderToStream` and `hydrate`. Reuse Moonshine
route/data contracts but no React element or shared vnode types.

- [ ] **Step 4: Implement Crepus renderer adapter**

Wrap existing real-kind `renderCrepusIr` output with React renderer contract;
keep `ir-shared.ts` as the only React/Solid shared rendering helper surface.

- [ ] **Step 5: Verify full renderer surface and commit**

Run: `bun test packages/adapter-solid packages/crepus-moonshine && bun run check`

```bash
git add packages/adapter-solid packages/crepus-moonshine
git commit -m "feat: add Solid and Crepus framework renderers"
git push
```

### Task 10: Ship Bun and Node deployment adapters

**Files:**

- Create: `packages/adapter-conformance/package.json`
- Create: `packages/adapter-conformance/src/index.ts`
- Create: `packages/adapter-conformance/src/suite.ts`
- Create: `packages/deploy-bun/**`
- Create: `packages/deploy-node/**`
- Test: `packages/deploy-bun/test/conformance.test.ts`
- Test: `packages/deploy-node/test/conformance.test.ts`

**Interfaces:**

- Consumes: `MoonshineManifest`, compiled artifacts, shared request handler.
- Produces: `bunAdapter`, `createBunServer`, `nodeAdapter`, `createNodeHandler`, `adapterConformance(adapter, harness)`.

- [ ] **Step 1: Define conformance suite**

Suite must test static assets, static HTML, SSR, streamed response chunks, SPA
fallback, API methods, 404, redirects, headers, request cancellation, and
graceful shutdown. Harness exposes `start(): Promise<URL>` and
`stop(): Promise<void>`.

- [ ] **Step 2: Verify adapter tests fail**

Run: `bun test packages/deploy-bun packages/deploy-node`

- [ ] **Step 3: Implement Bun adapter**

Use `Bun.serve({ fetch, port: 0 })`; expose server `stop(true)` for graceful
shutdown. Serve manifest assets through safe static resolver. Stream responses
without buffering.

- [ ] **Step 4: Implement Node adapter**

Bridge `node:http` request/response to Fetch APIs, including `Readable.toWeb`
and `Readable.fromWeb`. Forward abort when client disconnects. No server
framework dependency.

- [ ] **Step 5: Verify conformance and commit**

Run: `bun test packages/adapter-conformance packages/deploy-bun packages/deploy-node && bun run check`

```bash
git add packages/adapter-conformance packages/deploy-bun packages/deploy-node package.json bun.lock
git commit -m "feat: deploy Moonshine on Bun and Node"
git push
```

### Task 11: Ship Cloudflare and Vercel deployment adapters

**Files:**

- Create: `packages/deploy-cloudflare/**`
- Create: `packages/deploy-vercel/**`
- Test: `packages/deploy-cloudflare/test/conformance.test.ts`
- Test: `packages/deploy-vercel/test/conformance.test.ts`
- Create: `examples/deploy-cloudflare/**`
- Create: `examples/deploy-vercel/**`

**Interfaces:**

- Consumes: deployment contract and conformance suite.
- Produces: `cloudflareAdapter`, default Worker `fetch`, `vercelAdapter`, generated Vercel Build Output API files.

- [ ] **Step 1: Write capability rejection tests**

Cloudflare must reject Node-only routes. Vercel edge must reject Bun-only APIs.
Error includes route path, requested runtime, adapter name, and supported
runtimes. Neither adapter may silently downgrade streaming.

- [ ] **Step 2: Verify tests fail**

Run: `bun test packages/deploy-cloudflare packages/deploy-vercel`

- [ ] **Step 3: Implement Cloudflare adapter**

Generate Worker entry using Fetch APIs and assets binding. Translate cache
metadata to `caches.default` only when route declares cache policy. Keep all
request state local to `fetch`.

- [ ] **Step 4: Implement Vercel adapter**

Generate `.vercel/output/config.json`, static files, Node functions, and edge
functions according to route runtime. Validate generated config against Vercel
Build Output API version 3 shape in tests.

- [ ] **Step 5: Run conformance fixtures and commit**

Run: `bun test packages/deploy-cloudflare packages/deploy-vercel && bun run check`

```bash
git add packages/deploy-cloudflare packages/deploy-vercel examples package.json bun.lock
git commit -m "feat: deploy on Cloudflare and Vercel"
git push
```

### Task 12: Replace CLI with framework-aware development workflow

**Files:**

- Modify: `packages/cli/src/new.ts`
- Modify: `packages/cli/src/dev.ts`
- Modify: `packages/cli/src/build.ts`
- Create: `packages/cli/src/preview.ts`
- Create: `packages/cli/src/config.ts`
- Modify: `packages/cli/bin/moonshine.ts`
- Test: `packages/cli/test/new.test.ts`
- Create: `packages/cli/test/workflow.test.ts`

**Interfaces:**

- Consumes: compiler `buildProject`, adapters, `MoonshineConfig`.
- Produces commands `new`, `dev`, `build`, `preview`, `inspect`, `compile`.

- [ ] **Step 1: Write scaffold matrix tests**

Test default minimal Bun project plus `--react`, `--solid`, `--crepus`,
`--adapter bun|node|cloudflare|vercel`, and retained `--vite` compatibility.
Assert generated dependencies contain only selected layers.

- [ ] **Step 2: Write full workflow smoke test**

Scaffold temp project, run build, inspect, preview on port 0, fetch `/`, and
assert status 200 plus `data-moonshine-mode`. Stop preview and assert process
exits cleanly.

- [ ] **Step 3: Verify CLI tests fail**

Run: `bun test packages/cli`

- [ ] **Step 4: Implement commands without Vite dependency for default path**

`dev` runs compiler watch plus Bun adapter. `build` invokes compiler and selected
adapter. `preview` loads built manifest only. `--vite` keeps current explicit
SPA path. Config loading uses native dynamic `import(pathToFileURL(path).href)`.

- [ ] **Step 5: Update CLI help and commit**

Run: `bun test packages/cli && bun run moonshine -- --help && bun run check`

```bash
git add packages/cli package.json bun.lock
git commit -m "feat: add hybrid framework CLI workflow"
git push
```

### Task 13: Add real five-mode hybrid application and external install fixtures

**Files:**

- Create: `examples/hybrid-app/**`
- Create: `scripts/test-packed.ts`
- Test: `examples/hybrid-app/test/app.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: all framework packages and Bun adapter.
- Produces: canonical example and `bun run test:packed` release gate.

- [ ] **Step 1: Create route fixture expectations**

Routes: `/` static, `/counter` island, `/account/:id` SSR loader,
`/dashboard/*` SPA, `/api/health` API. Test `moonshine inspect` reports each
exact mode and browser JavaScript is absent from `/` except shared navigation
required by configuration.

- [ ] **Step 2: Verify example test fails**

Run: `bun test examples/hybrid-app`

- [ ] **Step 3: Implement minimal example**

Use native HTML controls, one signal counter, one request-time loader, and one
JSON API handler. Do not add UI libraries or sample database abstractions.

- [ ] **Step 4: Implement packed-package fixture**

`scripts/test-packed.ts` runs `bun pm pack` for every public package, creates a
temporary project, installs tarballs with `bun add`, builds all five modes, and
fetches Bun/Node previews. It must never resolve workspace packages.

- [ ] **Step 5: Add CI fixture and size gates, then commit**

Run: `bun test examples/hybrid-app && bun run test:packed && bun run check:size && bun run check`

```bash
git add examples/hybrid-app scripts/test-packed.ts package.json .github/workflows/ci.yml
git commit -m "test: cover complete hybrid application"
git push
```

### Task 14: Align Moonshine philosophy, references, and comparisons

**Files:**

- Modify: `README.md`
- Modify: `DESIGN.md`
- Modify: `docs/COMPARE.md`
- Modify: `AGENTS.md`
- Modify: `packages/*/README.md`
- Create: `docs/ROUTING.md`
- Create: `docs/DEPLOYMENT.md`
- Create: `docs/MANIFEST.md`

**Interfaces:**

- Consumes: tested behavior from Tasks 1–13.
- Produces: canonical public description and exact user documentation.

- [ ] **Step 1: Replace stale identity everywhere**

Canonical text:

> Moonshine is a ground-up, Bun-first web framework built from a hyperminimal
> signal kernel. Start with signals; add only the routing, rendering, server,
> compiler, and deployment layers your project needs.

Remove claims that Moonshine has no compiler, never targets metaframework
features, or intentionally leaves hydration/build integration unresolved.

- [ ] **Step 2: Update comparisons from verified fixtures**

Compare default kernel weight, route modes, deployment targets, renderer model,
and opt-in capabilities against Astro, Waku, SolidStart, SvelteKit, Next, and
OpenNext. Link primary documentation. Include no speed ranking unless a checked-
in benchmark measures equivalent work.

- [ ] **Step 3: Document exact APIs and migration**

Document filesystem conventions, explicit route mode override, config,
manifest schema, each CLI command, provider limitations, and compatibility
re-exports from `@tschk/moonshine/router|server|react`.

- [ ] **Step 4: Verify docs and commit**

Run: `bun run format && bun run check && bun test`

```bash
git add README.md DESIGN.md AGENTS.md docs packages/*/README.md
git commit -m "docs: define Moonshine framework philosophy"
git push
```

### Task 15: Rewrite requested public organization READMEs

**Files:**

- Modify: `/Users/undivisible/projects/undivisible/README.md`
- Modify: `/Users/undivisible/projects/tsc.hk/README.md`
- Modify: `/Users/undivisible/projects/tschk.github/README.md`

**Interfaces:**

- Consumes: canonical text and verified Moonshine links from Task 14.
- Produces: aligned public project/profile descriptions in three repositories.

- [ ] **Step 1: Load public-writing rules and clone missing repositories**

Read `/Users/undivisible/.pi/agent/skills/need-to-know/SKILL.md`. For each absent
working copy, run:

```bash
gh repo clone undivisible/undivisible /Users/undivisible/projects/undivisible
gh repo clone tschk/tsc.hk /Users/undivisible/projects/tsc.hk
gh repo clone tschk/.github /Users/undivisible/projects/tschk.github
```

- [ ] **Step 2: Inspect each repository instructions and existing README**

Read root `AGENTS.md` or `CLAUDE.md` before editing. Preserve unrelated profile,
project, and organization content. Replace only Moonshine descriptions and
framework philosophy; add one canonical repository link.

- [ ] **Step 3: Write concise public copy**

Use canonical Task 14 paragraph. In project lists, describe Moonshine as
“ground-up Bun-first hybrid web framework with a signal-only kernel and opt-in
compiler, routing, rendering, server, and deployment layers.” Do not include
internal roadmap, audit notes, release mechanics, or unsupported performance
claims.

- [ ] **Step 4: Run repository-specific Markdown gates and commit each repo**

Use commands declared by each repository manifest. If no Markdown gate exists,
run `bunx prettier --check README.md` without changing dependencies.

```bash
git add README.md
git commit -m "docs: align Moonshine framework description"
git push
```

Run commit/push separately inside each of the three repositories.

### Task 16: Audit correctness, security, performance, and complexity

**Files:**

- Create: `docs/audits/0.3.0-framework-audit.md`
- Modify: only files required by confirmed findings.

**Interfaces:**

- Consumes: complete framework and fixture suite.
- Produces: resolved audit evidence with no open release blockers.

- [ ] **Step 1: Run correctness and impact analysis**

Review route precedence, request cancellation, serialization, static traversal,
cache isolation, adapter capability failure, and compatibility exports. Search
every caller before changing shared functions.

- [ ] **Step 2: Run security checks**

Run secret scan, dependency audit available through Bun, static analysis, and
manual trust-boundary review. Specifically test encoded traversal, malformed
URI parameters, HTML/script injection in serialized data, open redirects,
header injection, request smuggling boundaries in Node bridge, and cross-request
state leakage.

- [ ] **Step 3: Benchmark measured paths**

Measure route discovery, classification, manifest generation, cold build,
incremental rebuild, server startup, static request, and SSR request for 10,
100, and 1,000 routes. Record median of at least 10 runs and environment.

- [ ] **Step 4: Run ponytail complexity audit**

List duplicate wrappers, one-use abstractions, unnecessary dependencies, and
code replaceable by Bun/Web/Node standard APIs. Apply confirmed deletions before
release. Do not add C++ unless compiler benchmark meets all native policy gates.

- [ ] **Step 5: Record evidence and fix blockers**

Audit document contains commands, versions, results, resolved finding commits,
and explicit release verdict. It contains no unresolved high/critical security
finding, failing conformance target, or unverified capability claim.

- [ ] **Step 6: Re-run all gates and commit**

Run: `bun install --frozen-lockfile && bun run format && bun run lint && bun run typecheck && bun run typecheck:native && bun test && bun run check && bun run check:size && bun run test:packed && (cd dart/moonshine_jaspr && dart analyze && dart test)`

```bash
git add docs/audits packages scripts examples
git commit -m "fix: resolve 0.3.0 framework audit"
git push
```

### Task 17: Version, tag, and publish `0.3.0`

**Files:**

- Modify: every public `packages/*/package.json`
- Modify: `components/package.json`
- Modify: `bun.lock`
- Create: `CHANGELOG.md`
- Create: `scripts/release.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: clean audit verdict and packed-install gate.
- Produces: git tag `v0.3.0` and public npm packages at version `0.3.0`.

- [ ] **Step 1: Write release validation script and test**

`scripts/release.ts --check 0.3.0` must verify clean git status, `main` tracking
`origin/main`, every public package at exact version, internal dependency ranges
at `^0.3.0`, no `workspace:*` or `file:` in packed manifests, npm identity, and
package ownership through `bunx npm view <name> maintainers --json` only if Bun
lacks equivalent registry inspection.

- [ ] **Step 2: Verify release check fails before versioning**

Run: `bun scripts/release.ts --check 0.3.0`

Expected: FAIL listing packages still at `0.2.0`.

- [ ] **Step 3: Set versions and changelog**

Set all public Moonshine packages and internal ranges to `0.3.0`/`^0.3.0` in
dependency order. Changelog sections: kernel compatibility, hybrid routes,
compiler/manifest, server data flow, renderers, deployment adapters, CLI,
migration, and verified limitations.

- [ ] **Step 4: Run immutable release gates**

Run all Task 16 gates, `bun scripts/release.ts --check 0.3.0`, and `bun pm pack`
for each package. Compare git status to expected version/changelog files only.

- [ ] **Step 5: Commit and tag**

```bash
git add package.json packages components bun.lock CHANGELOG.md scripts/release.ts
git commit -m "release: moonshine 0.3.0"
git push
git tag -s v0.3.0 -m "Moonshine 0.3.0"
git push origin v0.3.0
```

If signing is unavailable, stop before creating an unsigned tag and configure
the existing signing identity; do not weaken repository tag policy.

- [ ] **Step 6: Publish in dependency order with Bun**

Publish framework contracts, kernel, router, server, renderers, compiler,
deployment adapters, host adapters, components, and CLI. From each package:

```bash
bun publish --access public --provenance
```

Stop immediately on first registry failure. Never republish or overwrite a
version.

- [ ] **Step 7: Verify registry installation**

Create a clean temporary directory, install `@tschk/moonshine@0.3.0` and
`@tschk/moonshine-cli@0.3.0` through Bun, scaffold/build/serve the five-mode
fixture, and query every published package with the registry. Record successful
package/version list in release commit follow-up only if evidence needs updating.

- [ ] **Step 8: Confirm clean synchronized repositories**

Run `git status --short`, `git log -1 --decorate`, and verify all four README
repositories are synchronized with their remotes. Expected Moonshine status is
clean with `HEAD` tagged `v0.3.0`.

---

## Final Acceptance Gate

- [ ] Kernel default export contains signals/resources only and meets 12 KiB budget.
- [ ] Hybrid fixture proves static, SSR, island, SPA, and API modes together.
- [ ] Compiler auto decisions are deterministic, inspectable, and overridable.
- [ ] Bun, Node, Cloudflare, and Vercel pass shared conformance tests.
- [ ] React, Solid, and Crepus use independent native renderer ownership.
- [ ] Request cancellation, serialization, traversal, and request isolation tests pass.
- [ ] `tsc`, `tsgo`, format, lint, tests, size, packed install, Dart, and CI pass.
- [ ] Moonshine and three requested public READMEs state the same tested philosophy.
- [ ] Audit has no release blocker or unsupported comparison claim.
- [ ] npm `0.3.0` packages install and build outside the monorepo.
