# `@tschk/moonshine-dom`

Independent Moonshine browser and server rendering. The only runtime dependency
is the signal kernel; this package has no React, Solid or parser dependency.

```ts
import { h, render } from "@tschk/moonshine-dom";
import { createSignal } from "@tschk/moonshine-dom/reactive";

const dispose = render(() => {
  const [count, setCount] = createSignal(0);
  return h("button", { onClick: () => setCount(count() + 1) }, count);
}, document.getElementById("app")!);
```

The browser factory `hNS(namespace, tag, props, ...children)` takes an explicit
namespace URI string. HTML, SVG and MathML literals retain their known element
types; custom URIs return `Element`. An empty URI creates a null-namespace node.
Authored `xmlns` stays an ordinary attribute and does not override this choice.
Pass each child's lexical namespace explicitly when using compiler-owned trees.
Non-string namespaces fail at the boundary; URI/tag validity follows the browser's
`createElementNS` behavior.

The compiler-facing `hSourceNS(namespace, tag, props, ...children)` also accepts
runtime namespace values. Nullish values select HTML; other values reach the
browser unchanged for DOMString conversion and native namespace errors. Ordinary
`h` keeps its existing string conversion, and `hNS` keeps its string-only guard.

- `/reactive`: signals, memos, owned computations, cleanup and batching.
  `on(accessor, callback, { defer: true })` limits an effect or memo to explicit
  dependencies and skips its first callback. An array of accessors supplies a
  tuple of values. The callback receives current inputs, previous inputs and its
  previous result; incidental callback reads do not subscribe. Omit `defer` to
  run on the first evaluation. The same helper is available on `/ssr`.
- `/html`: opt-in, unsanitized markup. `rawHTML(read, namespace?)` returns an
  accessor of cached nodes for ordinary `h` children; namespace is `html`, `svg`,
  or `mathml`. `htmlContent(element, read)` requires a live owner and controls a
  fresh element's entire sole-child contents (including cleanup); initialize it
  from an `h` ref callback without ordinary children. It preserves contextual
  table/SVG parsing. Identical raw values retain nodes; changed values replace
  them. Both helpers assign directly to `innerHTML`, including TrustedHTML.
  SSR's separate `rawHTML(value)` export from `/ssr` emits unescaped markup.
  These helpers are not sanitizers: inline handlers and other active content
  remain active, although inserted scripts are inert in the browser. Inject only
  trusted content. Injected markup is not compiled into components or bindings;
  this provides no hydration behavior. Default native children remain escaped.
- `/custom-element`: optional `setCustomElementValue(node, name, value)` preserves
  literal object/function values for registered custom-element setters. Compiler
  effects evaluate expressions before calling it; setters run without tracking or
  an owner. Hyphenated HTML elements only; events use ordinary event listeners.
  Missing setters use string attributes, nullish values remove attributes, and
  unregistered elements receive nonnull objects as properties (upgrade does not
  replay setters). HTML-content/prototype names and style always remain literal
  attributes. This opt-in boundary rejects event names and preserves the ordinary
  `h` contract; it does not supply SSR serialization or hydration.
- `/component`: per-instance setup scopes, inherited context and an explicit
  component-event listener symbol. Both `h(Component, props)` factories enter an
  attached, untracked scope and preserve live prop descriptors. Context APIs are
  initialization-only; detached control-flow roots inherit context without
  changing their explicit disposal contract. Render roots through `h` to enter
  the component scope. Context-map snapshots do not provide a legacy vnode ABI.
- `/component-instance`: compiler-facing named exports and captured-path references.
  `exposeComponent(exports)` preserves own descriptors in an opaque instance;
  `componentRef` props carry `{ get, set }`. References publish after setup and
  clear to `null` in a later microtask, only if they still refer to that instance.
  References may opt into `cleanup: "commit"` for Svelte 5.57 teardown timing:
  child and ancestor cleanup can still read the instance, then it clears after
  the complete native cleanup commit and before the outer disposer returns.
  The Svelte lifecycle queue publishes pending references before mount/effect
  callbacks by default. `publication: "post"` requires an active rune scheduler
  and queues publication at the registration point among child lifecycle posts,
  before ancestor posts. Register exposure after child effects/mounts when those
  callbacks must precede publication. SSR creates no reference callbacks. Dynamic paths may supply
  `{ parts: () => tuple, get: (...parts) => value, set: (value, ...parts) => {} }`.
  Only parts are tracked, after setup during reference publication. Path changes
  publish the new target before clearing the old captured target if it still holds
  that instance; disposal clears the last captured path using the chosen timing. Cell
  getters/setters are untracked. Publication drains at most 1,000 successive feedback
  waves per flush; independent references in one wave are not capped.
  `ComponentReference<T, readonly [Key, Index]>`
  preserves typed tuple arguments and requires parts for nonempty tuples;
  `ComponentReference<T>` retains the fixed-cell contract. SFC `bind:this` now has bounded scalar/member source acceptance, including empty exports; loop-dependent path extraction remains compiler work.
- `/ssr-owner`: lightweight `scopeSSRChild(child)` captures a live owner for the
  complete serialization of deferred children. It is also exported by `/ssr`.
  It preserves request context, select state, SVG namespace and text escaping;
  serializing it after owner disposal throws. This entry lets browser provider
  modules support SSR without importing the serializer into browser bundles.
  `isSSRRendering()` detects the synchronous serialization extent, including
  bare callbacks and cleanup; it does not propagate across async continuations.
- `/render-scheduler`: internal opt-in carrier contract for native render effects,
  structural memos and component/control ownership. The Svelte `/pre` module owns
  the scheduling implementation. Ordinary native rendering stays synchronous;
  the signal kernel has no scheduler dependency.
- `/resource`: owned client data fetching, separate from the kernel's resource API.
- `/control`: keyed `For`/`mapArray`, position-stable `Index`/`indexArray`, and
  retained `Show` branches with explicit accessors. `Index({ each, children })`
  calls `children(itemAccessor, indexNumber)` once per position; replacement and
  reorder update `itemAccessor()` while preserving that position's DOM and owner.
  Use it for editable primitive lists; keyed `For` follows item identity instead.
  Removed tail positions dispose their owners; appended positions get new owners.
  `Switch({ children: () => matches, fallback })` retains the first truthy
  `Match({ when: accessor, children: valueAccessor => child })`. Conditions are
  checked in order; inactive branches create no contents and selected branches
  retain their owner until selection changes.
- `/dom` (also the root): direct DOM factories, reactive children/attributes,
  events, refs, form defaults, SVG and bounded style objects.
- `/ssr`: escaped HTML factories and server lifecycle hooks.
  `boundary(render, fallback)` buffers synchronous serialization, discards failed
  output and internal scopes, then serializes the fallback in a fresh scope.
  Deferred children, arrays, select bookkeeping and SVG context are covered.
  Accepted scopes live until request cleanup; discarded Svelte destruction hooks
  are suppressed. Factories can be created ahead of time and reused: ownership
  and context come from the current serializer. Fallback failures reach an outer
  boundary. Arbitrary state writes and `afterRender` commits are not rolled back.
  Externally captured `scopeSSRChild` values retain their lexical owner and error
  policy; an error already swallowed there cannot reach this boundary. This is a
  native serialization API, with no async, reset, hydration or SFC boundary ABI.
- `/head`: owned browser head declarations. `head(() => children)` adds only its
  owner's nodes; cleanup removes them. `title(() => text)` updates the document
  title and leaves the last title in place when its owner is disposed.
- `/head-ssr`: synchronous `renderWithHead(() => child)` returns `{ body, head }`.
  Use this entry's `head` and `title` functions inside that render scope. Ordinary
  meta tags retain declaration order and duplicates. Within a head scope the first
  accepted title wins; later head scopes can override it. Request and boundary
  ownership are preserved. The framework renderer collects component head output
  automatically; component titles override route metadata's fallback title.
- `/framework-native`: the bundled framework renderer; requires the optional
  `@tschk/moonshine-framework` peer. Supports Bun, Node and Cloudflare SSR, static-mode rendering and
  fresh SPA mounts with separate authored client entries.
- `/framework-source`: source-file SSR compatibility for Bun/Node, shared by
  the Solid and Svelte replacements. It imports page/layout files on demand;
  deployed bundles use `/framework-native` with their bundled module inventory.

If a root callback throws, its owned work is disposed before deferred effects start,
and the original callback error is rethrown even if cleanup fails.

Native SSR layouts initialize around lazy page children, so context providers
reach their descendants. Explicit `/ssr` `defer(() => child)` retains the live component owner;
reused factories attach to the current request after that owner is disposed.
Ordinary accessor children and attributes keep their eager construction snapshot.

Source parsing and lowering belong in Crepuscularity. These APIs do not implement
Solid's compiled instructions. Hydration, islands and async server components
are unsupported. Raw HTML uses the explicit `/html` entry. Property-only state can use refs. Style objects use
hyphenated CSS names and explicit units; complex declarations use CSS strings.
SSR cannot encode distinct live and reset values for a form control. Ambiguous
SVG tags need an accessor parent context or an explicit namespace.

See [the native example](../../examples/native-app/README.md),
[compiled TSX components](../../examples/native-template/README.md),
[compiler limits](../compiler/README.md), and [the design](../../DESIGN.md).
For reproducible scoped comparisons, run `bun scripts/benchmark-reactive.ts`,
`bun scripts/benchmark-ssr.ts`, or the browser `bun scripts/benchmark-dom.ts` from
the repository root. Current fixtures have smaller Moonshine bundles but slower
rendering than Solid; these are not complete framework comparisons.
For the authored counter comparison against React, run
`CREPUS_COMPILER=/path/to/crepus bun scripts/benchmark-counter.ts`. It checks
identical SSR markup and serial DOM commits, reports compressed bundle sizes,
and records versions and source hashes. Fresh-document startup measures from
before localhost module fetch through complete DOM commit, with HTTP caching
disabled, alternating order, five warmups and 25 recorded loads per runtime.
The browser/process stays warm; document navigation, paint, remote network and
hydration are excluded. This is one counter workload, not a framework ranking.
For the exact same authored two-component SFC counter against installed Svelte,
run `CREPUS_COMPILER=/path/to/crepus bun scripts/benchmark-sfc-counter.ts`.
It snapshots the compiler and native packages, fingerprints sources/artifacts,
compares production gzip/Brotli sizes and checks five clicks plus retained child
identity in Chromium. It also alternates five warmups and 25 fresh-document
startup samples per framework, plus 625 serial click-to-DOM-commit observations.
The browser/process stays warm and local responses disable caching. In-page
clocks exclude RPC time; startup includes localhost module fetch and evaluation.
Timer resolution can produce zero click medians, which do not mean free work.
A separate warm Bun process also measures fresh synchronous SSR from those same
authored components: five discarded warmups, 25 alternating samples of 5,000
renders, exact repeated markup and visible HTML equality after removing only
hydration comments. It reports SSR bundle sizes, median/p95 and raw samples in
the same fingerprinted result. Navigation, paint, cold startup, async data, remote
network and hydration are excluded. These results cover one workload, not a
framework ranking.

Events accept functions or native listener objects with `handleEvent(event)`.
Listener objects may include `capture`, `once`, `passive` and `signal` options;
`this` inside `handleEvent` is the listener object. For example,
`h("div", { "on:click": { capture: true, handleEvent(event) {} } })` registers
capture before bubbling handlers. `on:eventName` preserves event name case;
`onClick` continues to register `click`. Options are captured at registration,
and owner disposal removes the registered listener. SSR omits event props.

DOM lifecycle updates use setters and `batch` from `/reactive`: mount callbacks
run after the synchronous DOM updates finish. Wrap external kernel signal or store
writes in this native `batch` too, so newly inserted components mount after commit.

For authored TSX source checking, opt in with a declaration file containing
`import type {} from "@tschk/moonshine-dom/jsx-types";` and TypeScript options
`"jsx": "preserve", "noEmit": true`. Include that declaration and the source TSX
in a native-only tsconfig. This supplies no executable JSX runtime: compile source
with Crepus before running it. Keep React source in a separate config because this
opt-in namespace describes native components.

The types check component props, children, and known HTML/SVG tag names. Intrinsic
props match `h`'s unrestricted records; attribute names, attribute values, and event
parameter types are not checked or inferred.

`unwrap` on `/store` returns the original store object without subscribing.
Ordinary object/array containers unwrap embedded proxies in place; frozen
containers are copied. Mutable object getters are skipped; frozen copies
evaluate their enumerable getters.
Raw mutations bypass notifications; opaque instances remain unchanged.

Optional structured state lives on `/store`, using the native reactive graph:

```ts
import { createStore, produce, reconcile } from "@tschk/moonshine-dom/store";

const [state, setState] = createStore({ user: { name: "Ada" }, visits: 0 });
setState("user", "name", "Grace");
setState(
  produce((draft) => {
    draft.visits++;
  }),
);
setState(reconcile({ user: { name: "Lin" }, visits: 3 }));
```

Property reads, membership checks and key enumeration subscribe independently.
Public proxies are read-only; setters batch writes through native `/reactive`.
Path setters support key arrays and array predicates/ranges. Object updates
shallow-merge; `undefined` deletes a property. `produce` supplies writable drafts;
`reconcile` replaces snapshots while retaining matching array items by `id`
(or a supplied key), with `key: null` and `merge` options.

Plain objects and arrays retain their input identity. Use setters for tracked
changes; external mutations of the original object do not notify observers.
Class instances and other non-plain values are opaque references; their own
mutations do not notify observers.
Frozen/nonextensible objects, descriptor/prototype mutation and unsafe prototype
paths reject explicitly. Deep setter paths have broad TypeScript types. The
kernel's `createStore` retains its callback-mutation API. The Solid replacement's
`/store` uses this same native graph; a separately installed Solid runtime does
not observe it.

Client resources use the same native graph:

```ts
import { createResource } from "@tschk/moonshine-dom/resource";

const [user, { mutate, refetch }] = createResource(userId, async (id) =>
  (await fetch(`/api/users/${id}`)).json(),
);
// user() reads the value; user.loading, user.error and user.state are reactive.
// mutate(nextValue) edits locally; refetch(info) fetches the current source again.
```

Create resources inside an owned root or rendered component. A source accessor
refetches when its value changes; `false`, `null` and `undefined` disable fetching.
Fetchers receive the source plus `{ value, refetching }` and may return a value or
promise. Only the newest request publishes; disposal ignores later results.
This does not cancel the underlying operation. `mutate` changes only the value;
an active request may overwrite it. Reads throw terminal fetch errors. The
`latest` getter retains the previous value while refreshing. State is one of
`unresolved`, `pending`, `ready`, `refreshing` or `errored`.
Each explicit `refetch` starts a request; calls within one microtask are not
coalesced. Fetcher cleanup callbacks retain the resource's owner on refetch.

Options support `initialValue` and an informational `name`; other options reject.
This client API does not implement Suspense, transitions, hydration or async SSR,
and is not yet admitted by the Solid compiler bridge. The Solid replacement's
`/solid` export uses this client resource API; the kernel resource API keeps
its existing contract.

### Optional input bindings

`@tschk/moonshine-dom/binding` exports `bindValue(element, read, write)`. Call it
under a live owner after constructing a text/number/range, date, datetime-local,
month, week, time or color input, or textarea, and
installing its attributes and user event listeners. It synchronizes parent writes,
input events and uncancelled form resets, including externally associated forms.
Undefined/null initial state adopts an existing nonempty DOM value; number/range
events produce numbers, with empty/invalid numbers producing `undefined`. Other
accepted types write strings. Browser sanitization stays native: parent model
values are not replaced by sanitized DOM values, and resets forward raw defaults. Disposal
removes listeners and suppresses pending reset work. Keep the input type fixed
for the binding lifetime. Reset synchronization requires a form connected to the
control's owner document; detached forms are outside this contract. This optional primitive
does not implement hydration or SFC parsing/lowering.

`bindChecked(checkbox, read, write)` uses the same owner/reset contract with the
`change` event. Nullish initial state adopts `checked` (including false), while
explicit state overrides `defaultChecked`. Parent writes update checked state;
uncancelled resets synchronize its default back to state. Install user change
listeners before the binding. Keep the type fixed to checkbox.

`bindSelectValue(select, read, write)` supports single/multiple selects and owns
its change/reset listeners and option MutationObserver. Single values match by
`Object.is`; multiple values use array membership. Undefined initial state adopts
the DOM selection (all selected values as an array for multiple). Explicit null
selects a typed null option if present, otherwise clears a single select; multiple nullish values preserve selection. Invalid
nonarray multiple values throw. Option changes reapply the model without writing
a new model value. Keep `multiple` fixed for the binding lifetime.

For typed primitive/object option values, call `setOptionValue(option, value)`
after constructing each option; identity is preserved in a private WeakMap and
updates refresh its bound select even when their DOM strings are equal. Ordinary
`h("option", { value })` retains string semantics. The compiler must emit this
explicit hook and keep SSR serialization separate; this is not hydration.

The SSR factory exports optional `selectBinding` and `optionBinding` symbols for
compiler-created typed selections: `h("select", { [selectBinding]: { value } },
h("option", { [optionBinding]: { value: option } }, label))`. These boxes carry
literal values, including functions, without calling them. Options serialize
their value once with HTML escaping; nullish/function values omit the attribute.
Single selections compare raw values with `===`; multiple arrays use `includes`,
matching Svelte 5.57 SSR. All matching options receive `selected`; an unmatched
typed selection is allowed. Ordinary string select behavior stays unchanged.
For compiled source, a select box may also set `preserveSelected: true` to keep
authored option selection flags alongside binding matches. The optional flag must
be an own boolean data property; ordinary native boxes retain override behavior.
With `hSource`, an ordinary option `value` slot preserves attribute placement
without reading its overridden value/getter. The boxed value still determines
serialization and comparison identity.
These symbols provide SSR output, not hydration or client identity transport.

Compiler emitters can use `hSourceEntries(tag, entries, ...children)` from `/ssr`
when ordered source attributes include repeated names. Entries are `[name, value]`
pairs; function values are lazy readers, evaluated and serialized in entry order.
The existing source codec, escaping, validation and client-only attribute suppression
apply. This is attribute serialization; it does not implement group bindings.

Intentional reference difference: Chromium probes of Svelte 5.46.4 and cached
5.57.1 initialize an undefined
multiple-select binding to only the first selected scalar. Native bindings adopt
all selected values as an array, consistent with the multiple-value contract.
This is a measured difference for those versions, not a claim about all Svelte versions.

Native lifecycle adapters can register `onBeforeDispose` and `onAfterDispose`
from `/reactive`. Before callbacks run parent-first while owned work is live;
after callbacks run child-first after outer cleanup, DOM removal and the current
native commit. These are final-disposal hooks, not computation-rerun hooks.
Disposal drains callbacks, children, cleanups and stops while preserving the first
error, including reentrant disposal. Before-disposal callbacks may register
`onAfterDispose` callbacks on their still-live owner; registering another
`onBeforeDispose` callback during disposal is rejected. Both registrations reject
ownerless or already disposed scopes.

`queuePostCommit` uses the existing native commit queue, or a microtask outside a
commit; generic callbacks must manage their own cancellation. `/component` also
provides `onComponentReady` during setup, fired once after successful setup with
the frame inactive. Failed or already disposed instances do not become ready.

`createInputGroup(kind, read, write)` returns `{ bind(input) }` for radio or
checkbox groups. Create each token under a live owner, then bind inputs under
their own live row/component owners after attributes and user change handlers.
Token disposal releases every member; row disposal unregisters only that member.
The compiler allocates tokens per binding target/component and nested each path;
there is no global name lookup or runtime ownership guessing. Browser HTML `name`
grouping still applies independently. Keep input types fixed.
Use `createInputGroup("mixed", read, write)` when one target intentionally combines
radio and checkbox members. Selection follows each input's fixed type; checkbox
writes collect checked values from every member, including radio payloads.

`setInputValue(input, value)` stores typed group values privately and refreshes
selection on value changes. Ordinary inputs retain string values without this
hook. Checkbox models must be arrays or nullish; other values reject. Radios use
`Object.is` on native identities (no Svelte proxy unwrapping); checkbox membership uses array inclusion and change
collection deduplicates values in current DOM order. Unchecking a duplicate value
removes that value from the group. Removing a member preserves model state until
a subsequent change; value changes reapply the model without writing it back.

Pinned Svelte 5.46.4 Chromium behavior (also present in 5.57.1 source): group
undefined state does not adopt checked defaults; radio resets write `null` and
checkbox resets write `[]`. This differs from standalone `bindChecked` default
adoption. Native groups follow that protocol, respect cancelled connected-form
resets and suppress pending work after disposal. No SSR group serialization,
hydration, cross-component grouping or SFC lowering is claimed by these helpers.

New attached scopes reject disposed owners, including work created by post-disposal
callbacks. Explicit detached roots remain independent and require their own stop.

Both `bindSelectValue(select, read, write, equal?)` and
`createInputGroup(kind, read, write, equal?)` accept an optional final equality
predicate, defaulting to `Object.is`. It applies only to single selects and radio
groups; multiple selects and checkbox groups retain array membership semantics.
This lets compiler adapters normalize their own raw/proxy identities without
importing a source-language runtime into DOM. Stored values and change payloads
keep the original typed identity; equality never substitutes a normalized value.

Value-binding resets copy raw `defaultValue` into the model before numeric
conversion. The browser may clamp or sanitize its live value independently: an
empty range default yields native model `undefined` with a browser value of 50;
a range default 5 below minimum 10 yields model 5 with browser value 10. Empty
or invalid numeric defaults remain `undefined`. Svelte's adapter can translate
empty native numeric values to its version-specific null convention; invalid raw
numeric defaults still differ from Svelte 5.46.4/5.57.1's NaN conversion.

`bindValue` write callbacks may accept optional second argument `reset?: true`.
Only form-reset writes receive it; normal input and initial adoption call the
setter with one argument. Compiler adapters can use this metadata to translate
source-specific numeric reset conventions without adding listeners or changing
the generic native empty/invalid-to-undefined contract. Existing one-argument
setters remain compatible.

`bindOpen(details, read, write)` controls a details element's `open` property.
Install it after user `toggle` listeners under a live native owner. Nullish state
closes the element without adopting its initial DOM state. Native toggle events
write the boolean property after user listeners; browser coalescing is preserved.
It has no form-reset behavior. Cleanup removes the binding listener, including
queued events and retained detached nodes (unlike the audited Svelte 5.57 listener).
SSR uses the ordinary boolean `open` attribute snapshot. The Svelte `/binding`
entry re-exports this helper. The unpublished local Crepus compiler now lowers
bounded authored `bind:open`; see the Svelte adapter's source-support limits.

`/store`'s `createMutable(value, { equals })` can select property-write equality.
The default is strict equality (`===`); the optional comparator receives the
previous and next values. Nested mutable views and accessor setter receivers
retain that policy, and raw-object views are cached separately per comparator
function. The Vue adapter supplies `Object.is` for signed-zero/NaN behavior.

## Optional rotating text

`@tschk/moonshine-dom/rotating-text` exports `createRotatingText(phrases, intervalMs)`.
Its text accessor advances inside a live render owner and stops when that owner
is disposed. Reduced motion keeps the first phrase; changing the preference
pauses or resumes rotation. Empty and single-phrase inputs create no timers.
The helper is separate from the DOM root and signal-only exports.

## Compiler-owned template blocks

The `/dom` entry exposes `templateBlock(build)` for compiler-owned node trees.
It detaches a block before disposal callbacks while preserving its descendant
DOM for those callbacks; effects, listeners and owned ranges still stop. Pass
the supplied retention predicate to compiler-created insertion ranges. Nested
`h()` children and insertion ranges inherit the containing block policy; an
explicit range predicate overrides it. Cleanup still stops their reactive work
and listeners.

Compiler-owned control ranges can pass an explicit scheduling function to
`Show`, `For`, `mapArray` (fourth argument), or `indexArray`. Passing `read => read`
keeps reconciliation inside the containing range pull. The default scheduler and
`mapArray`'s third deferred-removal argument retain their existing behavior.

`setAttributeValue` exposes the existing native attribute setter for typed node
updates. It does not install event handlers or replace form-binding helpers.
These primitives do not by themselves implement Svelte directive source syntax.

`bindFiles(input, read, write)` on the optional `/binding` entry binds a static
file input's `FileList`. It requires a live native owner, writes the selected
list on `change` and after uncancelled connected-form resets, and removes its
listeners on disposal. A nullish model neither adopts nor clears the input;
write an empty `FileList` (for example `new DataTransfer().files`) to clear it.
File contents are not read or uploaded. Browser assignment rules apply.
