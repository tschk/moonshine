# Moonshine 0.4.31

- Document and verify default component models compiled by local Crepuscularity
  through Moonshine's existing typed props/emits. No runtime code or dependencies
  were added. Children declare modelValue and update:modelValue explicitly.
- Thirteen authored parent/child Chromium phases match Vue 3.5.13, including both
  listener orders, once listeners, external writes and independent roots. Active
  setup emits match repeated fresh Bun/minified Node SSR; declaration consumers
  retain required prop and callback payload checks in both TypeScript lanes.
- Core parser tests, 848 native library tests, focused compiler checks, Clippy,
  full typechecks and the 856-module source gate pass. The local full SDK run has
  16,395 passes and one unchanged kernel bundling timeout; that test passes alone
  in 1.47 seconds under the same five-second deadline.
- Signal kernel stays 4,041 raw bytes. This component fixture is 10,510 gzip bytes
  versus Vue's 21,104; no startup/runtime speed claim.
- Compiler changes and source-order metadata remain local/unpublished. Named and
  multiple models, model modifiers, defineModel and hydration remain unsupported.
  npm publication remains manual.

# Moonshine 0.4.30

- Add independent opt-in Vue single/multiple select models and typed option
  factories, including numeric conversion, Array/Set outputs, duplicate-choice
  retention, reactive option values, programmatic Set updates and owner cleanup.
- Reuse the existing Vue scheduler for authored component update semantics;
  compiler helper elements retain the parent's update group. Source SSR keeps
  its distinct option selection/serialization policy.
- Eight direct Chromium cases, eleven source SSR cases and thirteen actual SFC
  browser phases match Vue 3.5.13. Repeated fresh Bun/minified Node SSR, public
  declaration consumers, full typechecks, 856-module source acceptance and native
  checks pass. Full SDK run: 16,395 passing test executions with file isolation.
- Existing counter bundle and 4,041-byte signal kernel stay unchanged. The select
  fixture is 11,722 gzip bytes versus Vue's 21,900; no startup/runtime speed claim.
- Source compilation requires local unpublished Crepuscularity changes. Only
  inline options/optgroups and the number modifier are supported; nested selects,
  component-supplied options, component models and hydration remain unsupported.
  npm publication remains manual.

# Moonshine 0.4.29

- Add independent checkbox/radio DOM and source SSR factories on Vue's opt-in
  model entries: typed scalar values, loose array membership in click order,
  identity-based Sets, programmatic Set updates and owned listener cleanup.
- Verify eleven direct browser cases and thirteen authored SFC phases against
  Vue 3.5.13. Root, nested and fragment SSR contexts preserve the source policy;
  twenty root/nested calibration cases and repeated Bun/minified Node renders
  match structure, attributes and text, ignoring only attribute order and
  equivalent checked-attribute spelling.
- Full SDK checks pass, including 16,371 test executions with Bun file isolation,
  both TypeScript lanes, the 856-module source gate and native compiler checks.
  The existing counter bundle and 4,041-byte signal kernel stay unchanged.
  The compared form workload is 9,957 gzip bytes versus Vue's 21,855; no speed claim.
- Source lowering requires local unpublished Crepuscularity changes. Select and
  component models, checked-model modifiers, dynamic types and hydration remain
  unsupported. npm publication remains manual.

# Moonshine 0.4.28

- Add independent classic Set tracking to native Vue reactive state and deep
  refs: per-key membership, size/iteration, raw/proxy object identity, no-op
  suppression and owned cleanup. Shallow refs and non-extensible Sets stay opaque.
- Add native `/store` `unwrap`, also available through Solid's `/store` entry.
  Direct stores return their original target; ordinary containers unwrap
  embedded proxies, frozen containers copy, and mutable object getters skip.
- Verify ten API and ten authored SFC browser phases against Vue 3.5.13,
  repeated Bun/minified Node SSR and both public declaration consumer lanes.
  Container unwrapping matches installed Solid 1.9.14 on the compared cases.
- All 2,334 tests pass with Bun file isolation and the unchanged timeout;
  standard CI also passes. The 856-module source gate and compiler checks pass.
- The existing Vue counter fixture grows by 730 gzip bytes. Signal-only kernel
  remains 4,041 raw bytes. No new dependencies or speed claim.
- Global `Set<T>` source props require the local unpublished Crepus change.
  Checkbox/radio models, Map/weak-collection reactivity, Set algebra and readonly
  runtime views remain unsupported. npm publication remains manual.

# Moonshine 0.4.27

- Preserve own enumerable string and symbol props in native Astro component
  snapshots, and normalize final `class:list` values after prop overrides.
  Caller props stay unchanged and projected slots retain their separate channel.
- Local Crepus lowering now accepts ordered component prop spreads, including
  `Astro.props`, nullish values, imported children and existing conditional/map
  markup. The compiler patch remains local and unpublished.
- Verify exact repeated Bun/minified Node SSR against Astro 7.4.0, including
  getter/class-list timing, escaping, special keys, ordinary children/slots
  props and request isolation. Both declaration consumer lanes pass.
- Verify 2,311 SDK tests and the 856-module source gate. Intrinsic HTML and slot
  outlet spreads, async rendering, islands and host compiler APIs remain
  unsupported. No new dependencies; signal kernel remains 4,041 raw bytes.
  No performance claim; npm publication remains manual.

# Moonshine 0.4.26

- Add opt-in Vue `./model` and `./model/ssr` factories with independent text
  and numeric model behavior, IME composition, lazy/trim/number modifiers,
  live attributes, listener ordering and owner cleanup. No new dependencies.
- Local Crepus source lowering supports writable setup refs and reactive/ref
  members on supported static input types and textarea. The compiler patch is
  unpublished; this release does not add compiler distribution or hydration.
- Verify 15 browser phases against Vue 3.5.13 and exact repeated SSR in fresh
  Bun and minified Node. For this authored form fixture only, production gzip
  is 9,006 bytes native versus 21,526 bytes Vue with Options API disabled.
- Keep select, checkbox, radio, file and component models, dynamic types and
  readonly/unknown targets unsupported. The signal kernel remains 4,041 raw
  bytes. No speed claim; npm publication remains a separate manual operation.

# Moonshine 0.4.25

- Accept an explicit location-bound ready-data seed as the third argument to
  `createDataRouter`. Matching pathname/query data skips the initial client load;
  mismatches fetch normally without exposing stale data.
- Preserve falsy and explicit undefined payloads, ownership, reload retention,
  navigation clearing, successful-action revalidation and disposal behavior.
- Verify real server-loader results through the existing HTML-safe serializer
  into two isolated browser contexts: zero initial API calls, then ordinary
  reload/navigation requests. Applications still own transport and validation.
- The opt-in data export fixture grows by 49 raw / 38 gzip bytes. The signal
  kernel remains 4,041 raw bytes; no new dependencies or speed claim.
- This adds no automatic data endpoint, route cache, error transport, nested
  loader matching or DOM hydration. Source compiler changes remain unpublished.

# Moonshine 0.4.24

- Add opt-in `@tschk/moonshine-router/data-react` with `useRouteData` for
  the owning native runtime's complete pending, ready and error state.
- Preserve retained data on reload, clear prior-location data on navigation,
  follow runtime changes, and unsubscribe on unmount. SSR reads the supplied
  runtime snapshot; loader errors remain state values.
- Require a data runtime and keep payloads typed as `unknown` for application
  narrowing. This does not implement TanStack route matches or loader hooks,
  SSR data seeding, serialization, Suspense or hydration.
- No new dependencies. The renderer-neutral `/data` bundle is byte-identical
  and React-free; the signal kernel remains 4,041 raw bytes. No speed claim.

# Moonshine 0.4.23

- Skip empty cleanup tracking closures in the independent native effect and memo
  runtime. Preserve cleanup ownership, disposal and untracked cleanup reads.
- Paired production Chromium reactive workloads measured roughly 7–13% lower
  effect/memo times across three contexts. Cleanup-heavy timings stayed roughly
  flat; the multi-workload fixture grows by 12 gzip bytes. This is reactive
  throughput evidence, not an application, DOM, paint or universal speed claim.
- The checked SSR fixture remains 11,523 raw / 4,528 gzip bytes. The signal-only
  kernel remains 4,041 raw bytes. No new dependencies or compatibility APIs.
- Hydration, async SSR and full source-language compatibility remain unsupported.

# Moonshine 0.4.22

- Add compiler-facing `sourceComponent`, `sourceSlot` and `SourceSlots` on the
  opt-in Astro `/ssr` entry, keeping slots outside ordinary component props.
- Capture props eagerly, defer and cache component initialization, and preserve
  caller ownership for lazy slot content. Empty supplied slots suppress fallback.
- Cover forwarding, repeated outlets, ordinary props, special names, escaping,
  initialization failures and explicitly rejected async content.
- Local Crepuscularity now lowers default and static named slots, named Fragments
  and forwarding through imported layouts. Compiler changes remain unpublished;
  dynamic/empty names, `Astro.slots` utilities and full slot coverage remain open.
- No new dependencies. The signal-only core remains 4,041 bytes; no relative
  framework size or speed improvement is claimed. Async SSR, hydration and
  arbitrary host-compiled output remain unsupported.

# Moonshine 0.4.21

- Add opt-in `@tschk/moonshine-router/data` for client-safe loaders, cancellation,
  latest-load invalidation, action revalidation and disposal, without React.
- Connect TanStack invalidation and loading state to the owning data runtime.
  Navigation-only invalidation now rejects instead of silently doing nothing.
- Keep successful action results when follow-up loading fails. Successful writes
  still refresh current data after navigation or submission supersession.
- Verify real browser mutation/reload, cancellation, stale responses and disposal,
  plus mounted loading consumers and isolated Bun/Node/type consumers.
- No new dependencies. The signal core remains 4,041 bytes and the navigation-only
  bundle is unchanged. No relative framework performance improvement is claimed.
- Automatic server data endpoints, loader hooks, route caches, SSR data seeding,
  hydration and full host compatibility remain unsupported.

# Moonshine 0.4.20

- Expose independent synchronous `createComputed` from the opt-in Solid entry.
  It reuses the native graph with previous-value, batching and cleanup behavior.
- Extend the host-free consumer regression to exercise that public export.
- Local Crepuscularity admits explicit Solid-source computed imports and improves
  Astro regex/division, nested templates and combined class-list lowering.
  These compiler changes remain unpublished; full SFC support, hydration,
  async SSR and arbitrary host-compiled output remain unsupported.
- No new dependencies. The default signal-only core remains 4,041 bytes;
  no relative size or performance improvement is claimed.

# Moonshine 0.4.19

- Preserve literal HTML initial-newline behavior in opt-in Astro SSR textareas.
  Ordinary native DOM factories retain their existing property-value protection.
- Expand the isolated Bun/Node authored-source regression with preformatted text,
  textareas and same-line root sibling spaces.
- Local Crepuscularity now retains whitespace in authored pre/textarea bodies,
  nested pre elements and expression boundaries without changing legacy template
  formatting. Compiler changes remain unpublished; branch-text punctuation,
  slots, async rendering, hydration and full host compiler ABI remain unsupported.
- No new dependencies. The default signal-only core remains 4,041 bytes;
  no relative bundle-size or runtime performance improvement is claimed.

# Moonshine 0.4.18

- Add opt-in Astro `/ssr` factories independent of Astro, React and parser WASM.
- Preserve literal HTML attributes separately from DOM properties, normalize
  class lists and style objects, and capture component props once per invocation.
- Escape ordinary children and reject async children without leaking rejected
  promises. Keep default signals and all existing renderer entries unchanged.
- Local Crepuscularity integration now executes synchronous Astro frontmatter,
  typed props and imported child components. Compiler changes remain unpublished.
  Slots, hydration, async rendering and the full Astro compiler ABI are unsupported.
- No new dependencies or bundle-size/runtime performance advantage claimed.

# Moonshine 0.4.17

- Add independent captured-owner helpers on Solid `/solid` and `/ssr`, preserving
  context, cleanup ownership and untracked synchronous callbacks after async work.
- Restore the previous owner/tracking state, start new effects after callback setup,
  and route synchronous failures through captured native error owners.
- Preserve the generic DOM owner-swap API and signal-only core. Existing effects
  and failure cleanup retain native timing; native owners do not implement Solid's
  compiler owner ABI or Transition/Suspense scheduling. Re-enter after each await.
- Marked source owner imports and aliases are verified locally in Crepuscularity;
  compiler changes remain unpublished. No new dependencies or size/speed win claimed.

# Moonshine 0.4.16

- Apply React Router-compatible `data(payload, init)` status and headers to
  native server-rendered responses without serializing or wrapping page data.
- Merge layout-to-page loader metadata with explicit action precedence, retain
  separate cookies, and expose the result to response middleware. Discard rendered
  bodies for 204, 205 and 304 and cancel unused streams on invalid metadata.
- Keep the default signal-only core and dependencies unchanged. Direct or thrown
  `Response` values bypass data metadata; thrown wrappers and client data-router
  hooks remain unsupported. No complete React Router data-router parity is claimed.

# Moonshine 0.4.15

- Preserve native Solid list callback capture, unbound calls and DOM callback arity.
- Retain duplicate row identity and indexed slot values, dispose removed rows before
  replacement setup, and own lazy fallbacks across notified empty-list changes.
- Observe notified changes to the same array while preserving default native mapper
  scheduling and strict generic Svelte helper types. Keep the core signal-only.
- Authored list lowering is verified locally in Crepuscularity and remains
  unpublished. Hydration, async SSR and the full Solid compiled ABI remain
  unsupported. The measured list fixture is larger than the Solid reference.

# Moonshine 0.4.14

- Add independent synchronous Solid `For` and `Index` helpers on `/ssr`,
  retaining request context, captured row values and lazy empty-list fallbacks.
- Infer DOM and SSR list fallback types independently from row results while
  preserving explicit two-type-argument calls. Keep the signal-only core unchanged.
- Authored `<For>` / `<Index>` compilation remains unsupported until callback
  contextual types are preserved. Hydration and async SSR remain unsupported.

# Moonshine 0.4.13

- Add opt-in native `bindFiles` and the independent Svelte binding re-export,
  preserving FileList writes, nullish models, connected-form reset and cleanup.
- Keep the signal-only default entry unchanged. Native disposal removes saved
  detached-input listeners, an explicit difference from the Svelte reference.
- Authored `bind:files` compilation is verified locally in Crepuscularity and
  requires this runtime export; compiler publication is separate. Hydration,
  dynamic input types, spreads and function bindings remain unsupported.

# Moonshine 0.4.12

- Add independent `readonly(store)` subscriptions on the opt-in Svelte store
  entry, preserving custom receivers and subscription cleanup.
- Carry request-scoped response headers through buffered server responses,
  redirects, errors and HEAD on Bun and Node, retaining separate cookie fields.
- Add independent Next-style cookie set/delete operations, validated attributes,
  encoded values and shared request-local reads, without loading Next.
- Keep the default signal core unchanged. Streaming Server Actions, signing,
  Next cache behavior and full SFC compatibility remain unsupported.
  Crepuscularity source compilation is released separately.

# Moonshine 0.4.11

- Add compiler-facing `hSourceEntries` for ordered, lazy SSR attributes,
  including repeated authored names, with existing escaping and validation.
- Support explicit mixed radio/checkbox input groups with shared membership,
  preserving selected radio payloads during checkbox writes and owner cleanup.
- Keep the default entry signal-only and dependencies unchanged. Crepuscularity
  source compilation is released separately; full SFC and hydration support
  remain incomplete.

# Moonshine 0.4.10

- Add an explicit compiler-facing SSR selection policy that preserves authored
  option selection flags alongside raw binding matches. Native selection boxes
  retain their existing override behavior.
- Preserve typed source option value attribute placement without invoking an
  overridden value getter, and validate selection-policy metadata as own data.
- Keep the signal-only default entry unchanged. Select source lowering belongs
  to the separately maintained Crepuscularity compiler and is not published by
  this runtime release. Hydration and full SFC compatibility remain incomplete.

# Moonshine 0.4.9

- Extend the opt-in DOM `hNS` factory to MathML and custom namespace strings,
  retaining concrete HTML/SVG/MathML element types and browser namespace errors.
- Add the compiler-facing `hSourceNS` factory for runtime namespace values,
  preserving browser DOMString conversion while ordinary `h` and `hNS` retain
  their existing conversion and validation contracts.
- Keep the signal-only default entry unchanged. Matching authored Svelte
  namespace lowering stays in Crepuscularity and is not published by this
  runtime release. Full SFC coverage, hydration and async SSR remain incomplete.

# Moonshine 0.4.8

- Add independent class directive normalization to the opt-in Svelte `/class`
  entry, preserving base classes, scope-hash precedence, flag order and token
  removal without loading Svelte.
- Keep the default signal entry unchanged. Authored class directives, dynamic
  elements, scoped-selector fixes and shared entity decoding belong to the
  separately maintained Crepuscularity compiler; this runtime release does not
  publish those compiler changes or claim full SFC coverage.
- Hydration, asynchronous SSR and remaining source compatibility gaps stay
  explicit.

# Moonshine 0.4.7

- Add opt-in DOM `/head` and synchronous `/head-ssr` entries for owned head
  nodes, reactive document titles and separate SSR head/body output.
- Collect component head declarations in the native framework renderer;
  component titles override fallback route metadata.
- Isolate nested SSR requests and accepted render buffers while preserving
  component lifecycle cleanup and discarding failed head declarations.
- Keep the default signal entry unchanged. Matching authored Svelte lowering
  remains in Crepuscularity and is not published by this runtime release.
  Hydration, asynchronous SSR and complete SFC compatibility remain unsupported.

# Moonshine 0.4.6

- Add the opt-in `@tschk/moonshine-dom/platform` compiler entry, providing
  `sourceRealm` and type-only `GlobalTypes` exports for generated code.
- Ship the platform entry as JavaScript with type declarations so the public
  npm subpath loads directly in Node without TypeScript stripping.
- The signal-only entry remains unchanged. Source parsing and lowering stay in
  Crepuscularity; this runtime release does not publish new component syntax or
  claim complete SFC, hydration or async SSR support.

# Moonshine 0.4.5

- Add opt-in `hSource` intrinsic SSR construction with source attribute semantics,
  eager reads/coercion, nullish value omission and existing owned child contracts.
  Component calls and generic `h` keep their existing behavior.
- The signal-only kernel remains unchanged. The matching Crepuscularity source
  compiler candidate is validated separately and is not published by this release.
  Full Svelte ABI, hydration, async SSR and arbitrary SVG remain unsupported.
- See docs/native-source-ssr.md for verification scope and bundle-size tradeoffs.

# Moonshine 0.4.4

- Add opt-in lexical HTML/SVG factories for compiler-generated DOM components.
  Authored xmlns attributes no longer have to select their creation namespace.
- Add native Svelte element references with typed paths, action/publication
  ordering, replacement protection and source-owned teardown. Existing component
  references keep their default types and behavior.
- The signal-only entry is unchanged. Source parsing remains in Crepuscularity;
  this release supplies runtime helpers, not new syntax in its published compiler.
  Source SVG SSR, intrinsic spreads and arbitrary precompiled Svelte remain
  unsupported. See docs/native-element-references.md.

# Moonshine 0.4.3

- Native `Show` accepts an optional compiler-provided condition cache, allowing
  lazy validation after ancestor branches retire. Existing callers retain the
  default cache. Disposed branches return without reading their conditions.
- The signal-only entry remains unchanged. This release does not add SFC syntax
  to the published Crepuscularity compiler or complete source compatibility.

# Moonshine 0.4.2

- The signal kernel installs no runtime dependencies. Rendering and framework
  bridges remain separate imports; dependency observation is opt-in on `/tracking`.
- New `@tschk/moonshine-dom` provides independent owned DOM and buffered SSR
  rendering, reactive controls, stores, resources and component contexts.
- Solid and Svelte adapters replace their host runtime dependencies with native
  Moonshine APIs. Recompile authored components through Crepuscularity; arbitrary
  precompiled components, hydration and async SSR are not supported.
- Vue adds native composition, component lifecycle and application helpers.
  `/vue` and `/compiler-sfc` remain explicit legacy entries requiring Vue.
- Native framework contracts add document metadata and opt-in Bun/Node request
  context. The signal-only entry does not load these capabilities.
- `moonshine new` defaults to independent native server and browser entries.
  Native builds produce portable Bun/Node artifacts and opt-in Cloudflare or
  Vercel output; hydration and native islands remain unsupported.
- `moonshine compile` delegates source lowering to Crepuscularity and preserves
  validated emitted module graphs and CSS. No component parser is bundled here.
- Angular, Astro and Nuxt roots use native signal bridges and lazy rendering.
  Their explicit legacy subpaths still require the corresponding host.
- React adapters scope navigation to the owning router, preserve history state
  where supported, and leave downloads and external links to the browser.

# Moonshine 0.3.6

## Compiler

- The server bundle now registers the layouts, middleware, and error boundaries
  its routes render through, not just the page and its data module. They were
  absent, so the renderer fell back to `await import(file)` on their source
  paths. That resolves in a checkout, where the source sits beside the build
  output, and fails in a deployed image that ships only the build — a route
  renders locally and returns 500 in production. It also fails outright on a
  runtime that cannot resolve a dynamic import, which is the case
  `registerRouteModules` exists for.

# Moonshine 0.3.5

## Compiler

- Browser bundles now begin with `globalThis.process ??= { env: {} };`. Client
  code and its dependencies routinely read `process.env.X`; browsers have no
  `process`, so that reference threw `ReferenceError: process is not defined`
  while the client entry module was still evaluating — before any component
  rendered and before an error boundary could mount. The page stayed blank with
  an empty console, which is close to undiagnosable from the outside. The shim
  uses `??=`, so an application that injects its own public values ahead of the
  bundle keeps them. Values are deliberately not inlined: inlining the process
  environment into a browser bundle would ship whatever secrets the build host
  holds. Server bundles are untouched, where a real `process` exists and
  shimming it would mask genuine environment faults.

# Moonshine 0.3.3

## Host adapters

- `@tschk/moonshine-next` reimplements the Next.js API surface instead of re-exporting it: `next/link`, `next/navigation`, `next/image`, `next/script`, `next/dynamic`, `next/headers`, and `next/font/google` are built on the moonshine router and signal runtime, and `next` is no longer a dependency, peer dependency, or devDependency.
- New `@tschk/moonshine-react-router`, `@tschk/moonshine-tanstack`, and `@tschk/moonshine-waku` reimplement the react-router / `@remix-run/react`, TanStack Router / Start, and Waku client router APIs on `@tschk/moonshine/router`. None imports or depends on the framework it replaces.
- Each reimplementing adapter ships an `/aliases` specifier map so an application can alias the host specifier and drop the host package.
- `packages/core/test/adapters-contract.test.ts` enforces the adapter set, the forbidden-dependency and forbidden-import rules, and the required subpath exports.

## CLI

- New `moonshine adopt [dir] [--dry-run] [--force]`. It points at an existing App Router or Pages Router project, writes `compilerOptions.paths` aliasing every implemented `next/*` specifier at the adapter files inside the project's own `node_modules`, writes `moonshine.config.ts`, and edits no source files. It ends with a scorecard listing what it cannot carry over: middleware, `next.config`, the metadata API, ISR, server actions, async server components, and image optimization.
- `discoverRoutes` gains a `convention` option (`next-app`, `next-pages`) so `app/` and `pages/` trees are read in place.

## Security

- `errorResponse` no longer echoes a thrown value's message in the 500 body outside development mode; `mode` is optional, so the previous default disclosed internal detail.
- `Link` passes `href` through `safeHref`, rejecting script-capable schemes and control characters. Modifier and middle clicks defer to the browser, so an unfiltered `href` was a stored-XSS sink.
- Static file serving rejects dot-prefixed path segments (`.well-known` still allowed) and sets `X-Content-Type-Options: nosniff`.
- Static containment compares real paths, so a symlink inside the root pointing outside it is no longer served. `@tschk/moonshine-deploy-node` reuses the same check (exported as `isContained`) and sets `nosniff`.
- `@tschk/moonshine-deploy-node` accepts the `Host` header only as a bare host with an optional port (bracketed IPv6 included) before building `request.url`, and otherwise falls back to localhost.

## Correctness

- `cloudflareFetch` builds its handler with the `modules` map, so API route loaders, actions, and handlers actually run and page routes resolve their component.
- `serializeIslandProps` detects cycles by walking the ancestor chain instead of a global visited set, so an object referenced twice in the payload is no longer rejected.

## Performance

- `createMemo` no longer unsubscribes and resubscribes every dependency on each recomputation when the dependency set is unchanged. A single `signal.set()` was quadratic in graph depth and is now linear (memo chain, µs per set: depth 50 156.6 → 11.1; depth 800 52792.8 → 135.3).
- `useSignal` keeps one `useSyncExternalStore` subscribe callback across renders (20 unrelated re-renders: 41 subscribes / 40 unsubscribes → 1 / 0).
- `createRequestHandler` compiles the route graph once per handler instead of per request (20 routes 26.8µs → 6.0µs; 120 routes 619µs → 31µs).
- `matchRoutes` skips routes whose literal first segment differs and selects the best match linearly (20 routes 6.0µs → 0.58µs; 120 routes 31µs → 1.45µs).
- `MoonshineRouter` memoizes the compiled route graph.
- The static root's real path is resolved once per process; the requested file is still resolved per request.
- Dither canvases hoist fixed-alpha `rgba(...)` strings out of the pixel loop; output is byte-identical (600×300 scan 5.07ms → 0.31ms).

## Components

- Dither paint internals (`BAYER`, `paintColumn`, `paintSparkline`, `resample`, `backingSize`, `sparklineColumnTops`, `PALETTE`, `rgb`, `seedOfColor`) are no longer exported from the package root. The `./dither` and `./themes` subpaths are unchanged.
- Dither chart canvas scaffolding collapsed into a single `DitherCanvas`.

## Migration from 0.3.2

- All public packages now use version `0.3.3` and internal dependencies use `^0.3.3`.
- `@tschk/moonshine-next` no longer re-exports Next. Anything relying on it forwarding to a real `next` install must move to the reimplemented surface; see the package README for the supported and unsupported lists.
- The nine removed component-root exports must be imported from `@tschk/moonshine-components/dither` instead.

# Moonshine 0.3.2

## Security

- Client output builds into `.moonshine/public/`. The build directory was previously handed to the static file server wholesale, so `GET /dist/server.js` returned bundled server code and `GET /manifest.json` leaked the route map and absolute build paths. The preview server and the bun/node deploy entries now serve only the public directory.
- Static file containment compares real paths, so a symlink inside the static root pointing outside it is rejected.

## Packaging

- Five packages imported a `@tschk` package they declared only as a devDependency, which resolves through the workspace but fails when installed from npm. The four deploy adapters now depend on `@tschk/moonshine-adapter-conformance`, and the CLI on `@tschk/crepus-moonshine` with `@tschk/moonshine-solid` optional.
- `check-packages` fails on an undeclared runtime import, ignoring template literals because that code belongs to the generated project.
- `@tschk/crepus-moonshine` parses `.crepus` through the published `@tschk/crepuscularity-wasm` Rust parser; the TypeScript parser is gone. `@tschk/moonshine-solid` renders the same IR from the shared WASM types.
- The release version-lockstep check is scoped to in-repo packages.

## Adapters and examples

- Removed eight delegation-only host adapters (`adapter-angular`, `adapter-astro`, `adapter-svelte`, `adapter-waku`, `adapter-nuxt`, `adapter-vue`, `adapter-remix`, `adapter-tanstack`). They were pure re-export wrappers. `adapter-solid`, `adapter-next`, and `adapter-conformance` remain.
- Removed `examples/catalog-gallery`, `examples/vite-crepus`, `examples/shaders-island`, and the internal-only benchmark and packed-test scripts.
- Removed the `Meter` and `Input` thin wrappers from `@tschk/moonshine-components`.

## View IR

- `link` node kind: `CrepusLinkNode` renders as an `<a>` with `href`, `target`, `rel`, and content or children.

## Migration from 0.3.1

- All public packages now use version `0.3.2` and internal dependencies use `^0.3.2`.
- The eight removed adapters have no replacement; import the host library directly, or use a reimplementing adapter where one exists in 0.3.3.
- Static assets are read from `.moonshine/public/`. Anything serving `.moonshine/` directly must be repointed.

# Moonshine 0.3.1

## Security

- `isSafeRedirect` now explicitly rejects embedded CR/LF control characters in redirect locations (AUD-007).
- Full re-audit confirmed no regressions in route precedence, request cancellation, serialization, static traversal, cache isolation, adapter capability rejection, or compatibility exports.

## Benchmarks

- Added `scripts/benchmark-competitive.ts` measuring kernel, island, React, and Solid bundle sizes plus Bun.serve / Moonshine static / SSR request latency.
- Refreshed internal benchmark results in `docs/audits/benchmark-results.md`.
- Added `docs/audits/competitive-benchmarks.md` with methodology and caveats.
- Updated `docs/COMPARE.md` with a "Measured on this machine" section.

## Audit

- Added `docs/audits/0.3.1-framework-audit.md` with full correctness, security, complexity, and gate results.

## Migration from 0.3.0

- All public packages now use version `0.3.1` and internal dependencies use `^0.3.1`.
- No breaking changes; drop-in upgrade from 0.3.0.

# Moonshine 0.3.0

## Kernel compatibility

- `@tschk/moonshine` default export remains signal-only.
- `packages/core/src/router.ts`, `packages/core/src/server.ts`, and `packages/core/src/react.ts` are compatibility re-exports from the new framework packages.
- Kernel bundle target stays within 12 KiB minified.

## Hybrid routes

- Renderer-neutral route graph in `@tschk/moonshine-router` with static, dynamic, optional, and rest segment precedence.
- Filesystem route discovery in `@tschk/moonshine-compiler` maps `index.tsx`, `[slug].tsx`, `[[tab]].tsx`, `[...path].tsx`, and `.server.ts` to route patterns.
- Programmatic and filesystem routes merge and feed a shared `createRouteGraph`.
- Five output modes: `static`, `ssr`, `island`, `spa`, `api`.

## Compiler and manifest

- `MoonshineManifest` is versioned at `1` and emitted as sorted JSON to `.moonshine/manifest.json`.
- Route classification analyzes module facts via the TypeScript AST without executing code.
- `moonshine inspect` prints one deterministic line per route and `--json` prints the manifest.
- Asset hashing uses `Bun.CryptoHasher("sha256")`.

## Server data flow

- `createRequestHandler` in `@tschk/moonshine-server` runs middleware, loaders, and renderers in order and respects `AbortSignal`.
- Serialization escapes `<`, `>`, `&`, U+2028, U+2029 and rejects functions, symbols, and cycles.
- `redirect` enforces same-origin or relative locations and blocks header injection.
- `resolveStaticPath` rejects traversal, malformed percent-encoding, null bytes, and separators.

## Renderers

- `@tschk/moonshine-react` provides SSR, streaming, island encoding, and hydration.
- `@tschk/moonshine-solid` and `@tschk/crepus-moonshine` remain independent renderers with no shared vnode.
- React, Solid, and Crepus renderers implement the same `Renderer` contract from `@tschk/moonshine-framework`.

## Deployment adapters

- New packages: `@tschk/moonshine-deploy-bun`, `@tschk/moonshine-deploy-node`, `@tschk/moonshine-deploy-cloudflare`, `@tschk/moonshine-deploy-vercel`.
- Adapters consume `MoonshineManifest` and produce host-specific output.
- Node bridge filters hop-by-hop and framing headers.
- Cloudflare and Vercel adapters validate runtime and capability support.

## CLI

- `moonshine new`, `dev`, `build`, `preview`, `inspect`, `compile`.
- `moonshine build --adapter bun|node|cloudflare|vercel`.
- `moonshine inspect --json`.

## Migration from 0.2.x

- All public packages now use version `0.3.0` and internal dependencies use `^0.3.0`.
- Replace `workspace:*` and `file:` references in published manifests with `^0.3.0`.
- Import router, server, and React from `/router`, `/server`, and `/react` subpaths on `@tschk/moonshine` or directly from the framework packages.

## Verified limitations

- npm publish requires an authenticated npm account and GPG signing for git tags; these are not configured in CI by default.
- Package ownership can only be verified after packages exist on the registry.
- External install verification requires the release to be published.
