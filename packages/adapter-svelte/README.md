# `@tschk/moonshine-svelte`

Independent stores, native component context/events, lifecycle helpers, and Moonshine signal bridges.
No Svelte runtime, React, WASM, or parser is required. The framework peer is
optional at runtime and loaded only when using the compatibility renderer.

Strict TypeScript checking of the root entry requires installing
`@tschk/moonshine-framework`, even when importing only a bridge: the root also
exports `crepusRenderer` with the framework's `Renderer` contract. The framework
remains optional for runtime imports and bridge-only browser/Bun/Node bundles.
This requirement does not apply to the signal-only `@tschk/moonshine` core entry.

| Subpath        | Provides                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `.`            | signal bridges and lazy native SSR compatibility renderer                                                                  |
| `./svelte`     | lifecycle, `tick`, `settled`, `flushSync`, `untrack`, context, typed `createContext`, events                               |
| `./reactivity` | independent `SvelteMap`, `SvelteSet`, `SvelteDate`, `SvelteURL`, `SvelteURLSearchParams`, `MediaQuery`, `createSubscriber` |
| `./class`      | opt-in `classValue` and `classDirectives` for source classes                                                               |
| `./store`      | independent `writable`, `readable`, `readonly`, `derived`, `get`, `toStore`, and `fromStore`                               |

`classValue` flattens nested class arrays and includes truthy object keys. Empty
results return `undefined`, omitting the DOM/SSR attribute. Top-level primitive
values retain Svelte 5.57 stringification; nested falsy values are omitted. This
helper does not change ordinary native `h()` attributes.

`classDirectives(base, hash, flags)` normalizes the base, appends an optional scope
hash, then applies own class flags in order. Truthy flags append tokens; false
flags remove matching tokens, including a matching hash. The local Crepus compiler
uses it for authored intrinsic `class:` directives, including dynamic elements.
Source parsing and independent input memoization belong to Crepus; this helper
does not execute Svelte's compiled component instructions or implement style directives.

The optional `/runes` entry exports compiler-facing `createState`, `createDerived`,
`createProp`, `propsId`, and `createRuneEffect`.

Compiler-facing `/runes` also exports `spreadProps(...layers)` for live component
props. Layers are objects, nullish values, or object getters; later layers win.
Source getters keep their receiver and are read lazily. Layer getters are not
cached: the compiler must memoize call expressions where required. Nullish
layers are skipped during setter lookup, avoiding the pinned host's null-layer
assignment error. Pass component
children through the named props object to preserve source precedence.

The separate `/ssr` `spreadServerProps(layers)` copies enumerable own string-key
descriptors once per render pass. Getters remain lazy and read from the merged
object; symbols and inherited properties are omitted. DOM and SSR spread helpers
intentionally have different contracts. The native SFC gate verifies bounded component spread lowering, including
call-expression caching, live rest props, explicit children and component
references. Intrinsic forwarding has the separate bounded contract below.
Implicit body/legacy slots and hydration remain unverified.

### Native intrinsic attribute forwarding

The local unpublished Crepuscularity compiler now lowers spreads on ordinary
static HTML elements through independent Moonshine helpers. This includes a
wrapper's live `$props()` rest object, multiple interspersed layers, removed keys,
and named attributes that override or fall back when spread keys disappear.
`installElementSpread` on `/runes` owns DOM updates and direct event listeners;
`installBoundElementSpread` installs compiler-owned binding callbacks once between
capture and ordinary input/change listeners, without filtering spread-provided
live values. Details toggle handlers precede their binding write;
`spreadServerEntries` on `/ssr` supplies explicit server attribute entries.
The local form-spread work adds `spreadServerElement` for input defaults and
typed select/option identity; these form helpers require Moonshine 0.4.40 or newer.
Component prop spreads keep their existing contract.

Each layer expression and enumerable getter runs once per update/render in
source order, including overridden values. Function data is not invoked.
Class values use the source class normalizer; spread style values use string
coercion, not the native DOM factory's object-style API. Event handler replacement
retains a stable listener; removal and owner disposal release it. Listeners are
direct rather than Svelte's delegated events. Mixed-case event-like attribute
strings are filtered consistently with native SSR, which is stricter than Svelte.
DOM content-replacement keys reject before mutation. String-valued `ref` and
`children` remain attributes and do not replace template children.

The locally verified compiler also admits unbound input/select/option/textarea
spreads. DOM values remain separate from reset defaults; option and input values
use Moonshine's typed stores. Selects reconcile live/default selection after
children mount and observe inserted options. An authored fixture matches Svelte
in five Chromium phases and repeated SSR; an isolated Bun/Node source regression
checks typed option identity. This does not establish full form compatibility.

The local compiler also combines spreads with input/textarea `bind:value`,
checkbox `bind:checked`, select `bind:value`, static file-input `bind:files`,
and static checkbox/radio `bind:group`.
Authored input/checkbox/select/file/group
fixtures match Svelte in Chromium and repeated SSR, including handler order and
typed selections. File SSR preserves authored attributes without reading the
bound model. The local compiler additionally admits spread `bind:open` on details. This
requires Moonshine 0.4.41 or newer: existing toggle
handlers run before the binding write; handlers removed and re-added follow
ordinary listener registration order. Authored Chromium and six SSR renders
cover this bounded path. Spread `bind:group` requires a static `type="checkbox"`
or `type="radio"` attribute; spread-only `value` changes update the input value
without re-evaluating `checked` until the group model or an authored dynamic
`value={expr}` updates, and SSR derives `checked` at the `bind:group` position
only when an authored `value` attribute is present.

Source admission still rejects spreads on title, dynamic or namespaced/custom
elements, and combinations with actions,
attachments, class/style directives or scoped CSS. Attachment symbols and
autofocus behavior are not implemented by this helper. Hydration and arbitrary
precompiled Svelte instructions remain unsupported.

The authored wrapper matches Svelte 5.57.1 through five Chromium update phases,
including two independent instances, attribute fallback, clicks, node/focus
retention and disposal. Repeated SSR and isolated Bun/Node source tests verify
getter order and attribute output without installing a host runtime. These checks do
not establish complete source compatibility.

Reproduce the form SSR comparison with
`bun scripts/benchmark-svelte-form-ssr.ts --compiler /path/to/crepus`
from the repository root. Use `--svelte /path/to/installed/svelte` when the
reference package is installed outside the root resolver. It runs seven
alternating fresh Bun processes, 1,000 warmups and 5,000 timed renders per
process, and reports minified bundle bytes, first-render and process wall time.
Process wall time includes warmup/workload and is not startup-only. The measured
native form bundle is smaller, while its repeated SSR is slower than Svelte
5.57.1 in this workload. Machine contention is uncontrolled; this does not
establish a general speed or size ranking.

Lifecycle helpers require a live native owner. `onMount` runs untracked in a
microtask after synchronous DOM insertion; a synchronous returned function is
owned cleanup. Async callbacks do not register returned promise values as
cleanup. Disposed roots skip pending mounts, including synchronous SSR roots.
`onDestroy` runs on owner disposal, including SSR. `tick()` yields, then commits
pending native rune work across the default effect and opt-in render queues.
Future promise/timer updates and hydration remain separate contracts.

Mount hooks share the post-DOM rune-effect queue, preserving registration order
across sibling components. By default, pending native component references publish before
mount/effect callbacks. Opaque exported instances preserve live getters and methods;
source fixtures now verify named/empty exports and scalar/member `bind:this` in Chromium and SSR. Other export forms and loop-dependent references remain separate acceptance work.

Stores implement the subscription protocol, but reads are not automatically
tracked by native DOM bindings. Subscribe into a native signal and unsubscribe
on destruction:

```ts
import { createSignal } from "@tschk/moonshine-dom/reactive";
import { writable } from "@tschk/moonshine-svelte/store";
import { onDestroy } from "@tschk/moonshine-svelte/svelte";

// During native component initialization:
const count = writable(0);
const [value, setValue] = createSignal(0);
onDestroy(count.subscribe((next) => setValue(next)));
// Use value as a native DOM child accessor.
```

Context and dispatch APIs require native function-component initialization through
`h(Component, props)` or `createComponent` from `@tschk/moonshine-dom/component`.
Each instance inherits its own context map; `getAllContexts()` returns that live
map. Mutating it changes subsequent context reads and child inheritance without
changing sibling or ancestor maps.
`createContext<T>()` returns typed get/set/has functions.

`createEventDispatcher` delivers non-bubbling `CustomEvent`s to the explicit
listener map on the `componentEvents` symbol from the component module. It
supports detail, listener arrays and cancellation. Callback props remain separate.
Disposed instances stop dispatching; listeners have no legacy exported-instance
`this`. This is a native compiler contract, not Svelte's internal component ABI.

This package does not execute existing Svelte compiler instructions or alias
`svelte`; existing output must be recompiled through Crepus. Authored top-level/imported `$store` reads, replacement and writable expressions have bounded DOM/SSR proof. The tested local compiler supports a bounded authored
SFC slice: scalar, shallow raw and ordinary deep `$state`, `$state.snapshot`, `$derived`,
post-DOM `$effect`, and live `$props()` (whole-object or destructured with rename,
defaults and read-only rest), click handlers, static/dynamic child components,
keyed blocks, `$effect.tracking()`, manual `$effect.root`, checkbox/value/range
bindings, named/empty component exports, scalar/member `bind:this` and named context helpers. Reachable plain
TypeScript context helpers use the native bridge too. Fixtures are verified in
Chromium and SSR, including skipped effect factories on the server.
Full source-compatibility remains unfinished; the acceptance surface is
tracked in [the SFC coverage ledger](../../docs/native-sfc-coverage.md).

The `/runes` helpers are compiler targets. `createState` isolates proxy writes
from ordinary object/array inputs and tracks deep mutations. Unusual property
descriptors reject explicitly. Reads capture raw properties lazily; proxy writes
remain isolated from the input. Own properties shadowing inherited names enumerate
consistently, intentionally differing from Svelte's edge behavior. Complete Svelte
proxy parity remains unfinished. `stateSnapshot` clones plain data and supported
platform values, handles `toJSON` and cycles, and retains uncloneable values.
Map/Set snapshots are shallow, matching Svelte production.
`createRawState` preserves object/function identity and tracks only replacement,
with Svelte's `===` equality and the same teardown-history policy as deep cells.
Nested mutation remains ordinary JavaScript; this helper does not create proxies.
`createRuneEffect` deduplicates post-DOM microtask effects, owns
teardown and nested work, and skips synchronous SSR, including bare renders and
retained foreign owners. It does not implement
the pre scheduler or asynchronous Svelte boundaries; `/pre` stays separate. `runeTracking()` reports whether
synchronous dependency collection is active: true inside native render accessors,
derived computations and rune effects; false during component setup, ordinary
event callbacks and `untrack`. The tracking source fixture verifies these contexts
in Chromium and SSR.

`createDerived` evaluates on demand and allows optimistic `.value` overrides.
Dependency invalidation resets an override even when the computed value is equal;
dynamic dependencies, errors and diamond updates preserve the kernel's pull graph.
Runtime helper tests do not establish compiler coverage for every rune form.

The source gate also admits imported `.svelte.ts` and `.svelte.js` factories with
function-local state, raw state and derived declarations. Typed and JavaScript
factories preserve independent instances, cached reads, live getters and SSR
request output. Top-level exported rune cells remain explicitly unsupported,
including declarations supplying types without a runtime implementation. Two
synchronous writes can still cause an extra native derived callback; the current
source fixture tests writes separately and does not establish full batching
parity.

`createProp` supplies writable compiler prop cells: ordinary writes stay local;
declared bindable props forward an actual parent setter. Defaults use a lazy,
reactive derived value, matching the Svelte 5.57.1 reference. A bound undefined prop
with a fallback rejects in the browser; SSR forwards a defined fallback instead.
This helper does not validate source binding declarations or implement `bind:this`.
Its SSR forwarding is not Svelte `$bindable` parity. Source SSR lowering must use
the optional `/ssr` local prop cells and buffered retries with one-time setup and
lifecycle callbacks retained only from the accepted render pass.

The root `crepusRenderer` is a lazy native SSR compatibility renderer. Pages
must explicitly use `@tschk/moonshine-dom/ssr`. Source-path loading is supported
under Bun; bundled deployments use
`@tschk/moonshine-dom/framework-native` with their bundled module table.

The optional `/binding` entry wraps native single-select and radio bindings with
state-origin comparison: a native state proxy and its original object compare
equal. Selected values are forwarded unchanged, preserving proxy overlays.
Multiple selects and checkbox groups retain array `includes` identity semantics.
Single selects match a typed `undefined` option before adopting browser defaults;
choosing a duplicate option retains that node when its model value is unchanged.
Checkbox binding and typed-value metadata helpers forward to native bindings. This entry does not add source binding
syntax support or recognize proxies created by an installed Svelte runtime.

`createRuneRoot` on `/runes` runs untracked setup synchronously and returns an
idempotent disposer. Its effects have a manual lifetime: enclosing component
unmounts and effect reruns do not dispose the root. Returned setup cleanup runs
when explicitly stopped, after owned effects. SSR component frames skip setup
entirely; server lowering must also erase source `$effect.root` callbacks.
Svelte `/binding` also maps empty numeric `bindValue` writes to `null`;
invalid nonempty numeric defaults reset to `NaN`, while text fields still write
empty strings. Generic native DOM bindings keep their
existing `undefined` numeric contract. Input type must remain fixed.

Teardown history is confined to this adapter. Within a pending flush, cleanup
reads the first previous values of compiler-created state and derived cells;
cleanup writes remain immediately readable. Derived historical reads keep a
separate cache, and synchronous native DOM consumers continue to read live values.
Proxy property history follows Svelte's lazy sources: previously unread properties
can read as undefined during cleanup, while key enumeration follows current structure.
External kernel getters without instrumented writers cannot reconstruct history.
SSR destruction reads live values. The source acceptance gate checks pending
teardown, derived values, manual stop, disposal and isolated SSR requests.

The optional `/ssr` entry exposes compiler-facing `createServerProp`, `afterRender`
and `settle` helpers for synchronous server bindings. Server prop assignments stay
local until successful serialization ends; only a currently undefined parent with
an own setter receives the final defined child value. `settle` buffers retryable
template output while setup stays outside the callback. Discarded attempts run
internal cleanup but suppress Svelte destroy callbacks, including nested accepted
attempts inside a discarded parent. Only accepted output updates select bookkeeping.
Runaway invalidation throws after 1,000 attempts. The native source gate now
verifies scalar component `bind:value` with a child `$bindable(3)` default:
two-way browser writes, retained nodes, independent instances, all four SSR
initial/assignment cases and accepted cleanup. Failed undefined browser setup
cleans the partial native parent owner, differing from the pinned reference.
The composite source fixtures also verify typed member targets, renamed child
bindable props, reactive fallback values without premature parent publication,
and binding precedence over spreads in either attribute order. Named component
getter/setter pairs also have source acceptance: boolean/string transformations,
captured member functions called without a receiver, and strict literal-union
types. Dynamic replacements retain their captured functions, set up the new
component before old cleanup, and keep both write directions live. Unlike ordinary bindings, SSR function bindings publish an undefined
getter's child fallback once without retrying setup. Browser undefined values
still reject when the child has a fallback. Other binding forms, asynchronous
rendering and hydration remain unverified.

The separate `/pre` entry exports `withRuneScheduler(callback)` and
`createRunePreEffect(callback)`. Enter scheduling under a live native owner:

```ts
import { h, render } from "@tschk/moonshine-dom/dom";
import { withRuneScheduler } from "@tschk/moonshine-svelte/pre";

const dispose = render(() => withRuneScheduler(() => h(App, {})), target);
```

Within this tree, pre-effects run initially during setup. Later writes coalesce
into a microtask: parent pre-effects see current state and old DOM, structural
work removes hidden descendants before their queued callbacks, retained keyed
rows follow current index order, and DOM updates precede post-effects. References
publish before mounts/effects by default; opt-in `publication: "post"` on the
component reference can register after child mounts/effects and before ancestor
posts. Scheduled control branches dispose children before parent hooks while
retained rows survive updates. Child post callbacks precede ancestor callbacks.
Reference publication can invalidate pre-effects and text bindings; that work
waits until pending posts finish. Ordinary post-effect cleanup writes still
render before nested posts. Structural branches follow owner order, so an earlier
branch invalidated by a later branch waits for the next pass. Render/structural
job descendants dispose before their component's hooks; pre-effect shutdown
retains subscription-first error precedence.
Pure derived values remain pullable. Cleanup history spans the complete cycle.
Errors drain queued peers, ownership cancels disposed work, and repeated feedback
is limited per callback rather than per distinct job. Ownerless entry rejects;
Synchronous SSR bypasses new scheduling and suppresses pre callbacks, including
bare callbacks and foreign scopes.

The ordinary native renderer stays synchronous. `/runes` does not import this
scheduler. The authored pre-effect pair has bounded DOM/SSR source acceptance,
including skipped SSR factories and child-first destruction. Other pre-effect
variants, actions, attachments, async boundaries and hydration need separate
source acceptance. `tick()` also drains synchronous writes between these native
queues; this does not establish Svelte's asynchronous compiler semantics.

The separate `/directives` entry provides manual `installAction(element, invoke,
readParameter?)` and `installAttachment(element, readAttachment)` under a live
`withRuneScheduler` tree. Install them before the element's attribute/text jobs
(for native `h`, use its first `ref` prop). Factories run after insertion; action
updates keep their source position before later DOM jobs. Attachment identity
changes clean up before replacement, while retained callback dependencies rerun
after DOM updates. Final cleanup sees the element removed.

Action parameters observe deep native state, including lazy cyclic aliases;
merely reading another alias does not trigger an update. Traversal interests
are removed on rerun/disposal. SSR skips all directive thunks. Native cleanup
drains peers and reports the first failure, differing from Svelte's early abort.
These helpers do not establish `use:` or `{@attach}` source lowering, attachment
spread support, hydration or complete Svelte directive compatibility.

The optional `/await` entry exports `awaitBlock(read, { pending, then, catch })`.
Use it under a live `withRuneScheduler` owner; branch values and errors are
accessors. Promise completion commits within one microtask, ignores stale or
disposed generations, and preserves a retained branch's nodes and local state.
Replacement branches initialize before old cleanup. Plain values, including
`false` and `null`, select `then`; already resolved promises skip pending output.

Synchronous SSR reads once and emits pending output for promises, or `then` for
plain values. It does not await. Missing rejection branches use native owner
error handling; unhandled callback failures retain the original error in a
microtask. This helper does not establish authored `{#await}` lowering,
asynchronous SSR, hydration, transitions or complete Svelte compatibility.

The optional `/store-binding` entry exports `createStoreReference<T>()` for
compiler-owned component subscriptions. Create one per store variable under a
live native owner. Its `get(store)` subscribes lazily, caches repeated reads and
tracks later notifications, including identical object/function values.
`releaseIfChanged(next)` releases the old subscription immediately and returns
`next`, without eagerly subscribing to it. Call `finish()` at the end of instance
setup, after registering authored destruction hooks; this preserves cached store
reads during teardown and releases child subscriptions before parent hooks. A
failed-setup fallback still releases acquired subscriptions.

Both function and observable-object unsubscriptions retain their protocol and
receiver. Effect cleanup uses the existing previous-flush history. SSR caches
subscriptions within the request owner and releases them on disposal. Retained
reads after disposal use temporary subscriptions; callbacks emitted after
unsubscription are ignored. Compiled SSR instead selects the separate server
group described below. Native failures drain cleanup peers. The local Crepuscularity `dafde4ab` compiler verifies authored top-level and
imported `$store` reads plus simple `$state` store-variable replacement. It
rejects `$store` assignments and mutations. This compiler patch is applied locally in
Crepuscularity but is not released; legacy reactive statements, async SSR and hydration
remain unsupported.

`/ssr` also provides `createServerState(initial)` and
`createServerDerived(compute, cache?)` for server lowering. State is a plain box.
Derived caching defaults to the render context at creation; component lowering
passes `true` explicitly. Nullish overrides resume computation, while falsy and
function values remain literal overrides. This centralizes server runtime policy
in Moonshine. The verified compiler source gate checks these imports for
components and both JS and TS companion factories, including a companion sharing
its importing SFC's basename.

The verified local `dafde4ab` compiler installs the rune scheduler in generated DOM
components. Native handwritten rendering remains synchronous by default. The
same authored counter built by this compiler is 10,766 gzip bytes versus pinned
Svelte 5.57.1's 17,389; this is one workload, not a universal size or speed claim.
The optional adapter-event hook in the shared DOM factory adds 32 gzip bytes to
this workload; the signal kernel is unchanged.

The 340-module source gate includes a self-imported recursive component tree.
Conditional updates preserve local state, focus and context; removed descendants
stop before their stale props can be evaluated. Disposal/remounting and fresh
escaped SSR match the pinned reference. Broader component compatibility remains
tracked in the coverage ledger.

Named component snippets preserve lexical values, consumer arguments, inherited
context, retained focus/local state and child-first cleanup. Type-only `Snippet`
imports use Moonshine's host-free contract; both generated graphs pass strict
checking, with fresh escaped SSR verified.

Bare intrinsic attributes preserve empty strings, expression attributes retain
boolean values, and bare component props remain `true`. The source gate also
checks boolean controls, empty file values and quoted event expressions in DOM
and SSR. A bounded form-reset fixture also checks literal versus expression
defaults, bound text/number/checkbox models, user/programmatic writes, reset after
tick, independent instances, disposal and fresh SSR. Broader reset variants remain open.

Function-local TS and JS companion factories can contain `$effect`. Two factories in
each of two component instances match the reference post-DOM and cleanup traces;
SSR erases registration and callback evaluation. Same-basename SFC/JS companions
are supported through explicit compiler inventory mapping and collision-safe
component output names. The source gate checks strict TS graphs, emitted JS
syntax, host-free imports and fresh escaped requests.

Textarea source checks cover literal versus expression defaults, unchanged-output
dirty-edit retention, changed values and independent instances. Raw closing tags,
component-looking markup and script strings remain text. Literal CR/CRLF, named
entities, semicolonless ampersands and static/dynamic decoding differences match
pinned Svelte DOM and parsed SSR; fixtures declare UTF-8 explicitly. Ordinary
text fragment whitespace and programmatic raw-snippet ownership remain open.

The source gate also checks bounded ordinary whitespace, snippet boundaries,
NBSP edges and pre/textarea indentation against exact DOM and parsed SSR
references. Leading pre newlines before conditionals, keys, snippets, raw HTML and imported
components now have exact DOM/parsed SSR checks; SVG and nested snippet
whitespace remain separate work.

Private raw-snippet bridges are available on `/raw-snippet`, `/raw-snippet-dom`
and `/raw-snippet-ssr`. They separate source callable metadata, DOM getter cells
and SSR values, with explicit consumer ownership and cleanup. These entries
require compiler lowering; authored `createRawSnippet` remains outside the source
acceptance gate. Only one trimmed HTML element root is supported, without
hydration. See the coverage ledger for the exact runtime and reference checks.

The private DOM entry also exports `createRawSnippetSlot`. Lowering creates one
slot per `@render`, passes `slot.deferRemoved` to `mapArray`, wraps invocation in
`slot.render`, and returns `slot.commit(mapped())` for every output, including
ordinary and empty snippets. This commits replacement setup before disposing
the previous branch and drains canceled work when its owner is disposed.

The private raw insertion hook adds 30 gzip bytes to the authored counter;
the signal-only default bundle remains unchanged.

The source gate verifies textarea body/reset-default independence, exact reader
order and complete SSR defaultValue expression erasure. Coercion/error-order
variants remain separate reference work.

Textarea expression bodies also preserve dirty edits when a forced rerun returns
the same object, without repeating its conversion. The source gate checks
conversion failures, DOM Symbol assignment errors, reset/disposal, literal versus
expression newlines, independent instances and fresh escaped SSR. Mixed body
expressions and default-value conversion ordering remain separate work.

One-level object and fixed-array `$derived` patterns now have authored DOM/SSR
proof, including renames, lazy defaults, bounded iterator closing, typed tuples,
independent overrides and error recovery. Nested/rest/computed patterns still
reject. Imperatively read derived chains remain lazy after source writes.

`/ssr` exports `createServerStoreReferences()` for compiler-owned server groups.
Create per-variable refs through `group.create<T>()`; call `group.finish()` after
successful serialization and accepted settlement, before bindable prop commits.
Cleanup follows first-read order and preserves completed same-source caches for
destruction hooks. Failed/discarded attempts still release resources. Late/new
destruction reads are balanced one-shot subscriptions, and peer cleanup drains
after errors; these deliberately avoid reference leaks. The DOM `/store-binding`
helper retains its separate destruction-before-release contract.

Compiler-facing `/store-binding` exports `setStoreValue`, `mutateStoreValue`
and `updateStoreValue`; `/ssr` exports `setStoreValue`, `mutateServerStore`
and `updateStoreValue`. Lowering captures the writable source before evaluating
an assignment and preserves the expression result. DOM member writes and SSR
member writes deliberately have different read/notification ordering. These
helpers require compiler-owned evaluation order; they are not general mutation
utilities. The frozen writable-store compiler passes the 346-module source gate,
including direct/compound/logical/member writes and prefix/postfix updates.
Destructuring, delete and iteration write targets remain rejected.

Scheduled list cleanup follows current retained keyed row order, children before
parents, while deferred removed rows remain alive until commit or owner disposal.
Authored keyed and unkeyed `#each` blocks now pass real CLI source acceptance
with identifier and static nested object item bindings, live indices,
arrays/iterables/array-like/nullish inputs,
key visits interleaved with setup and physical movement, retained row state and
empty fallbacks. Repeated empty inputs retain the same fallback root and DOM.
SSR does not evaluate keys. Renamed aliases, nested member bindings and unbound
callback/tag receivers have minified browser and fresh SSR proof. Defaults,
rest/array patterns and direct item/index write targets still diagnose;
transitions and hydration remain open.

Plain modern/legacy module scripts preserve module-once execution and named
exports. Bounded module runes now support state/raw state, snapshots and private
derived values. Stable exported state is the actual value/proxy; reassigned
state exports and derived exports reject. Module state persists across SSR
requests; module derived reads recompute while component derived values cache.
Module async/generator factories preserve rune creation-time ownership and caching.
Instance scripts and companion factories keep their placement restrictions.
The permanent gate covers 784 modules using frozen combined compiler
`ae8c6f6f`,
including shared module-rune state, snapshots, export identity, lifetime and SSR
cache behavior, bounded action/attachment source behavior and eight SSR prop-order
cases plus finite Vue defaults, explicit Solid source and authored await blocks. All 778 emitted TypeScript modules pass both strict checkers,
with no type exceptions. Await alias `typeof` queries have bounded source proof,
including qualified queries, nested defaults and annotations; invalid value-as-type
uses still fail both strict checkers.

The optional `/each` compiler entry reuses native insertion ranges and owners.
Duplicate or unstable keys diagnose and provisional roots always clean up;
reference production failure leaks are deliberately not reproduced. Cleanup
continues through sibling errors. With frozen compiler `c2ae808e` and the
invalidation/demand runtime, the unchanged authored SFC counter measures
34,650 raw / 12,683 gzip9 / 11,482 Brotli11 bytes versus the production
reference's 46,617 / 17,344 / 15,628. Correct derived overrides and equal-value
effect suppression add 1,386 browser gzip bytes; SSR gzip stays at 4,361 bytes.
The signal-only core is 4,041 raw bytes, up 243 raw / 86 gzip bytes from the
previous runtime. Native full-row list updates are slower in the measured workload;
smaller output does not establish a speed advantage.

A derived value first read after its component stops computes once from current
inputs, then freezes without subscribing. Failed computations keep and rethrow
the original error; dependency writes and newly attached owned work still reject.
This preserves native error/override policies rather than claiming exact Svelte
behavior for those cases.

Authored styles containing only explicit `:global(selector)` rules or a
`:global { ... }` block now compile to inventoried external CSS assets. Browser
checks cover scriptless and stateful components, outside matching elements,
independent instances, retained input edits/focus and disposal. No runtime style
injector is used, and ordinary counter output stays byte-identical.

Bounded local rules now scope authored intrinsic selector participants, including
ordinary compounds/combinators and global prefixes/suffixes. Sixteen state
predicates and before/after pseudo elements retain scope across hover, focus,
checked and disabled changes; unrelated elements and opaque child/raw HTML
boundaries remain untouched. Generated CSS is external, with matching DOM/SSR
hashes. Prefix matching memoizes selector/node states to avoid exponential
ancestor-path enumeration.

Bounded first/last/only child and of-type selectors, `:empty`, and four nth
selectors are supported. Nth arguments remain unscoped, including foreign
siblings. Other functional selectors, at-rules/keyframes, complex global placement,
preprocessing, external references, escapes, spreads and uncertain relational
branch/slot cases remain unsupported. The optional compiler uses the MIT Raffia
parser; no browser dependency is added. Its safety guard rejects more than 256
opening delimiters, including those in literals/comments. Full scoped CSS and
unused-selector diagnostics remain open.

Public instance rune fields now compile through Crepus: state/raw/derived/by,
including typed and zero-argument state fields. Bounded source checks cover
inheritance, initialization order, nonenumerable DOM accessors, ordinary SSR
state fields, callable receivers, independent instances and disposal. Private
identifier-keyed instance state/raw/derived initializers also have browser/SSR
source proof. Full constructor coverage remains open, including JavaScript SFC computed members.
Static fields and cast-wrapped state assignments with top-level await/yield
remain unsupported; full class compatibility is unfinished.

The compiler-facing `/runes` entry also exports private-field state/raw cells.
They reuse native state/history, expose historical tracked `value` and live
untracked `peek()`, and deep `assign()` returns its resolved proxy before feedback
or disposal can replace the current value. These runtime contracts have focused
behavior/type tests and bounded private-class source acceptance in the shared
shared source gate.

The optional `/mount` entry freshly mounts compiler-marked native SFC factories and returns their synchronous typed exports. It supports owned teardown, target-local anchors and copied root contexts; `/server-mount` rejects client mounting on the server. Hydration, transitions/outros, legacy event options and error transforms remain unsupported and reject explicitly. Both boolean `intro` values are accepted for sources without transitions. The erased `ComponentView<View, Exports, Props>` return metadata and `ComponentFactory<Implementation>` callable type preserve required/optional props and export types. Generated public functions must also preserve ESM hoisting. Public mounting checks metadata props rather than an implementation parameter typed `any`. The standalone `scripts/check-native-svelte-mount.ts --compiler <path>` source check verifies 28 generated modules with frozen compiler `703ceb65`: unchanged authored launchers, typed synchronous exports, two independent instances, anchor/context/cleanup behavior, DOM-free server imports and real Bun/Node ESM cycles. The combined await/source gate currently uses a separate compiler snapshot; merging those compiler lineages remains open. Declaration emission for setup-local interfaces is also unfinished.

`readonly(store)` exposes only a bound `subscribe`, preserving custom store
receivers, invalidators and cleanup. Writes through the original store still
notify its subscribers. This facade does not freeze stored values. `toStore(get,
set?)` bridges reactive state into a `Readable` or `Writable` store with eager
initial evaluation, post-order Rune effect scheduling on the client, independent
root survival across component disposal while subscribers remain active, and
one-shot `writable(get())` behavior on SSR. `fromStore(store)` bridges a
`Readable` or `Writable` store (or `{ subscribe }` observable) into a `{ current }`
reactive wrapper, sharing one store subscription across tracked readers and
derived chains on the client, releasing after a microtask when demand drops to
zero, and reading via `get(store)` outside tracking or on SSR. Authored
`svelte/store` named imports, aliases and re-exports of `readonly`, `toStore`
and `fromStore` are admitted by the locally verified Crepus compiler for DOM and
SSR. That compiler change is not published yet; the direct Moonshine `/store`
API is available independently.

The optional `/binding` entry re-exports native `bindFiles` for independent
file-input factories. Nullish models preserve selected files; clearing requires
an empty `FileList`. Change and connected-form reset write the current list.
Disposal removes listeners, including on retained detached inputs; Svelte's
reference can still update its model from those saved elements. The locally
verified Crepus compiler lowers authored `bind:files` on static file inputs with
identifier/member targets, including keyed rows. SSR omits the value without
reading it and retains unreachable checks for typed assignments/change handlers.
Function bindings, dynamic input types, spreads and hydration remain unsupported.
This compiler change is unpublished and requires the `bindFiles` runtime from
Moonshine 0.4.13 or newer.

The locally verified Crepus compiler also lowers `bind:open` on static HTML
`<details>` elements through the existing independent `bindOpen` helper. Shorthand,
state/prop identifiers, member targets, writable stores, keyed rows and imported
child bindings have DOM/SSR source coverage. User `ontoggle` handlers run before
the binding write, and member-based handlers are read at dispatch. SSR snapshots
the boolean `open` attribute without installing listeners or running handlers.
Nullish state closes the element without adopting its DOM state.

This compiler work remains unpublished. Function-pair targets, dynamic elements,
other element types, duplicate bindings and conflicting `open` attributes reject.
Native owner cleanup removes listeners even from saved detached nodes; the
Svelte 5.57.1 reference retains them. This is bounded authored-source support,
without hydration or Svelte's compiled component ABI. Set
`MOONSHINE_CREPUS_COMPILER` to the local compiler to enable the isolated source
regression in `test/standalone.test.ts`.

### `$props.id()`, `settled`, and `flushSync`

`/runes` and `/ssr` export `propsId()` for Svelte 5's `$props.id()` rune, and the
local unpublished Crepus compiler lowers top-level component-instance
`const id = $props.id()` / `let id = $props.id()` declarations to `propsId()`.
`propsId()` generates deterministic sequential `"s-0"`, `"s-1"`, ... IDs scoped to
the root `Owner` via `WeakMap<Owner, { next: number }>` so DOM and SSR component
trees produce identical IDs without cross-request or cross-root counter drift,
and throws when called outside active component/root initialization or during
cleanup computations.

`/svelte` and `/ssr` also export `settled()`, `flushSync(fn?)`, and `untrack(fn)`
(with `settled` routed alongside `tick` from `'svelte'` in the local Crepus
compiler). `flushSync(fn?)` executes an optional callback and synchronously drains
all queued native rune work (`drainTickWork()`), while `settled()` awaits queued
rune flushes in a loop until all chained rune effects settle (`hasPendingTickWork()`
is false).
