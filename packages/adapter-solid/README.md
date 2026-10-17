# `@tschk/moonshine-solid`

Independent replacements for the supported Solid APIs, built on
[`@tschk/moonshine-dom`](../dom/README.md). This package imports no Solid runtime
and has no Solid dependency or peer dependency. The default Moonshine export
remains signal-only.

Recompile supported authored JSX/TSX with Crepuscularity. This package does not
implement Solid's compiled DOM instructions and cannot be aliased over arbitrary
`solid-js/web` output. Crepus lowers its admitted named `solid-js` primitives to
the native graph; unsupported APIs reject. Moonshine rejects generated native
modules retaining a Solid runtime import.

- `/solid`: native signals, memos, effects, roots, lifecycle, batching, `on`,
  context providers, memoized `children`, `mergeProps`/`splitProps`, client resources, `catchError`, DOM
  `ErrorBoundary`, and getter-based `For`, `Index`, `Show`, `Match`, `Switch`.
- `/store`: independent `createStore`, `produce`, `reconcile` on the same graph.
- `/h`: the native browser `h` factory, exported as default. Use explicit tag
  names and props; Solid hyperscript selector shorthand is unsupported.
- `/portal`: opt-in `Portal` and browser `h` with logical delegated events.
- `/reactive`, `/control`, `/dom`: direct native APIs. `/control` takes explicit
  accessors, while `/solid` adapts Solid-style prop getters.
- `/ssr`: escaped server factories, suppressed effects/mount callbacks and
  explicit server IR rendering. Author server modules against this entry.
- `/framework-native`: the bundled native framework renderer, requiring the
  optional framework peer.

`catchError` owns an attached scope and handles component, memo and effect
callback failures without changing dependency tracking. DOM `ErrorBoundary`
keeps its fallback until reset, cleans the failed branch before rendering the
fallback, and tracks fallback getters while invoking fallback callbacks untracked.
Use a children getter to construct protected children. Event callbacks, rejected
promises, cleanup failures and later lazy function/array children are outside
this boundary, matching the tested Solid behavior. Native signal commits route
errors before returning; writes through foreign core signals defer routing to a
microtask. Disposed queued handlers are canceled, and handler failures route
directly to the nearest outer handler; these ownership choices differ from some
observed host callbacks. SSR component use rejects explicitly; serialization
boundaries and compiler admission remain separate work.

```ts
import h from "@tschk/moonshine-solid/h";
import { createSignal, Show } from "@tschk/moonshine-solid/solid";
import { render } from "@tschk/moonshine-solid/dom";

const dispose = render(() => {
  const [count, setCount] = createSignal(0);
  return h(
    "main",
    null,
    h("button", { onClick: () => setCount(count() + 1) }, count),
    Show({
      get when() {
        return count();
      },
      children: (value) => () => "count " + value(),
    }),
  );
}, document.getElementById("app")!);
```

`mergeProps` applies rightmost defined values, retaining getter reactivity and
undefined fallback. `splitProps` partitions props without evaluating getters.
Plain sources copy own string property descriptors/names; symbols and inherited
properties are omitted, matching Solid's plain-object path. Function sources
are memoized in the native owner and produce live readonly views: writes/deletes
are ignored, dynamic string keys update, and symbol reads remain available.
Wrap a native store in `() => store` when live key replacement is needed; these
helpers do not implement Solid's private proxy marker ABI. Plain copied data
properties remain writable. No component compiler instructions are introduced.

Use lazy getters or callbacks for branch contents so they are created in the
selected branch's owner. List children receive `(item, indexAccessor)` for `For`
and `(itemAccessor, index)` for `Index`. Empty lists can supply `fallback`.
`Switch` selects the first truthy `Match`, retaining it while it stays selected.
With `keyed: true`, `Show` and `Match` pass the raw truthy value to render
callbacks and replace owned branches when its identity changes. Without `keyed`,
callbacks receive a live accessor and retain the branch across truthy changes.
Old branch cleanup runs before replacement setup. Control descriptors are
source-level helpers, not a Solid compiler ABI.

`children(() => props.children)` memoizes the source and resolved contents separately,
flattens nested arrays and calls zero-argument child accessors. Parameterized render
callbacks retain their identity. `toArray()` preserves arrays, wraps scalar values
(including `false`, `0`, and empty strings), and returns `[]` for nullish values.
Create the helper under an owner so child computations and cleanup follow the
wrapper's lifetime; ordinary native SSR factories remain opaque children.

`createContext` and `useContext` use native owner scopes. Provider values are
captured once without tracking; pass an accessor or store for reactive values.
Children must be lazy getters/callbacks so descendants inherit their provider.
Undefined provider values use the context default. Render providers through the
chosen DOM or SSR `h` factory; deferred SSR descendants retain the provider owner
through serialization, with request-local cleanup. Browser contexts do not load
the SSR serializer. This does not implement existing Solid compiler instructions.

The root `renderCrepusNodeSolid` and `renderCrepusIrSolid` create native DOM.
The same names on `/ssr` create server HTML. They preserve static View IR kind,
class and root mappings; `if` and `forEach` remain descriptive placeholders and
must be lowered by Crepus to execute expressions. IR types use the optional
Crepus/WASM peer; rendering a supplied IR object does not load a parser.

`fromMoonshineSignal` and `createBridgedSignal` now return native pairs. Their
subscriptions dispose with the native owner. Root kernel exports such as
`createMsSignal`, `createMemo`, `createResource`, `batch` and `untrack` retain
their original kernel signatures; use `/solid` for the native pair/resource API.
Do not mix independent observers with a separately installed Solid graph.

`solidRenderer` retains its compatibility name and renders native synchronous
SSR/static components and fresh SPA shells using the native document renderer.
It returns buffered HTML, with escaped data and owned per-request cleanup.
Existing `renderer: "solid"` configurations must port server modules to `/ssr`;
new `moonshine new --solid` apps use the full native build and preview path.
`hydrateSolid` throws an actionable unsupported error; use `render` for a fresh
mount. Hydration, islands, progressive streaming, async SSR components, Suspense
and full Solid resource options are unsupported.

See [native API behavior and limits](../dom/README.md) and the
[compiled TSX example](../../examples/native-template/README.md). Benchmarks in
`scripts/benchmark-reactive.ts`, `benchmark-dom.ts` and `benchmark-ssr.ts` use
Solid only as a development comparison. They do not establish universal speed
or framework equivalence.

### Client component loading

`/solid` exports `lazy(loader)`. The loader resolves a module whose `default` is a
native component function. Call the returned component under a live native owner;
it returns an accessor, initially empty while loading, then initializes a separate
owned component per instance with live props and context. Disposing one pending
instance does not prevent other instances from loading.

`Lazy.preload()` may run without an owner on the client and returns the validated
module promise. Calls share that cached promise; its identity need not equal the
loader's original promise. Completed preloads permit synchronous setup. Async
rejections remain cached; synchronous loader throws can be retried. Malformed
modules reject with `TypeError` rather than silently rendering empty. Internal
promise observation prevents orphan rejections, while the returned promise still
rejects for callers. Mounted failures use native owner error handling.

Invocation and preload reject during synchronous SSR before running the loader,
including native SSR component initialization. This entry supplies no Suspense,
hydration, streaming or asynchronous SSR behavior.

### Opt-in portals

Import `{ h, Portal }` from `@tschk/moonshine-solid/portal` for the whole logical
subtree. Its standard delegated events follow component ancestry across nested
portals; `on:custom`, `oncapture:click` and listener objects use physical DOM
listeners. Existing `/h` keeps native direct-event behavior. Handler objects retain
`capture`, `once`, `passive` and `signal` options captured at registration.

Use a children getter so the portal owns construction and cleanup. The default
mount is `document.body`; explicit same-origin document mounts are supported.
`isSVG` creates an SVG container. Head mounts insert an independently owned range
without a wrapper. `useShadow` uses an open shadow root when the container supports
it. Hydration is unsupported. This entry is not a `solid-js/web`
alias. For SSR import both `h` and `Portal` from `/ssr`: it emits nothing
and does not evaluate mount or children.

Foreign documents acquire all 22 delegated event types while a portal is alive;
portals sharing a document share those listeners, and the last disposal removes
them. Unlike the tested Solid iframe behavior, normal delegated handlers and
logical ancestors work in same-origin iframes. Browser security rules still block
access to cross-origin documents. Disposing an owner after iframe navigation
cleans its old document and does not affect the new document.

```ts
import { h, Portal } from "@tschk/moonshine-solid/portal";
import { render } from "@tschk/moonshine-solid/dom";
const close = render(
  () =>
    h(Portal, {
      get children() {
        return h("button", { onClick: () => close() }, "close");
      },
    }),
  document.querySelector("#app")!,
);
```

`/dynamic` provides native `Dynamic` and `createDynamic` for choosing a component
function or intrinsic tag. `Dynamic` forwards live prop getters and omits its
`component` prop. Component changes dispose the previous branch; prop changes
retain its nodes. Intrinsic props use ordinary Solid values/getters, rather than
native `h` accessor-valued attributes. Ref callbacks run once; reactive events
reuse the adapter's event policy. Undefined selection renders nothing.

Import the server counterparts from `/ssr`: selection runs once per factory call
and component work belongs to the render request. The browser entry rejects SSR.
These entries use native DOM/HTML factories and their existing attribute, style,
raw-HTML, and form constraints; they do not provide Solid's compiled web ABI or
hydration. Root and `/solid` imports do not include the optional browser factory.

Common SVG tags such as `circle`, `path`, `foreignObject`, and `svg` select their
native namespace automatically. Pass `xmlns: "http://www.w3.org/2000/svg"` for
ambiguous dynamic SVG tags such as `a` and `title`, including when mounted inside
an SVG parent: parent namespace context alone does not persist across memo
updates. This explicit namespace behavior differs from Solid's Dynamic strings,
which create `a` and `title` in the HTML namespace.

A production Dynamic application comparison against Solid 1.9.14 measured
6,883 gzip bytes for Moonshine and 7,521 for Solid, including the same harness.
In Chromium, nine alternating samples of 20,000 operations measured median
prop updates at 8.3/8.1 ms, component replacements at 47.2/28.3 ms, and reactive
event updates with clicks at 46.9/37.8 ms (Moonshine/Solid). This workload is
smaller with Moonshine but replacements and event updates are slower. Updating
delegated handlers in place reduced event time from 55.7 to 46.9 ms in the same
run, at a cost of 79 gzip bytes; ordinary prop/replacement timings overlapped
the previous implementation. Startup timings were below useful precision.
These are native factory measurements; they do not establish compiled
component or hydration performance.

Run `bun scripts/benchmark-dynamic.ts` from the repository root to reproduce
the checked workload. It uses the installed Solid reference and Python
Playwright/Chromium, prints both application sizes and every timing sample,
and rejects runtime source changes during measurement.

The local Crepus source compiler accepts explicit type-only Solid `JSX` imports
for `JSX.Element`, mapped to native DOM or SSR child types. Aliases work; other
namespace members and runtime namespace uses diagnose. Ordinary authored TSX
component calls preserve named/imported interface props, correlated generic
callbacks and cached child types. Wrong/missing props and incompatible children
remain errors in the generated graph. This does not implement the full Solid
JSX namespace or precompiled runtime ABI. Svelte's separate generated descriptor
path retains its existing prop-call typing limit.

Run the persistent authored-source checks with
`bun run check:components --compiler /path/to/crepus`. The gate copies and
fingerprints the compiler, checks generated DOM/SSR graphs with both TypeScript
lanes, rejects invalid authored calls, and exercises two independent browser
instances, live props, focus/identity, disposal and fresh escaped SSR. Omitting
`--compiler` keeps the existing runtime-only component gate.
Native sibling cleanup order and SSR cleanup timing still differ from Solid;
these source checks do not establish lifecycle parity.

The optional handwritten `/dom` and `/h` function factories share the current
Solid owner. `/solid` roots select reverse child/callback cleanup, and Show/Switch
keep their branch ownership. Cleanup callbacks see connected old DOM; resources
stop immediately, then outer roots detach while retaining their descendant tree.
Dynamic and lazy use this factory. Failed cleanup drains peers and preserves the
first error, retaining native safety rather than Solid's skipped peer cleanup.

Known native/Svelte/Vue component boundaries reset this policy. Unmarked generic
roots inherit active policy; wrap foreign components with their independent
native factory. SSR uses deterministic synchronous FIFO cleanup rather than
Solid's deferred server cleanup. Generated source still uses native factories,
so the handwritten policy does not establish source lifecycle parity. Dynamic/createDynamic require a live owner before selector reads or setup. This
intentionally rejects pinned Solid's ownerless setup without a disposal handle.

### Explicit authored Solid source

A complete leading `/** @jsxImportSource solid-js */` directive selects bounded
native Solid lowering in Crepuscularity. Local stable synchronous component
factories preserve the tested owner, mount and reverse cleanup behavior; native
accessor controls keep their distinct compiler ABI. Recompile authored source;
this does not execute existing Solid compiler instructions.

`bun run check:sfc --compiler /path/to/crepus` now includes six generated Solid
modules alongside all previous Svelte/Vue cases: **734 generated modules / 728
emitted TypeScript modules**, frozen compiler `82e517ca`. Both strict checkers,
five pinned-reference browser phases, focus/node retention, connected cleanup,
fresh escaped SSR and selector/root/publication guards pass. The native browser
and SSR bundles contain no Solid runtime or parser WASM. Strict legacy IR export
types still resolve the adapter's declared optional Crepus WASM type peer.

This requires explicit manual native bootstrap. Existing tsconfig selection,
normal raw-TSX project builds, foreign/dynamic component dispatch, hydration and
the full compiler ABI remain unfinished. Native SSR cleanup remains synchronous
FIFO; no full server cleanup timing parity is claimed. Source acceptance adds no
Moonshine runtime changes or new performance claim.

### Local authored client resources

The local Crepus compiler admits `createResource` and the `Resource` type from
`solid-js` in DOM source with a leading `/** @jsxImportSource solid-js */`
directive. Imports, aliases, reexports and TypeScript import queries use
Moonshine's independent `/solid` implementation. Each helper module needs its
own directive. The runtime is available in SDK 0.4.13; this compiler increment
is local and unpublished and still requires explicit native bootstrap.

Thirteen pinned Solid reference browser phases match loading, stale completion,
refresh, mutation, errors, recovery and disposal, while retaining input identity,
focus and selection. Both strict type checkers pass the source graph and reject
three invalid resource uses each. Six native integration tests and the existing
856-module source gate pass.

The minified acceptance application, including its driver, measures 22,259 bytes
(8,484 gzip) for Moonshine versus 19,826 (7,636 gzip) for Solid. These are whole
fixture sizes, not isolated runtime measurements; no speed improvement is claimed.
SSR rejects resource imports, including type-only forms. Async SSR, hydration,
Suspense and the full Solid resource option surface remain unsupported.

### Local imported Solid components

The local Crepus CLI now verifies relative default and named component imports,
local aliases and explicit named/default reexport chains before emitting the
module graph. Every component and barrel on that chain needs its own leading
`/** @jsxImportSource solid-js */` directive. The ultimate export must be a stable
synchronous function. Existing site boundaries, symlink checks and preflight
output protection remain in force. Standalone compilation stays fail-closed;
resolver-aware native compiler entry points provide the graph proof.

Thirteen pinned-reference browser phases match imported child setup, mount,
reactive props, connected cleanup, resource transitions, focus, selection and node
identity. Four fresh SSR requests across Bun and Node produce matching parsed
attributes/text; Moonshine additionally escapes `<` in quoted attributes and
`"` in text, so raw HTML differs. Both strict type checkers pass the DOM and SSR graphs.

The complete browser acceptance fixture is 23,012 minified bytes / 8,680 gzip,
versus Solid's 21,202 / 8,101. This includes the driver and makes no speed claim.
The compiler increment remains local and unpublished, using SDK 0.4.13's existing
independent renderer. Manual bootstrap is required. External or foreign
components, namespace/member tags, dynamic identities, component lookup through
`export *`, hydration and async SSR remain unsupported.

### Server list helpers

`For` and `Index` are available from `@tschk/moonshine-solid/ssr` for synchronous
server rendering. Both read the list and its length once, visit each row once,
and evaluate `fallback` only for an empty, false or nullish list. `For` passes a
value and an index accessor; `Index` passes an accessor for the captured row value
and a numeric index. Rows retain the request context and native FIFO cleanup.

DOM and SSR list helpers infer fallback types independently from row results;
existing explicit two-type-argument calls remain valid. Authored list compilation uses the local Crepus contract below. No hydration or
async SSR support is implied.

### Local authored lists

The local Crepus compiler accepts named `For` / `Index` imports and aliases from
`solid-js` with a leading `/** @jsxImportSource solid-js */` directive. Typed lazy
factories preserve row/index inference, callback lookups, component ownership and
fallback laziness. Nested lists in callbacks and fallbacks, imported children and
an explicit `children={callback}` on self-closing controls are covered. `each`
and `fallback` use expression props. Spread props, namespace/member tags, mutable
component aliases, JSX type arguments and extra callback children reject.

The SDK 0.4.15 runtime captures callbacks once and invokes them unbound. DOM `For`
provides an index accessor only when the callback declares a second parameter.
Retained duplicate prefixes/suffixes keep their row state; removed rows and
fallbacks clean up before replacement setup. `Index` retains positions and
publishes retained values before constructing later slots. Notified changes to
the same array are observed, and each new empty value replaces the owned
fallback. Generic native mappers keep their default update order; the Solid
adapter opts into the earlier mapping phases. Failed roots are disposed and
cleanup failures drain, so exact Solid failure timing is not claimed.

This compiler increment remains local and unpublished and needs manual native
bootstrap. Native SSR, strict types and pinned-reference browser acceptance are
verified separately; hydration, async SSR and the full compiled Solid ABI remain
unsupported. Bare intrinsic `data-*` attributes now retain empty values, while
explicit `data-x={true}` retains `"true"`.
