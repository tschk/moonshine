# `@tschk/moonshine-vue`

The legacy `/vue` and `/compiler-sfc` entries re-export Vue as a peer.
At runtime, the root bridges and independent `/reactive` entry depend only on Moonshine's
signal kernel and native DOM package. They import no Vue, React, WASM, or Crepus
runtime. Vue remains an optional peer for the two legacy entries.

Strict TypeScript checking of the root entry requires installing
`@tschk/moonshine-framework`, even when importing only a bridge: the root also
exports `crepusRenderer` with the framework's `Renderer` contract. The framework
remains optional for runtime imports and bridge-only browser/Bun/Node bundles.
This requirement does not apply to the signal-only `@tschk/moonshine` core entry.

The native entry is a bounded composition API implementation. It is not a
replacement for Vue's component/compiler ABI: do not alias `vue` wholesale onto
this package or execute existing Vue compiler output against it.

```ts
import { fromMoonshineSignal } from "@tschk/moonshine-vue";
import { ref } from "@tschk/moonshine-vue/reactive";
```

| Subpath          | Provides                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `.`              | signal bridges, lazy native SSR compatibility renderer                                                               |
| `./vue`          | `vue` runtime re-exports                                                                                             |
| `./compiler-sfc` | `vue/compiler-sfc` re-exports                                                                                        |
| `./reactive`     | native refs/`shallowRef`, `toRef`/`toRefs`/`unref`/`isRef`, `reactive`/`isReactive`, `computed`, synchronous `watch` |
| `./context`      | native component `provide`, `inject`, `hasInjectionContext`                                                          |
| `./text`         | native DOM and SSR interpolation conversion                                                                          |
| `./props`        | compiler-facing shallow declared props and owned parent refresh                                                      |
| `./events`       | compiler-facing typed component callbacks, callback arrays and per-instance once delivery                            |
| `./normalize`    | native class/style normalization and compiler-facing DOM/SSR policies                                                |

`./framework` exports the same lazy `crepusRenderer` compatibility name as the
root. Its optional `@tschk/moonshine-framework` peer is needed only when rendering.
Pages must use explicit `@tschk/moonshine-dom/ssr` server factories. Existing
React IR pages need to be ported; this facade does not render React components.
The compatibility root renderer loads source files under Bun. Bundled deployments use
`@tschk/moonshine-dom/framework-native` with their bundled module table.

Legacy peer: `vue` >= 3, needed only for `/vue` and `/compiler-sfc`.

Native `watch` requires `{ flush: "sync" }`; component scheduling, deep watches,
and Vue collection proxies are not implemented by this entry. Plain objects and
arrays are reactive; nested refs unwrap on object properties and retain their
identity at integer array entries.
Each watcher run can register multiple cleanup callbacks. Reruns and stops drain
them in registration order, attempt all callbacks after a failure, and preserve
the first error. A cleanup that stops its watcher prevents another callback run.

### Optional native watch errors

`./errors` exports `withComponentErrorHandler(handler, setup)`, which requires a
live native owner and scopes work created synchronously by `setup`. It handles
function-source getter errors, `watch` callbacks, `watchSyncEffect` bodies and each
registered watcher cleanup. The handler runs synchronously and untracked with the
original thrown value and `{ component, phase }`. The finite phase labels are
`"watch getter"`, `"watch callback"`, `"watch effect"` and `"watch cleanup"`.
`component` is the native frame or `undefined`, not a Vue public instance.
Getter/effect bodies keep their normal tracking; handled getter errors yield
`undefined`, and handled cleanup errors allow peers and the next run to continue.
Source reads do not restart recursively when getter reporting writes the source;
callback feedback remains synchronous and reentrant.

Returned promises with callable `then` and `catch` report rejection through the
captured handler/frame, including after owner disposal. A then-only object is
ignored. A throwing `.catch` method escapes its caller. A handler that throws
logs its secondary error once; genuine reentrant watch errors invoke it again.

Without this scope, existing native throwing and `catchError` behavior remains.
Other error phases retain their existing handling. This is not Vue's app
configuration or `onErrorCaptured`, and adds no watcher or component frame.

`toRef` preserves existing native refs, creates live writable property aliases,
and wraps getters in readonly refs without caching their results. Its optional
property default applies only to `undefined`; an alias does not make a plain
source object reactive. Function-valued properties and
defaults stay literal. `unref` unwraps native refs once and never calls functions.
`isRef` recognizes only this entry's native refs, including computed/getter refs;
it does not accept Vue host refs or objects with a spoofed `__v_isRef` flag.

`shallowRef` stores raw values unchanged and tracks replacement of `.value` using
`Object.is` equality. It preserves existing native refs, existing reactive proxies,
and literal function values. Nested raw mutations do not notify; an already
reactive proxy keeps its own tracking. This supports external snapshots without
deep conversion. `triggerRef` is not implemented.

Native computed refs are lazy and cached, propagate previous successful values,
and keep writable setters. Stopping an owner releases its watchers without
freezing separately retained computed refs.

The local Crepuscularity compiler now lowers the bounded typed setup counter
through real DOM/SSR module graphs without Vue. It supports imported native
ref/computed helpers, stable function handlers, interpolation and live props;
strict public prop types and independent instances are verified. Inline and
imported finite prop interfaces support shallow local writes/deletes and
coalesced parent refresh. Scoped/module styles, entities, unsupported whitespace, dynamic
handlers, non-finite defaults and unsupported Boolean prop variants still diagnose. Nested Vue render
scheduling, effectful parent getter timing, general component composition and
the VNode ABI remain incomplete. These compiler changes are local and unreleased.

The local compiler also accepts ordinary props-less `<script setup>` components,
including empty setup, constants, JavaScript/TypeScript counters and imported
children. It supplies an empty props type when no props macro is present, after
the existing macro, import and async-setup validation. Components that declare
typed props keep their existing contract. This removes an unnecessary
`defineProps` declaration; it adds no attrs fallthrough, Options API or host VNode
support. The compiler work is unpublished. Set
`MOONSHINE_CREPUS_COMPILER` to the local compiler to enable the isolated source
regression in `test/standalone.test.ts`.

The local compiler lowers text and numeric input/textarea `v-model` to the opt-in
`./model` DOM factory and `./model/ssr` server factory. Plain models and `.lazy`,
`.trim`, `.number` use the independent graph, including IME composition handling,
focused trimming, empty numeric strings and owner cleanup. Writable setup
`ref`/`shallowRef` targets and member targets rooted in setup refs or `reactive`
objects are supported. Input types must be static text, search, tel, url, email,
password, number or range; textarea children and explicit value/defaultValue
conflicts reject. Select, checkbox, radio, file and component models remain
unsupported, as do dynamic types and readonly/unknown targets. Source lowering
is local and unpublished; this does not implement Vue directives or hydration.

Native `./context` provides `provide`, `inject`, `hasInjectionContext`, and typed
`InjectionKey` symbols during synchronous native component initialization. Injection
searches ancestors, never the same component's own providers. Nearest ancestors
shadow outer values, including explicitly provided `undefined`; refs stay refs.
Defaults are values unless the third argument is `true`, which invokes a missing
value's factory untracked. Factories have no Vue public-instance `this` receiver.
Outside initialization, `provide`/`inject` throw; `hasInjectionContext` returns false.
This supports DOM and SSR component scopes, not Vue app-level injection or
`app.runWithContext`, and does not establish full SFC compiler compatibility.

### Optional native lifecycle

`@tschk/moonshine-vue/lifecycle` exports `onMounted`, `onBeforeUnmount`, and
`onUnmounted`. Register synchronously during native component initialization, or
register `onUnmounted` inside an `onMounted` or `onBeforeUnmount` callback.
SSR skips all three. Mounted hooks run after synchronous children and DOM commits,
with pending component references published first. Disposed components skip queued
mounts. Before-unmount hooks run parent first with DOM and watchers still active;
unmounted hooks run child first after DOM removal and reactive teardown. Callbacks
are untracked; returned cleanup functions are ignored. Mounted callbacks flush
pending references first, recheck that the owner is live, then invoke the hook
with its component context. Mounted and before-unmount callbacks restore the previous
context even when they throw. Registration from an already disposed owner,
including an unmounted callback, is rejected.

This optional entry has no Vue dependency. It does not provide Vue public-instance
receivers, app lifecycle, update hooks, async component/Suspense scheduling, or
full SFC compatibility. Crepus lowers named/aliased imports of these three hooks
in the accepted authored source slice. Permanent DOM/SSR fixtures verify nested
registration, connected mount/before phases, disconnected child-first cleanup,
two instances and server callback suppression. Template refs and Vue's full
error-handler policy remain unproven. A failed native mounted hook tears down
its owner; the reference can retain the subtree until unmount.

Callback failures propagate after pending peers and disposal finish. Native
exported-instance reference cleanup remains deferred; Vue template-ref lowering
is still pending.

A watch started under an already disposed native owner throws. Ownerless watches
remain manually stoppable.

`./reactive` also exports `watchSyncEffect(effect)`, returning a stop function.
The effect runs immediately and tracks synchronous reads, including conditional
sources. Its supplied cleanup registrar accepts multiple callbacks, including
late registrations while active; registrations after stopping are ignored.
Cleanup runs untracked before reruns and on stop. Writes made by the effect or
its cleanup do not recursively invoke that same effect; cleanup writes remain
visible to the following run. Native owners stop their effects on disposal;
ownerless effects require manual stopping. SSR sync effects run and stop with the
request owner. Promise continuations are not tracked.

Cleanup attempts every registered callback and propagates the first failure;
failed effect runs release their registered cleanup while preserving the effect
error. This follows native error handling rather than Vue's app error handler.
This entry does not supply scheduled `watchEffect`, pause/resume handles, or a
Vue component render scheduler.

`./reactive` exports `toRefs(object)` for destructuring linked properties without
losing live reads or writes. It snapshots enumerable string keys (including
inherited keys), omits symbols and preserves array length and holes. Properties
added later need `toRef(object, key)`. Existing native refs retain their identity.
Getter/setter descriptors keep their source receiver; writes to getter-only
properties throw. This does not implement Vue readonly-proxy warnings or SFC
compilation.

`./text` exports `toDisplayString` for DOM interpolation and
`toDisplayStringSSR` for SSR. Both preserve Vue's conversion of nullish values,
native refs, arrays, objects, maps, sets and symbols without invoking function
values. DOM conversion can return `undefined` when an object's `toJSON` does;
SSR converts that result to the literal string `"undefined"`. These helpers
produce text, and the renderer handles HTML escaping. This optional entry adds
no host dependency and does not establish Vue SFC or VNode compatibility.

Reactive object and array property updates use `Object.is`: writing negative
zero after positive zero notifies, while repeating NaN does not. Nested values
and accessor setter receivers retain this policy. This is specific to the Vue
entry; native `createMutable` keeps strict equality by default.

`./props` exports compiler-facing `createProps(source, declaredKeys)` and
`createServerProps(source, declaredKeys)`. Initial props are shallow snapshots
with own optional keys, preserving nested objects and functions. DOM local
writes/deletes are reactive; later parent changes coalesce in one owned
microtask, and unchanged final parent values preserve local overrides. Nested
props refreshes drain in that same microtask in setup order, so a queued child
sees its parent's final snapshot. Disposal drops pending refreshes. Server
snapshots remain independent per request.
The compiler resolves finite declared keys through its existing safe module
resolver; unresolved shapes diagnose rather than guessing keys.

Imported PascalCase child components now have real CLI DOM/SSR source proof for
explicit props-only calls. Parent and child snapshots settle in one props
microtask in either enqueue order while retaining child state, nodes and focus.
The permanent source gate includes two independent instances and fresh escaped
SSR requests. Static default slots have the separate source proof below. Typed component events now have separate real CLI DOM/SSR and production browser proof; the permanent source gate includes these cases. Attrs fallthrough remains unsupported. The bounded lifecycle imports above have separate source proof.
Native disposal removes retained-node
listeners; Vue can still invoke a listener on a saved detached button.

This props-only queue does not implement Vue's nested renderer jobs, `nextTick`
or immediate DOM timing. Parent getters are observed synchronously; local DOM
effects retain native timing. Setter failures preserve the first error and
allow sibling refresh/retry, deliberately avoiding the reference's cleanup bugs.

Assigning a reactive child back into a parent preserves its identity and raw
storage, including array entries and mutation methods. Deep refs, shallow refs,
and reactive properties all use `Object.is` replacement equality.

Plain unscoped Vue CSS now travels as inventoried build assets through the normal
Bun stylesheet output and SSR route links. Repeated component instances share
the stylesheet; whitespace-only blocks emit no assets. The 458-module source
gate covers unchanged CSS bytes, strict generated types, browser colors and
fresh escaped SSR. No Vue runtime is imported for this path.

Scoped/module CSS, preprocessors, external styles, URLs, imports, escapes and
`v-bind` CSS still reject. The graph reader uses Bun's CSS parser and reads only
the declared inventory; this does not claim PostCSS validation parity.

The optional compiler-private `./slots` entry supports implicit static default
content and static default outlets. Authored source tests verify repeated
outlets, lazy fallback, child consumer injection, live parent values, child prop
refresh, retained leaf state/focus and independent instances through DOM and SSR.
DOM content owns one attached scope for cache lifetime and failed-factory
rollback; it adds no component frame. Ordinary Vue modules import no slot helper.

The shared permanent gate covers 734 generated modules and all 728 emitted
TypeScript modules under both strict checkers using frozen combined
compiler `82e517ca`. Named/scoped/dynamic slots still reject.
Native granular updates skip unrelated fallback function calls that Vue
component jobs repeat; those call-count traces deliberately differ. This does
not supply Vue's component render scheduler or promise full ABI compatibility.

The optional `/events` helper lowers inline typed tuple-map `defineEmits` declarations and stable parent `@event` handlers, including `.once`. Declared props exclude event callbacks. DOM callbacks stop with their component owner; SSR callbacks remain callable after rendering, matching the bounded reference cases. Native DOM updates and error routing retain Moonshine semantics. Event validators, model events, arbitrary event names and attrs fallthrough still diagnose. This does not establish Vue scheduler or compiler ABI compatibility.

Declared component class/style props now retain literal versus expression provenance in Crepus. The optional `/normalize` entry handles nested class values, static declaration strings, dynamic styles and reactive object cloning with separate DOM/SSR policies. Fresh actual Vue 3.5.13 comparisons pass Unicode whitespace, falsy values, constant aliases, proxy identity, narrow typed styles, retained local state/focus, cleanup and two fresh SSR renders. Intrinsic dynamic class/style, undeclared fallthrough and other directives remain separate work. Merged `__proto__` style keys are safe own data properties; this intentionally differs from the reference prototype setter.

Boolean-bearing finite `defineProps` types now use compiler-only
`createBooleanProps` / `createServerBooleanProps` from `/props`; ordinary props
use their original exports and omit the resolver from bundles. The compiler
retains Boolean/String union order, distinguishes absence from explicit
undefined, accepts proven declared ASCII hyphen aliases and precasts empty/name
literals without widening public prop types. Pure optional Boolean setup values
are internally required; mixed unions remain optional. Fresh source graphs pass
both strict checkers for both targets and actual Vue 3.5.13 Chromium/SSR comparisons.

Duplicate canonical/alias bindings, ambiguous Boolean intersections, literal
hyphen declarations mixed with casts, Boolean id/class/style declarations,
non-ASCII nonempty name-literal casts remain explicit gaps.
Finite defaults have separate shallow readonly typing; full Vue render jobs and broader macro typing remain incomplete.

### Compiler-facing defaults

The optional `/props` entry includes `createDefaultProps`,
`createServerDefaultProps`, `DefaultValues`, and `withVueScheduler` for native
compiler integration. The finite default tuples specify literal values versus
factories. Factories receive each instance's stable raw props object, run in its
consumer context, and cache successful results including `undefined`. Setup
props are shallow readonly in TypeScript; the caller's props remain optional
where declared. These helpers do not install runtime readonly proxies.

The component carrier gates render work while defaults prepare. Successful
preparation refreshes that component's render callbacks; failed preparation
keeps its previous DOM until a later successful parent props commit. Independent
child component groups remain live. It reuses existing native owners and DOM
controls and guards feedback at 1,000 render or post waves. Ordinary native DOM
rendering remains synchronous without the carrier.

Finite typed source `withDefaults` now has real CLI, strict caller, Chromium and
fresh SSR acceptance, including ordered factories, cached undefined, Boolean
fallbacks and failed refresh recovery. Spreads, accessors, setup-value captures,
nested macros and unresolved default shapes still diagnose. Outer casts and
satisfies constraints retain their type checks.

This is a compiler-private contract, not Vue's complete component job or app
error policy. Render-expression evaluation and fallback, props-job error
attribution, and full Vue lifecycle timing remain separate work. The optional `/errors` scope handles watch phases; it does not
turn a default factory failure into an app error handler call.

### Optional native application mount

`@tschk/moonshine-vue/app` exports `createApp(component, props)` for native
component factories, including Crepus-compiled Vue components. Props retain the
factory's public type. The returned native application has only `mount(target)`
and `unmount()`; `mount` returns `void`, not a Vue public instance.

`mount` accepts a selector, Element or ShadowRoot in the current DOM realm,
clears its existing children and mounts one owned root. A private container lease
rejects another app before clearing and remains held until teardown finishes.
Invalid targets leave
DOM unchanged and allow a corrected attempt. Once rendering starts, a failed or
successful attempt is terminal; mounting again throws. `unmount` is idempotent;
before mounting it is a no-op, and during synchronous mounting it requests
cleanup when that mount finishes. Failed setup/mounting and rejected promise or
VNode results release owned work. Accessor children retain native tracking.

This entry adds no Vue scheduler group, VNode renderer, Options API, application
configuration, public instance, runtime template compiler or hydration. Use native
factories and native DOM children; the separate legacy `/vue` and `/compiler-sfc`
entries and their optional peer are unchanged.
