# Native SFC coverage ledger

Updated: 2026-10-18. Target: source-compatible Svelte 5 and Vue 3 components compiled by **Crepuscularity**, running on Moonshine's independent DOM/reactive/SSR packages. This ledger records acceptance work, not a promise that current helpers implement either compiler ABI. SvelteKit/Nuxt application APIs need their own ledger.

Earlier broad source checkpoint: **850 generated modules**, using the frozen `8b4013d0`
Crepuscularity compiler snapshot against current Moonshine packages with zero
runtime overlays. Both strict checker lanes, declaration consumers, minified
Chromium, fresh SSR and Bun/Node22 ESM cycle assertions pass. Authored JavaScript
retains the explicit `allowJs` / `checkJs:false` body boundary; public TypeScript
callers remain strict. This compiler snapshot is separate from the Moonshine npm
packages and is not evidence that the published parser WASM ships these features.
This is bounded fixture coverage; the missing variants below remain unfinished.

The SDK 0.4.6 release checkpoint passes **2,100 repository tests / 9,216
assertions** and both **25-project** typecheck lanes. Subsequent compiler-only
work passes **726 native library tests** and the full source application gate. Derived invalidation now
distinguishes value consumers from side observers; the signal-only core is
**4,041 raw bytes**. The dated measurements below retain their original runtime
snapshots.

**Status:** **Proof** = bounded repository test; **Partial** = useful native primitive or template subset, not source compatibility; **Missing** = no end-to-end native source proof. Every missing variant needs an explicit diagnostic until implemented. Unsupported syntax must never silently disappear.

Historical SDK checkpoint: **0.4.10**, commit `b5ed185bcb035a8bdd0decd5190412fb6f4001db`, with **2,147 tests / 9,356 assertions**, both 25-project typecheck lanes and successful tagged CI. All 26 release tarballs were inspected; a fresh four-package consumer passed 17 source-browser phases and six SSR comparisons. This records the GitHub release and local artifacts, not npm publication.

Later compiler acceptance remains **local and unpublished**. Bound select values preserve raw option identity and ordered SSR evaluation; strict option callback typing passes positive and negative tsc/tsgo consumers, including SVG/MathML namespace targets. The integrated shared event pass passes 487 core and 797 native library tests; live Clippy and the CLI build also pass. Four freshly compiled positive/negative packed consumers pass all eight strict checker outcomes; the full CLI test suite is a separate pending gate. These focused checks do not replace the earlier broad application gate or establish full SFC support.

## Current evidence and limits

| Evidence                                                               | What it proves                                                                                                                                                                   | What it does not prove                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/adapter-svelte/test/store.test.ts`                           | Independent writable/readable/derived/get; subscriptions, equality, global queue, manual cleanup, observable unsubscription; differential installed Svelte 5.57.1 shared helpers | `$store` auto-subscription or runes              |
| `packages/adapter-svelte/test/lifecycle.test.ts`                       | Native-owner lifecycle, context/event maps, reference ordering, cleanup and SSR mount suppression                                                                                | Full Svelte scheduler or source event forwarding |
| `packages/adapter-svelte/test/standalone.test.ts`                      | Host-free store/bridge/lifecycle imports; optional native SSR/API/SPA renderer                                                                                                   | Compiling or hydrating Svelte components         |
| `packages/dom/test/{dom,reactive,control,ssr}.test.ts`                 | Native DOM updates, ownership, lists/conditionals, escaping and explicit server factories                                                                                        | Svelte/Vue source semantics                      |
| `examples/native-template/templates/counter.tsx` and its test          | Authored TSX module graph and imported component composition                                                                                                                     | SFC script/module execution                      |
| `packages/cli/test/adopt/templates.test.ts`, `compile-modules.test.ts` | Compiler invocation, output validation, source preservation; several cases use compiler stubs                                                                                    | Full real-compiler SFC acceptance                |
| `packages/adapter-vue/test/reactive.test.ts`                           | Native refs/toRef/unref/isRef, reactive/computed and synchronous watch with multiple cleanups                                                                                    | Public Vue surface replacement or SFC lowering   |

The local Crepus native build now accepts a bounded typed Vue `<script setup>` slice: imported native ref/computed helpers, stable named event handlers and text/attribute bindings. The unchanged setup counter has real CLI, host-free DOM/SSR and strict public prop-type proof. Vue entities, unsupported whitespace, non-finite defaults and unsupported Boolean prop variants still diagnose. Finite typed `withDefaults` now has source proof for cached factories, readonly setup props, optional public callers and failed refresh recovery. Bounded Boolean-bearing finite props now have actual source proof. Plain unscoped Vue CSS now travels through checked CLI assets and the normal Bun stylesheet output; unsupported style variants reject in both setup and scriptless paths. Inline/imported finite props now have local write/delete and coalesced parent-refresh proof; general Vue renderer scheduling and effectful parent getter timing remain gaps. The local Crepus build now emits native Svelte module graphs. `examples/native-template/test/sfc.test.ts` verifies scalar `$state`, `$derived`, whole-object `$props()` and imported child live props in independent DOM instances and fresh SSR requests. A real CLI compile and Chromium interaction check passed; the generated artifacts preserve compiler bytes. Unsupported SFC syntax still requires explicit rejection. Upstream Rust SFC block parsing is not exposed as Vue-compatible JavaScript descriptors. Current WASM `parse_template_json` returns ViewIR, not runnable component modules.

## Svelte runes

Scalar, shallow raw and ordinary deep `$state`, `$state.snapshot`, basic and one-level destructured `$derived`, post-DOM `$effect`, `$props()` cases (whole-object and live destructuring/rename/default/rest/local overrides), and `$props.id()` (`propsId()` in `/runes` and `/ssr`, plus `settled()` and `flushSync()` in `/svelte` and `/ssr`) have bounded source proof. `check:sfc` compiles the props fixture with a fingerprinted immutable compiler snapshot and checks SSR escaping plus Chromium parent updates and read-only rest behavior. Public identifier-keyed instance class fields now have bounded source proof for state/raw/derived initializers, inheritance, callable fields and updates. Private identifier-keyed instance rune initializers now have bounded source proof; constructor first rune assignments remain unsupported. Other variants in each row remain **Missing** as SFC source support. Native signals, stores or effects are prerequisites, never evidence that rune syntax works. References: [$state](https://svelte.dev/docs/svelte/$state), [$derived](https://svelte.dev/docs/svelte/$derived), [$effect](https://svelte.dev/docs/svelte/$effect), [$props](https://svelte.dev/docs/svelte/$props), [$bindable](https://svelte.dev/docs/svelte/$bindable), [$inspect](https://svelte.dev/docs/svelte/$inspect), [$host](https://svelte.dev/docs/svelte/$host).

| Rune / variants to cover                                                     | Required acceptance fixture                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `$state(initial)`, no initializer, primitive assignment/update               | `runes-state`: click updates text and attributes, two instances independent                |
| Deep object/array state, destructuring, mutation methods, ownership warnings | `runes-deep`: nested assignment, splice, alias, borrowed prop mutation                     |
| State class fields, private fields, constructors; opaque built-ins           | `runes-classes`: method writes, spread/enumerability, Date/Map distinction                 |
| `$state.raw`, nested raw/reactive combinations                               | `runes-raw`: reassignment updates, mutation does not acquire deep tracking                 |
| `$state.snapshot`                                                            | `runes-snapshot`: detached plain snapshot, aliases and unsupported values                  |
| `$state.eager`                                                               | `runes-eager`: immediate feedback during pending async update                              |
| Cross-function/cross-module state; `.svelte.js` / `.svelte.ts`               | `runes-modules`: imports, live getters, illegal exported reassignment diagnostic           |
| `$derived(expression)`, `$derived.by(fn)`, dependency switching, untrack     | `runes-derived`: lazy reads, skipped branch dependency, cached result                      |
| Derived reassignment/optimistic override and destructured derived values     | `runes-derived-override`: override followed by dependency invalidation                     |
| `$effect`, teardown, nested effects, dependency reads                        | `runes-effects`: DOM committed before effect; cleanup before rerun/disposal; no SSR effect |
| `$effect.pre`                                                                | `runes-effect-pre`: asserted pre/post DOM phase ordering                                   |
| `$effect.tracking()`                                                         | `runes-effect-tracking`: setup/event/effect/template contexts                              |
| `$effect.pending()`                                                          | `runes-effect-pending`: per-boundary async counts, exclude child boundaries                |
| `$effect.root()`                                                             | `runes-effect-root`: explicit root cleanup, nested effect disposal                         |
| `$props()`: types, defaults, rename, rest, whole object, live updates        | `props-live`: parent changes, fallback semantics, forwarded rest props                     |
| `$props.id()`                                                                | `props-id`: unique per instance; SSR/client label IDs identical                            |
| `$bindable()` and fallback argument                                          | `props-bindable`: child/parent writes, fallback with undefined, invalid binding diagnostic |
| `$inspect(...)`, `.with(...)`, `$inspect.trace(...)`                         | `runes-inspect`: development notifications/trace, production removal, invalid placement    |
| `$host()`                                                                    | `custom-host`: custom-element host identity and non-custom diagnostic                      |

## Svelte file and component contracts

Reference: [.svelte files](https://svelte.dev/docs/svelte/svelte-files), [TypeScript](https://svelte.dev/docs/svelte/typescript), [options](https://svelte.dev/docs/svelte/svelte-options), [context](https://svelte.dev/docs/svelte/context), [migration](https://svelte.dev/docs/svelte/v5-migration-guide).

| Surface / variants                                                                          | Status                                                                                                                  | Required acceptance fixture                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Instance `<script>` JS/TS imports, declarations, functions, exports, type-only syntax       | Partial: tested rune scripts and child imports                                                                          | `sfc-instance`: setup once per instance, module dependencies, source-map errors            |
| `<script module>` and legacy `context="module"`; instance/module visibility                 | Partial: plain scripts, bounded module runes and paused async/generator factories proved; other module variants missing | `sfc-module`: shared module execution once; instance state isolated across requests        |
| Optional script/template/style; block attributes, preprocessors, diagnostics                | Partial block parsing only                                                                                              | `sfc-blocks`: legal combinations, duplicate/unknown blocks, unsupported languages rejected |
| Component imports, dotted/dynamic component references, recursion, async imports            | Partial: static and dynamic identity proof                                                                              | `components-tree`: nested props/events/disposal plus dynamic replacement identity          |
| Props spread, callback props, event forwarding, component bindings/exports                  | Partial: spreads, scalar bindings, named/empty exports and references                                                   | `components-props`: spread precedence, handler this/event contract, bind:this lifecycle    |
| Snippet declaration, parameters/defaults/destructuring, lexical scope, recursion, exports   | Proof: bounded root-level DOM/SSR source snippets                                                                       | `snippets`: children/named snippets, imported snippet, fallback/optional render            |
| `{@render ...}` and programmatic raw snippets                                               | Partial: source render; private raw runtime bridge, source lowering missing                                             | `snippet-render`: reactive arguments, owner cleanup, DOM/SSR output                        |
| Context set/get/has/getAll/createContext; initialization restrictions                       | Proof: bounded DOM/SSR source context fixture                                                                           | `context-tree`: nearest provider, sibling isolation, reactive values and SSR isolation     |
| `createEventDispatcher`, legacy component events, cancellation                              | Partial: native explicit listener-map dispatch; source forwarding missing                                               | `component-events`: callback replacement plus legacy dispatch/forwarding acceptance        |
| `<svelte:options>` runes/immutable/accessors/preserveWhitespace/namespace/css/customElement | Missing                                                                                                                 | `options`: each valid option and invalid combination; legacy-only flags distinguished      |
| SFC scoped CSS, `:global`, keyframes, unused selector diagnostics                           | Partial: global and bounded local scope proved; broader selectors, keyframes and diagnostics missing                    | `css-scope`: sibling isolation, nested component matching, SSR/client hash agreement       |
| CSS custom props on components, `--var`, nested/global styles, preprocessors                | Missing                                                                                                                 | `css-components`: updates, inheritance, shadow DOM, emitted CSS asset lifetime             |

## Svelte markup and directives

References: [template index](https://svelte.dev/docs/svelte/overview), [bindings](https://svelte.dev/docs/svelte/bind), [attachments](https://svelte.dev/docs/svelte/@attach), [async expressions](https://svelte.dev/docs/svelte/await-expressions). Each grouped variant below needs a separate assertion, including cleanup when its branch disappears.

| Surface / variants                                                                                                                  | Status                                                                                                      | Required acceptance fixture                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Text/interpolation, comments, attributes/spreads/shorthand, boolean/enumerated/ARIA, property vs attribute, SVG/MathML              | Partial template subset + native DOM                                                                        | `markup`: exact text/attribute/node namespace, escaping and HTML parser contexts               |
| Event properties `onclick`, capture, spreads, forwarding and handlers with closures                                                 | Partial: source intrinsic/callback handler factories                                                        | `events`: actual typing/click/submit, preventDefault/propagation, listener disposal            |
| `{#if}` / else-if / else                                                                                                            | Partial template/native controls                                                                            | `if`: source expression updates, retained ownership, branch cleanup                            |
| `{#each}` keyed/unkeyed, index, destructuring, iterable, else                                                                       | Proof: identifier/static nested object items, index, keys, iterables and else; defaults/rest/arrays missing | `each`: duplicate identity, reorder/edit focus/caret, append/remove, empty fallback            |
| `{#key}`                                                                                                                            | Proof: bounded DOM/SSR source keyed fixture                                                                 | `key`: same value retains; changed value resets/disposes subtree                               |
| `{#await}` pending/then/catch, shorthand, non-promise, races                                                                        | Proof: bounded source patterns, nested blocks, races, disposal, SSR and typed alias queries                 | `await-block`: out-of-order resolution, rejection, disposal and SSR branch                     |
| Await in script/derived/template; parallelism, synchronization and boundary pending/error                                           | Missing                                                                                                     | `async-expressions`: controlled promises, stale results, sibling consistency, SSR timing       |
| `{@const}`, `{@debug}`, current `{let ...}` / `{const ...}` declarations                                                            | Partial: authored `{@const}` is implemented and tested; remaining declaration/debug variants are missing    | `template-declarations`: lexical scope, dependencies, placement and dev/prod diagnostics       |
| `{@html}`                                                                                                                           | Proof: bounded HTML DOM/SSR source fixture; SVG rejected                                                    | `raw-html`: intentional trust boundary, inert scripts, active inline handlers, no sanitization |
| `class`, class arrays/objects, `class:`, `style:`, priority/override                                                                | Opt-in native class expressions; style subset only                                                          | `classes-style`: reactive precedence/removal, custom props, `!important` source semantics      |
| Input/textarea/select `bind:value`, number/range coercion, checkbox/radio `bind:checked` / group, files, indeterminate              | Partial: native value/checkbox/select bindings                                                              | `forms`: user→state→DOM, reset/defaults, select option changes, multiple values                |
| Function bindings, contenteditable text/HTML, bind:this                                                                             | Partial: component bind:this only                                                                           | `bindings-functions`: getter/setter conversion, null/read-only behavior, destruction           |
| Media bindings: currentTime/duration/paused/buffered/seekable/played/volume/muted/playbackRate/seeking/ended/readyState/video sizes | Missing                                                                                                     | `bindings-media`: real media events and read-only updates                                      |
| Dimensions/ResizeObserver, details.open, window/document bindings                                                                   | Missing                                                                                                     | `bindings-platform`: resize/disconnect, scroll/online/visibility ownership                     |
| `use:` action params/update/destroy                                                                                                 | Partial: bounded source DOM/SSR proof on frozen directive candidate                                         | `actions`: correct attached node and parameter changes; SSR skip                               |
| `{@attach}` factory, reactive params, returned cleanup, spread attachments                                                          | Partial: bounded source factories/replacement/cleanup; spreads missing                                      | `attachments`: attachment-key forwarding, replacement/disposal, SSR skip                       |
| `transition:`, `in:`, `out:`, local/global modifiers, transition events, custom CSS/tick, deferred removal                          | Missing                                                                                                     | `transitions`: reversal, nested outros, cancellation and cleanup after completion              |
| `animate:` / FLIP, custom animation parameters                                                                                      | Missing                                                                                                     | `animate-list`: keyed reorder geometry, reduced-motion policy, cancellation                    |
| `<svelte:boundary>` failed/pending snippets, reset, nested failures                                                                 | Missing                                                                                                     | `boundary`: render/effect/async failures, retry and ownership                                  |
| `<svelte:window>`, document/body event targets                                                                                      | Missing                                                                                                     | `special-targets`: no leaked global listeners                                                  |
| `<svelte:head>`                                                                                                                     | Implemented in local source: owned DOM head nodes, reactive titles, synchronous SSR collection              | Seven compiled browser phases, 14 SSR edges; unpublished compiler/runtime integration          |
| `<svelte:element>` dynamic tag/namespace                                                                                            | Missing                                                                                                     | `dynamic-element`: tag switch, attributes/events, namespace and child legality                 |

## Svelte runtime, delivery and migration

References: [runtime API](https://svelte.dev/docs/svelte/svelte), [server API](https://svelte.dev/docs/svelte/svelte-server), [custom elements](https://svelte.dev/docs/svelte/custom-elements), [reactivity](https://svelte.dev/docs/svelte/svelte-reactivity), [migration](https://svelte.dev/docs/svelte/v5-migration-guide).

| Surface                                                                                              | Status                                                                                                                                                                                                                                                                                                                                                     | Required acceptance fixture                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| writable/readable/derived/get                                                                        | Proof for bounded store/source protocol                                                                                                                                                                                                                                                                                                                    | Store reads/replacement and direct/compound/logical/member writes; destructuring/delete/iteration targets reject |
| Other store exports: readonly/toStore/fromStore                                                      | Proof for native store/rune interop                                                                                                                                                                                                                                                                                                                        | `store-reference`: live `toStore`/`fromStore`/`readonly` conversion, read-only surface, microtask demand, SSR    |
| onMount/onDestroy/tick                                                                               | Proof for native-owner subset                                                                                                                                                                                                                                                                                                                              | Existing lifecycle tests and source component-reference fixture; full flush parity remains missing               |
| beforeUpdate/afterUpdate legacy; flushSync/settled/untrack/getAbortSignal/fork                       | Partial: native `flushSync`, `settled`, `untrack`, and `getAbortSignal` proved; `fork`/legacy hooks missing                                                                                                                                                                                                                                                | `scheduler`: DOM ordering, async settle/abort, speculative commit/discard                                        |
| mount/unmount, component exports, context/options/events; SSR render/head/body/async rendering       | Native factory substrate only                                                                                                                                                                                                                                                                                                                              | `component-api`: multiple roots, teardown/outros; request-isolated SSR/head                                      |
| Hydration/recovery, stable IDs, pre-hydration input edits/focus/selection, event replay              | Missing; fresh mounting is not hydration                                                                                                                                                                                                                                                                                                                   | `hydrate`: preserve exact server nodes and user state; mismatches explicit                                       |
| Hydratable data and serialization boundaries                                                         | Missing                                                                                                                                                                                                                                                                                                                                                    | `hydrate-data`: async data reuse, no duplicate fetch, safe serialization                                         |
| Custom elements: props/attributes/reflection, shadow/style, slots, extend hooks, connect/disconnect  | Missing                                                                                                                                                                                                                                                                                                                                                    | `custom-element`: actual browser lifecycle, reflected values, no double cleanup                                  |
| Reactive Date/Map/Set/URL/URLSearchParams, MediaQuery/createSubscriber; window reactivity            | Proof: native `SvelteDate`, `SvelteMap`, `SvelteSet`, `SvelteURL`, `SvelteURLSearchParams`, `MediaQuery`, `ReactiveValue`, and `createSubscriber` in `/reactivity` plus `/reactivity/window` (`innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, `screenLeft`, `screenTop`, `scrollX`, `scrollY`, `online`, `devicePixelRatio`) with Crepus routing | `reactivity-builtins`: methods/iteration/subscription cleanup and SSR fallbacks                                  |
| motion springs/tweens, easing, transition/animation helpers, attachments/events utilities            | Missing compatibility                                                                                                                                                                                                                                                                                                                                      | `motion`: time-controlled behavior, finish/cancel promises, listener ownership                                   |
| Legacy let/$:, export let, $$props/$$restProps, auto stores                                          | Missing                                                                                                                                                                                                                                                                                                                                                    | `legacy-state`: assignment lowering, ordering, defaults, reactive rest forwarding                                |
| Legacy on: modifiers/forwarding, slots/let:/$$slots/svelte:fragment                                  | Missing                                                                                                                                                                                                                                                                                                                                                    | `legacy-composition`: modifier ordering, scoped/default/named slots                                              |
| Legacy svelte:component/self, class component $set/$on/$destroy/accessors                            | Missing                                                                                                                                                                                                                                                                                                                                                    | `legacy-imperative`: dynamic/recursive children, updates and destruction                                         |
| Compiler API compile/compileModule/parse/preprocess/migrate, client/server/development/async options | Missing compatibility                                                                                                                                                                                                                                                                                                                                      | `compiler-api`: real output/AST/maps/diagnostics or explicit unsupported error, no fabricated shapes             |
| Compiler errors/warnings, accessibility checks, TS diagnostics, source maps, HMR                     | Missing parity                                                                                                                                                                                                                                                                                                                                             | `diagnostics`: filename/range/code, no partial artifact publication on failure                                   |

## Vue SFC and component contracts

References: [SFC spec](https://vuejs.org/api/sfc-spec.html), [script setup](https://vuejs.org/api/sfc-script-setup.html), [setup](https://vuejs.org/api/composition-api-setup.html), [compiler source](https://github.com/vuejs/core/tree/main/packages/compiler-sfc/src), [Teleport](https://vuejs.org/guide/built-ins/teleport.html). Native reactive tests do not establish Vue component/renderer compatibility.

| Surface / variants                                                                                                           | Status                                                                                                                                                                                                                                                                                                                                                                                                              | Required acceptance fixture                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SFC template/script/script-setup/style/custom blocks, src/lang attributes, preprocessors                                     | Partial upstream block parser; no Vue JS descriptor ABI                                                                                                                                                                                                                                                                                                                                                             | `vue-blocks`: spans/maps, duplicates, external blocks, unsupported languages                          |
| `<script setup>` per-instance execution; normal script module execution and combined scripts                                 | Proof: bounded typed setup counter; combined/module scripts missing                                                                                                                                                                                                                                                                                                                                                 | `vue-setup`: two instances + overlapping SSR requests; module executes once                           |
| Imports/top-level bindings, ref template unwrap, reactive props destructure, TS generics                                     | Partial: native imports/top-level unwrap; destructure/generics missing                                                                                                                                                                                                                                                                                                                                              | `vue-bindings`: live prop defaults/rest, imported types and component imports                         |
| defineProps/withDefaults/defineEmits/defineExpose/defineOptions/defineSlots/defineModel macros                               | Partial: typed live defineProps, finite withDefaults, tuple-map defineEmits, top-level defineExpose and top-level const defineModel (with `[model, modifiers]`, defaults, required, boolean casts and `get`/`set`) proved; other macro variants missing                                                                                                                                                             | `vue-macros`: runtime/type declarations, validation, model modifiers and defaults                     |
| Top-level await, async setup, Suspense/error boundaries                                                                      | Missing                                                                                                                                                                                                                                                                                                                                                                                                             | `vue-async`: race, error, pending UI and server completion                                            |
| Options API data/methods/computed/watch/lifecycle/mixins/extends                                                             | Missing independent component contract                                                                                                                                                                                                                                                                                                                                                                              | `vue-options`: this binding, instance isolation and cleanup                                           |
| ref/reactive/computed/watch                                                                                                  | Partial: native helpers, DOM/SSR ownership, reactive object watch sources, `deep` (`boolean`/`number`), `once`, `onWatcherCleanup`, and `WatchHandle` (`stop`/`pause`/`resume`); pre/post flush scheduling missing                                                                                                                                                                                                  | `vue-watch`: public wiring, pre/post scheduling and component flush variants                          |
| shallow/readonly/raw/toRef(s)/proxyRefs/useTemplateRef/useModel/useId/effectScope/watchEffect and cleanup APIs               | Partial: native shallowRef, triggerRef, customRef, toValue, toRef(s), proxyRefs, shallowReactive, readonly, shallowReadonly, isReactive/isReadonly/isShallow/isProxy, toRaw, markRaw, useTemplateRef, useModel/createModel (`ModelRef`, `DefineModelOptions`), useId, effectScope/getCurrentScope/onScopeDispose, watchSyncEffect, onWatcherCleanup, and WatchHandle; scheduled watchEffect/watchPostEffect missing | `vue-reactivity`: proxy identity, scopes, scheduled cleanup and nested lifetimes                      |
| Props/emits/attrs/listeners/fallthrough; component v-model, expose, template refs                                            | Partial: typed live props, regular/once component listeners, component v-model, defineExpose and static intrinsic/component/form-model template refs proved; fallthrough and dynamic/function/v-for refs missing                                                                                                                                                                                                    | `vue-component-props`: updates, multiple roots, cancellation/validation and refs                      |
| Default/named/scoped/dynamic slots, fallback, provide/inject, useId                                                          | Partial: static default slots, source provide/inject, and deterministic tree-scoped useId proved; named/scoped/dynamic slots missing                                                                                                                                                                                                                                                                                | `vue-composition`: reactive slot props and nearest provider with SSR isolation                        |
| v-if/else/show/for/key, v-bind/on/model/text/html/once/memo/cloak/pre; dynamic args/modifiers                                | Partial template subset only                                                                                                                                                                                                                                                                                                                                                                                        | `vue-directives`: actual DOM updates/forms, list identity, event modifier order                       |
| Dynamic/recursive/async components; built-ins component/slot/template/Transition/TransitionGroup/KeepAlive/Teleport/Suspense | Missing native component coverage                                                                                                                                                                                                                                                                                                                                                                                   | `vue-builtins`: cache activation, teleport cleanup/order, suspense/transition ownership               |
| Scoped CSS/deep/slotted/global, CSS modules, v-bind CSS, asset URL transforms                                                | Missing native SFC pipeline                                                                                                                                                                                                                                                                                                                                                                                         | `vue-css`: compiled selectors, vars, asset paths, SSR/client scope identity                           |
| createApp/createSSRApp, plugins/config/global registration, lifecycle and error handling                                     | Partial: native createApp mount/unmount with exposed root instance return, onBeforeMount/onMounted/onBeforeUnmount/onUnmounted, and ancestor onErrorCaptured/withComponentErrorHandler proved; plugins/config/global registration/createSSRApp missing                                                                                                                                                              | `vue-app`: mount/unmount, nested errors, isolated app context                                         |
| SSR/hydration, async setup/serverPrefetch, mismatch handling; custom elements                                                | Missing native parity                                                                                                                                                                                                                                                                                                                                                                                               | `vue-delivery`: exact node reuse, preserved form state, head/styles and request isolation             |
| parse/compileScript/compileTemplate Vue compiler result shapes and options                                                   | Actual Vue host reexports at audit checkpoint, no native equivalent                                                                                                                                                                                                                                                                                                                                                 | `vue-compiler-api`: real descriptors/AST/bindings/maps/code/errors or explicit unsupported diagnostic |

## Acceptance rule and compiler handoff

Every fixture above must go through the **real Crepus binary**, publish its complete inventoried module/CSS/asset graph, then exercise emitted native DOM in Chromium and native SSR without installing Svelte/Vue. Compare behavior with a pinned official compiler/runtime reference where available. Record version and target options, exact diagnostics and expected HTML/state/lifecycle traces. Stub compiler tests only validate transport.

For hydration fixtures, save server node identities, type before initialization, retain focus/caret, then prove handlers/state bind without replacement. For asynchronous fixtures control promise completion order. For ownership fixtures count setup, rerun, cancellation and cleanup, including failed setup and SSR requests. All unsupported constructs must fail before overwriting existing outputs.

Crepus must own SFC parsing, rune/macro binding resolution, lexical scope and write lowering, script/module separation, component/snippet/slot imports, diagnostics and source maps. Moonshine owns the minimal runtime contracts: state/owners, DOM commit phases, event/forms, lists/branches, async boundaries, style/assets, SSR and genuine node claiming. Add runtime primitives when emitted acceptance fixtures require them; do not substitute a host reexport or a fabricated compiler AST.

## Native runtime additions

`packages/dom/test/component.test.ts` verifies attached component scopes, live props, setup isolation, failure cleanup and inherited contexts through detached control roots. Svelte lifecycle tests exercise contexts and explicit per-instance event maps through DOM/SSR factories. The generic native context getter returns a snapshot, while the Svelte adapter now returns its live per-instance map, verified against installed Svelte client/server behavior. `packages/adapter-svelte/test/lifecycle.test.ts` verifies `createEventDispatcher` initialization guards, listener-array snapshots, details/cancellation, no global or callback-prop dispatch, and no-op dispatch after disposal. Delivery uses only the explicit `componentEvents` listener map, including native SSR factory setup; this does not prove Svelte server-dispatch behavior or source `on:` forwarding. Event listeners still have no legacy exported-instance `this`; these helpers do not establish full compiled event/slot parity.

`packages/adapter-svelte/test/state.test.ts` verifies bounded deep write-isolated state and an installed-Svelte differential. Unusual descriptors reject; lazy raw capture matches the pinned reference. Own inherited-name enumeration intentionally uses coherent JavaScript semantics rather than the reference edge behavior. Snapshot tests cover platform clones, shallow Map/Set entries, toJSON, sparse arrays, aliases and safe cycle handling; uncloneable values remain shared as in Svelte production. `test/effect.test.ts` verifies microtask post-DOM scheduling, dynamic dependency switching, nested cleanup, first-run self-writes, cancellation and recovery. The deep-state source fixture exercises nested writes, snapshot isolation and post-DOM effect cleanup; other variants remain pending. `$effect.pre` has bounded DOM/SSR source acceptance through the separate `/pre` scheduler; other pre-effect variants remain pending.

`test/derived.test.ts` verifies lazy writable derived cells, equal-value override resets, dynamic dependencies, error recovery and coherent nested diamonds, including an installed-Svelte comparison. Framework tests now verify layout-before-page contexts and deferred SSR child ownership across cached factories and repeated requests; generated SPA roots enter a native component frame. `bun run check:sfc --compiler /path/to/crepus` performs isolated real source compilation, host-free SSR and Chromium counter acceptance.

`check:sfc` also compiles `deep-state.svelte`: Chromium checks nested mutation, array growth, derived sums, original/snapshot isolation and effect teardown after DOM commits; SSR asserts that the effect factory itself never executes. `test/prop.test.ts` compares writable local/bindable prop cells and fallback caching with installed Svelte; source `$bindable` declaration coverage remains bounded; component reference proof is recorded below. Disposed-owner tests verify context-carrier release without breaking detached roots.

Native component-instance tests cover opaque descriptor-preserving exports, fixed-cell and captured-tuple references, replacement identity, canceled setup, SSR suppression and deferred null cleanup. Svelte mount hooks and rune effects share the post-DOM queue and publish references first; Chromium checks exported method calls and this ordering in the same browser as the compiled fixtures. The native dynamic reference ABI has an optional typed parts tuple; the bounded source reference fixture is recorded below. Native snippet tests preserve JavaScript lexical values while child context/cleanup belongs to the consumer, using closures and SSR `defer` without a new helper. The evidence is `packages/dom/test/snippet.test.ts`; the authored `snippets{,-card,-item,-omitted}.svelte` fixtures additionally verify root-level declarations and `{@render}` in `scripts/check-native-sfc.ts`. Nested declarations, default/destructured/rest parameters, exports and programmatic raw snippets remain unverified. The separate `event-props{,-child,-unused}.svelte` fixtures in `scripts/check-native-sfc.ts` verify intrinsic and component callback factories, live closures, receiver differences, remount/disposal and SSR intrinsic-handler erasure; capture, event spreads and legacy dispatch forwarding remain unverified.

`packages/dom/test/binding.test.ts` verifies the optional owned `/binding` value and checkbox helpers: user-handler ordering, parent updates, numeric coercion, default/reset synchronization, cancellation, external/reassociated connected forms and disposal. `bun run check:bindings` copies only core/DOM/Svelte adapter packages and independently checks native reset cancellation, text/numeric/checkbox behavior and disposal in Chromium (requires Python Playwright and Chromium, as does `check:sfc`). Input types stay fixed; detached forms and other control bindings remain unsupported. Source text/number/textarea and checkbox coverage is recorded below; hydration remains pending.

The optional `/runes` `runeTracking()` helper reports active dependency collection and matches the installed Svelte reference across setup, events, render accessors, derived values, effects and `untrack`; nested/error restoration is tested. `scripts/check-native-sfc.ts` and `examples/native-template/templates/runes/keyed.svelte` and `keyed-child.svelte` also prove bounded source `{#key}` identity retention, NaN/signed-zero/object/null/undefined changes and subtree cleanup in Chromium and SSR. The compiled tracking fixture now proves `$effect.tracking()` across browser setup/events/render/derived/effect/untrack, with SSR false and effect suppression. Native Vue `/context` tests prove parent-only provide/inject, nearest shadowing, explicit undefined, lazy defaults, reactive ref identity and isolated DOM/SSR scopes; Vue app-level providers/public instances and SFC integration remain missing.

`check:sfc` now also compiles `dynamic.svelte` and its three children through a copied real compiler: 120 generated modules across the current complete acceptance graph. Chromium checks direct rune, member and prop-selected components, live props, retained DOM identity/local state for unchanged selection, replacement/null/remount and exactly-once cleanup. SSR verifies fresh request state and disposal; writes after disposal cannot recreate children. Recursive/async imports and other component variants remain missing.

Native select binding tests cover single/multiple controls, typed option identity through explicit `setOptionValue`, live options and model retention, defaults/reset/cancellation and disposal. Plain option factories keep string values. `packages/dom/test/ssr.test.ts` verifies opt-in typed selection metadata without stringifying identity; source binding lowering, emission of that metadata and hydration remain compiler work. Multiple undefined state adopts the selected-value array rather than the pinned Svelte 5.46.4/5.57.1 scalar initialization quirk. Control-flow regressions now verify that disposal during mapper/source/branch creation, old branch cleanup, removed-row cleanup and retained item/index updates cannot leak or publish disposed child work.

`check:sfc` also compiles keyed blocks: signed-zero, repeated NaN, stable/mutated object keys retain nodes and local state; fresh object/null/undefined and nested conditional changes replace subtrees and dispose them exactly once. SSR verifies fresh keyed instances and cleanup per request. `keyed.svelte`, its child and `tracking.svelte` extend the full inventoried graph to 46 modules.

Native Vue `/lifecycle` tests and `bun run check:components` verify child-first committed mounts with published native references, parent-first before-unmount while DOM/watchers remain active, and child-first unmounted callbacks after outer DOM removal and watcher teardown. Native owner phases drain errors and handle reentrant disposal; component-ready callbacks skip failed/cancelled setup. Outside-commit tasks wait a microtask. The browser gate copies core/DOM/Vue packages and the optional Svelte class helper, with no host runtime. SSR suppresses Vue lifecycle hooks even with browser globals present. Vue SFC lifecycle lowering, app/public-instance/error-handler behavior and native reference cleanup versus Vue template-ref timing remain separate requirements.

Disposed native owners now reject newly attached computations/components, and Vue watches reject a disposed captured owner rather than leaking an implicit detached root. Explicit detached `createRoot` and ownerless manually stopped watches remain supported. Source context fixtures now verify plain TypeScript helper rewriting and live-map identity/mutations, including isolated branch overrides in Chromium and SSR.

The current real SFC gate inventories 120 generated modules, including source context helpers in plain TypeScript, typed context factories, nearest providers, object/symbol keys, explicit undefined, separate roots and fresh SSR requests. The live map is the same object across calls and observes setContext writes; map writes affect descendants without changing sibling/ancestor maps. Native radio/checkbox group helpers now have permanent host-free Chromium coverage for typed values, DOM order, duplicates, separate tokens, row/token cleanup, reset and cancellation. Compiler token allocation, group SSR/hydration and source bind:group remain pending. The optional Svelte `/binding` bridge compares raw/proxy origins for single-select and radio values without replacing the payload; unit, isolated-package and Chromium checks cover edited proxy identity and unchanged raw objects. Multiple-select and checkbox groups retain their existing array membership semantics.

The source checkbox fixture verifies scalar/member `bind:checked`, independent instances, parent writes, undefined default adoption, reset/cancellation, disposal and fresh SSR. Dynamic checkbox types and spread attributes reject explicitly. Plain onchange handlers before and after the binding both observe updated bound state, matching the pinned Svelte 5.57.1 compiler/runtime comparison. This remains a bounded checkbox subset, not complete form or component compatibility.

The optional rune `createRuneRoot` reuses detached native ownership: setup is synchronous/untracked, child effects remain post-DOM, caller disposal leaves the manual root alive, and its returned disposer drains child and callback cleanup once. Unit and pinned-Svelte differential tests cover nesting, cancellation before the first tick, setup failure and SSR callback suppression; isolated-package checks prove no host dependency. Source `$effect.root` now has a real DOM/SSR fixture, including complete callback-factory argument erasure on SSR.

Svelte `/binding` value helpers normalize empty numeric writes to `null`, confirmed against installed Svelte, while generic native numeric bindings retain `undefined`. Tests distinguish these values explicitly and cover text emptiness, numeric formatting, default adoption and number reset. Range reset parity now has permanent Chromium proof: empty defaults retain a null model while the browser clamps its display; out-of-range defaults preserve the raw numeric model. Native reset metadata lets the adapter preserve NaN for invalid nonempty numeric defaults while subsequent genuinely empty input writes null. The real fixed-range source gate now verifies these reset cases and malformed numeric defaults too.

The real source `bind:value` fixture now covers scalar/member text, number and textarea controls across three independent instances. Plain oninput handlers in either attribute order see updated state; numeric formatting survives equal-value writes, empty numeric state is explicitly null rather than undefined, programmatic undefined remains distinct, and default adoption, reset/cancellation, disposal and escaped SSR are checked. File inputs, dynamic types and spreads reject explicitly. All prior 64 modules remain in the current 120-module inventoried acceptance graph.

The fixed-range SFC fixture extends the complete graph to 76 modules. Chromium verifies raw default 5 with minimum 10 produces model 5 and displayed 10, an empty default produces a strict null model and displayed 50, invalid number defaults produce NaN until real empty input writes null, and reset cancellation/disposal preserve state. SSR checks that bound values override all three defaults while each default expression still evaluates exactly once.

Select source lowering now has an opt-in SSR selection contract: `/ssr` exports `selectBinding` and `optionBinding` symbols carrying boxed literal raw values. Tests verify object/primitive identity, function values without invocation, escaping, null/undefined, duplicates, signed zero, single NaN versus multiple membership, and unmatched values against installed Svelte 5.57.1. Ordinary native factories intentionally retain HTML string matching. DOM metadata and Svelte proxy comparison are also ready, but source select lowering still requires an emitted fixture and browser/SSR acceptance; the compiler must keep rejecting these bindings until that proof passes. No hydration identity transport is provided.

Native component references now track only explicit path parts after setup, preserving fixed-cell callers. Captured tuples let retained rows move references safely; target identity guards handle aliased slots, replacements and teardown without clearing another instance. Unit tests cover deferred parts, getter/setter tracking isolation, rollback, disposal during publication, a feedback-wave runaway limit, and large independent cohorts. The existing TypeScript fixture now checks tuple argument types and required metadata. Host-free Chromium verifies keyed reorder, retained DOM/local state, removal and disposal. These native ABI checks are supplemented by the bounded source component export/reference fixture below; loop-dependent path extraction remains separate compiler acceptance work.

References can now opt into `cleanup: "commit"`, matching the pinned Svelte 5.57.1 teardown boundary: child and parent destroy callbacks can read the instance, while the outer disposer returns after clearing it. Default native references retain microtask cleanup. Fixed/path tests cover identity guards, canceled publication and throwing peers. Snippet ABI tests additionally prove that getter arguments update retained DOM/local state, while changing the snippet function owns replacement and cleanup; SSR invokes under the consumer context and escapes request-local arguments. The source snippet fixtures now verify live arguments, retained focus/local state, replacement setup before old cleanup, optional clearing, omitted typed/untyped arguments and isolated SSR requests against Svelte 5.57.1. Component reference path extraction still needs separate source acceptance.

The real manual-root source fixture extends the graph to 82 modules and checks synchronous untracked setup, deferred post-DOM effects, independent nested lifetimes, early cancellation and manual disposal. Its callback factory touches document before returning a function, so SSR must erase argument evaluation as well as the callback body. The teardown-history fixture below now checks the Svelte 5.57.1 first-previous-value policy for compiler-created state, derived values and props. External arbitrary kernel writers remain outside that history contract.

Independent manual-root update order is intentionally not matched to incidental host subscriber storage order. Chromium comparisons on Svelte 5.46.4 and 5.57.1 show that removing only an unrelated DOM subscriber can reverse two independent roots, because the host swaps the final subscriber into the removed slot. Native FIFO remains stable; acceptance checks each root's effects, cleanup, lifetime and DOM commit timing without claiming an undocumented total order.

The real teardown-history fixture extends the graph to 88 modules. Chromium verifies multiple writes retain the first previous scalar/derived values, cleanup-only dependencies use the current global interval, manual stop cancels pending work, and pending component disposal sees historical derived values even after their native owner is disposed. DOM remains live during updates and SSR destroy reads live request-local values. Installed Svelte 5.57.1 differentials cover lazy deep-property sources, cleanup writes and extra reruns, derived caches/overrides and reactive prop fallbacks. Key enumeration intentionally follows current proxy structure as in the reference; this is source-value history, not a whole-object rollback. No history policy was added to the default kernel.

The optional `createRawState` compiler target preserves shallow identity and uses the same teardown history as deep state, including `===` replacement equality. Runtime tests cover plain nested mutations, function values, repeated replacements, cleanup writes with live DOM, isolated SSR ownership and a pinned Svelte equality differential. Compiler-generated raw cells must use this helper on the client; server lowering can remain a plain cell because server state is not proxied or effect-tracked.

Pinned Svelte 5.57.1 SSR bindings require more than forwarding a child setter: an initially undefined parent takes the child's final value, including text rendered before that child. Parent setup executes once, while the buffered template repeats until values settle. Discarded attempts drop their destroy callbacks; only the accepted attempt runs them. The optional server runtime now implements this contract through `createServerProp`, `afterRender` and `settle`: tests cover defined/undefined parents, final child assignments, deferred serialization, nested attempts, discarded public hooks with internal cleanup, failures, request isolation and transactional select bookkeeping. Source `$bindable` SSR remains unsupported until Crepus lowers setup/template separation and bound setters through these helpers. Async SSR and hydration are separate requirements.

The real raw-state and snapshot fixtures extend the complete acceptance graph to 100 modules. Raw state preserves object identity and ordinary untracked nested writes, while replacements update derived output and retain first-previous cleanup values across multiple writes and pending disposal. Two browser instances and isolated SSR requests remain independent. The snapshot fixture verifies browser write isolation and detached copies, versus the pinned Svelte 5.57.1 SSR distinction: direct variable initializers preserve identity, while nested expression snapshots still clone. Both argument expressions evaluate exactly once. The same authored fixtures pass against the official compiler/runtime in Chromium and SSR.

State equality tests now match the pinned source contract: initialized signed-zero writes preserve the previous value, repeated NaN writes notify, and cleanup reads cannot observe a phantom ignored assignment. Binding identity comparison intentionally remains Object.is. Single-select tests and permanent Chromium checks now cover typed undefined initialization, retained duplicate selection and both unchanged/changed duplicate resets; native rejected/transformed setter writes still reconcile the DOM to the actual model. These form runtime checks do not establish source select binding or function-binding parity.

The optional Svelte `/class` `classValue` helper now matches the installed 5.57.1 normalizer for nested arrays, truthy object/inherited keys, top-level primitive conversion, getter tracking and empty-attribute omission. Tests cover Chromium class updates, retained nodes, disposal, SSR escaping and isolated host-free imports; source class directives and array/object expression lowering remain separate compiler acceptance work. No class dependency or generic native attribute behavior was changed.

Native value bindings now also accept fixed date, datetime-local, month, week, time and color inputs. Permanent Chromium checks cover browser sanitization, undefined/default adoption, empty user input, invalid model strings, raw invalid reset defaults, cancellation and disposal. Exact temporary Chromium traces match the pinned Svelte helper for those cases. Numeric coercion remains limited to number/range. Source acceptance still covers the previously recorded text/number/range/textarea slice; partial date-widget keyboard entry and new source-type lowering have not been verified.

The source component-reference fixture originally extended the complete graph to 110 modules. Chromium verifies named const/function exports, an empty exported instance, scalar/member bind:this publication before mount hooks/effects, independent component state, retained nodes on live prop updates, removal/remount and synchronous final clearing after teardown. Its current 120-module gate also verifies exported class construction/replacement, an accessor object writing reactive child state, plain-variable aliases with local/external writes, descriptor preservation and methods called with the exported instance as receiver. The same authored export checks pass against installed Svelte 5.57.1 in Chromium. SSR preserves both named and empty child markup without reading or publishing reference callbacks, with isolated request cleanup. This does not establish all instance export forms: a reassigned rune-state alias still hits an incorrect module-export diagnostic in Crepus. Function bindings, loop-dependent paths, imperative mount/hydration APIs and transition/outro timing remain separate requirements.

The optional native `/custom-element` helper now preserves literal object/function values for registered property setters without invoking getters or tracking incidental setter reads. Tests and an installed-Svelte differential cover own/inherited setters, data/getter attribute fallback, unknown-element object properties, upgrade shadowing, errors and literal HTML/prototype boundaries. A 14-case Chromium comparison also passes. Ordinary `h()` and SSR serialization are unchanged; authored custom-element prop lowering, event casing, registration options and hydration still need compiler/end-to-end acceptance.

Native value-element regressions now cover explicit empty option values, output values applied after child insertion, and progress/meter/list-item initial nullish caches versus later IDL updates. A compiled Svelte 5.57 Chromium comparison matches the audited static and live-update cases. SVG namesakes retain ordinary attribute/child semantics. Shared HTML attribute handling now maps boolean translate to yes/no and omits falsey boolean values (except the present empty string), including select/option SSR flags. Permanent Chromium checks compare native DOM and parsed SSR for translation, hidden/disabled/selected, ARIA and enumerated values.

The real event/callback-prop fixture extends the complete graph to 120 modules. Intrinsic handler factories remain lazy, component callback props share cached functions across repeated reads, nonreactive unused props evaluate once per conditional mount, and events preserve the observed this/currentTarget contract. Browser checks cover parent invalidation, remounts, separate instances and disposal. SSR erases intrinsic event factories while evaluating component callback factories once per request. The same exact authored fixtures pass against installed Svelte 5.57.1 in Chromium and SSR; capture/spreads/legacy dispatch and other event variants remain separate work.

Native Solid context APIs now have independent DOM/SSR owner scopes, default and undefined fallback, retained Show/For descendants, reactive accessor payloads and sibling/request cleanup tests. A lightweight SSR ownership wrapper preserves direct deferred children through serialization without bundling the serializer into browser contexts; serializer tests cover text, arrays, selection, namespaces and error restoration. Permanent Chromium checks exercise lazy providers, retained branches and teardown. Vue synchronous watchers now retain all registered cleanup callbacks, drain them in order on rerun/stop and preserve the first error while attempting peers; reentrant stops cannot rerun a stopped callback. These APIs do not establish Solid compiled-output compatibility or Vue SFC script lowering.

Native Solid `children(fn)` now reuses the provider's existing two-stage memoization, with nested-array flattening, zero-argument accessor resolution, retained parameterized functions and `toArray()`. Installed Solid 1.9.14 comparisons cover cached identity and nullish/falsey values; native tests cover retained nodes/focus, cleanup and failure recovery. Vue `/reactive` now exports native `isRef`, `unref` and `toRef`: existing refs retain identity, getter refs are readonly and uncached, and property aliases preserve undefined-only defaults. Installed Vue 3.5.13 comparisons and permanent Chromium checks cover reactive alias/getter DOM updates, retained nodes and watcher disposal. Plain aliases do not make an object reactive, and host Vue refs are not recognized.

Native Solid source helpers now accept keyed `Show` and `Match` through `/solid`, with raw values supplied to keyed callbacks and cleanup before replacement setup. Installed Solid 1.9.14 differentials cover nonkeyed retention versus keyed identity changes, mixed Switch priority, context, failures and SSR. Permanent Chromium checks cover replaced DOM nodes, cleanup ordering, lazy priority branches, fallback and disposal. This does not implement Solid compiler instructions or hydration; `/control` retains its native accessor contract.

Optional native raw-markup helpers now reuse the existing insertion/SSR contracts: `/html` exposes cached-node `rawHTML(read, namespace)` for sibling insertion and owned `htmlContent(element, read)` for fresh sole-child elements; `/ssr` exposes explicit unescaped `rawHTML(value)`. Installed Svelte 5.57.1 comparisons and permanent Chromium checks cover raw-value identity versus equal stringification, nullish/boolean/number values, SVG/MathML and table contexts, TrustedHTML, replacement and disposal. Scripts inserted this way are inert, but inline handlers still execute: these APIs do not sanitize content. Ordinary text stays escaped. The authored `raw-html.svelte` fixture now verifies HTML source lowering through the permanent DOM/SSR gate, including both controlled and sibling ranges, raw identity/coercion counts, table/select parsing, TrustedHTML, ordinary escaping, independent instances and request cleanup. The negative SVG fixture is rejected by both backends without publishing an entry facade. SVG/MathML source lowering, hydration and component/binding compilation inside injected markup are not established.

Native `/binding` now provides `bindOpen` for details, also re-exported by Svelte's
binding entry. Unit and permanent Chromium checks cover nullish closure without
initial adoption, user-listener order, native toggle coalescing, parent writes,
boolean SSR snapshots and queued/detached disposal. The owned native listener is
removed on cleanup; the pinned Svelte 5.57 helper leaves retained detached listeners
active. Authored `bind:open` lowering is now locally verified (unpublished); see the 2026-10-18 details-binding checkpoint below. No dialog, window/document
or dimension-binding coverage follows from this helper.

The permanent root-level snippet fixtures extend the inventoried DOM/SSR graph to 136 modules. The exact authored fixtures also pass the pinned Svelte reference browser and SSR checks; this does not establish nested snippets, default/destructured/rest parameters or hydration.

With `raw-html.svelte`, the permanent source gate inventories 142 generated modules. The exact authored source also matches pinned Svelte 5.57.1 across ten browser updates and fresh SSR requests; raw HTML remains an explicit unsanitized trust boundary.

Native Svelte component prop layers now have separate opt-in helpers:
`/runes` `spreadProps(...layers)` keeps DOM layers live, preserving rightmost
precedence, source getter receivers, symbols, inherited lookup and dynamic rest
keys. `/ssr` `spreadServerProps(layers)` snapshots enumerable own string-key
descriptors with lazy getters on the merged object. Installed Svelte 5.57.1
comparisons, unit tests and permanent Chromium component checks cover retained
focus/local state, replacement/removal, named children and disposal. Expression
memoization and source children precedence belong to Crepus; the bounded source
spread proof is recorded below. Isolated minified helpers measure 874 raw/436
gzip bytes for DOM and 234/181 for SSR, with no imported runtime or host packages.
These are export sizes, not application or speed comparisons.

Svelte `/pre` now supplies an opt-in owned render scheduler through
`withRuneScheduler` and `createRunePreEffect`. Pinned 5.57.1 browser probes and
native Chromium checks verify coalesced writes, pre callbacks reading old DOM,
parent structural work canceling hidden child callbacks, retained keyed rows
following their new indexes, and independent roots following first invalidation
order. References publish before mounts/effects; child mount/post callbacks run
before ancestor post callbacks. Pure derived reads remain current. The ordinary
native renderer remains synchronous, and the default signal entry is unchanged.

Owned callback, subscription and cleanup failures drain peers; failed routed
branches do not resubscribe. Disposed roots cancel queued work, ownerless entry
rejects, and more than 1,000 distinct post-effects do not consume a shared retry
budget. Cached sorted batches replace repeated pending-queue scans; keyed index
changes invalidate ordering explicitly. This runtime API is separate from SFC
source admission: actions, attachments, async and hydration still need compiler
and end-to-end acceptance. Pre-effects have separate source fixtures below;
these runtime tests alone do not establish source syntax.

The authored `parser-edge.svelte` and `text-content.svelte` fixtures extend the
permanent DOM/SSR inventory to 154 generated modules. Exact-source Svelte 5.57.1
comparisons and Chromium checks cover regex/division boundaries, comment braces,
nested template expressions, inner attribute quotes, reactive updates and fresh
SSR requests. Text expressions now preserve booleans, comma-separated arrays,
string-hint object conversion and function source without invoking functions.
Nullish text is empty; Symbols throw in DOM text and stringify on SSR, matching
the pinned reference. Tests assert escaped output, one object coercion per tested
interpolation, retained text elements and disposal. Crepus owns this source
conversion; native JSX child handling is unchanged. Cross-chunk coercion
scheduling and object conversion in mixed DOM attributes remain separate gaps.

Native Solid now has `catchError` and DOM/accessor `ErrorBoundary` without a host
runtime. Unit tests and a pinned Solid 1.9.14 differential cover sticky reset,
failed-child cleanup, fallback getter tracking versus untracked callback bodies,
normalization and outer handlers. Permanent Chromium checks verify actual
failure, fallback, reset/remount, detached nodes and disposal. Startup and callback
guards prevent routing while kernel dependency collection is active; native
commits remain synchronous and foreign core writes defer routing to a microtask.
Disposed queued handlers are canceled and handler failures route directly outward,
rather than reproducing observed stale or duplicate host callbacks. Neither host
bounds a handler that repeatedly writes another failing state. Event callbacks,
promises, cleanup failures and the tested later lazy function/array children
remain outside the boundary. SSR component use rejects before child setup;
hydration and compiler admission remain missing. The separate native SSR
serialization boundary is recorded below.

`component-binding.svelte` and its child now have pinned-reference browser/SSR
acceptance cases: bidirectional writes, retained child nodes, independent
instances, undefined bound fallback errors, four SSR initial/assignment cases,
request isolation and accepted-attempt cleanup. These exact fixtures now pass
native DOM/SSR source acceptance, extending the inventory to 170 generated
modules. Scalar component `bind:value` and a child `$bindable(3)` default are
covered, including distinct parent/child SSR values after assignment to an
already-defined binding. Failed undefined browser setup cleans up the native
partial parent owner; the pinned reference does not run that destruction hook.
Successful traces match. The later composite fixtures below extend member and
reactive-default coverage; other default forms, async and hydration need separate
source acceptance.

The paired `component-spread` source fixtures also have pinned-reference
acceptance: named/spread precedence, optional layer removal, live rest keys,
factory-call dependency caching, getter receivers, retained child state/nodes and
independent instances. The native gate now inventories 162 generated modules and checks these exact
authored fixtures in DOM and SSR; their isolated generated TypeScript graph
passes strict checking. Combined
`bind:this` and spread props preserve user symbols in DOM rest props while hiding
private reference metadata; replacement updates the symbol keys, siblings remain
independent, and SSR omits symbols as in the reference. Explicit children props
are covered; implicit body/legacy slot and element-spread lowering remain separate
requirements.

Native `/ssr` now exports synchronous buffered `boundary(render, fallback)`.
Tests cover deferred/array failures, nested fallback errors, escaped output,
select rollback, SVG context, request-local ownership and cleanup cancellation.
Failed attempts drain internal cleanup before fallback and suppress public Svelte
destruction; accepted attempts remain owned until request cleanup. Pre-created
factories use the current serializer owner. Unlike the pinned Solid server
boundary, this API also catches later deferred serialization failures. Arbitrary
state writes and committed callbacks are not rolled back; externally captured
scopes retain their existing owner/error policy. This runtime primitive does not
admit `<svelte:boundary>` source, async/reset behavior or hydration.

Verification scope: repository typecheck gates pass for all 25 projects. The new
typed spread and binding fixtures also pass isolated strict checks on generated
DOM/SSR graphs. An extra strict check across every generated source fixture is
not green: older untyped fixtures produce implicit-any/global-property and
inference diagnostics. Excluding the new component-binding graph produces the
same 227 diagnostics byte for byte; the new graph adds none. Runtime acceptance
of the inventoried modules does not imply strict
type coverage of every generated fixture.

Native Solid `/solid` now exposes independent `mergeProps` and `splitProps`.
Pinned Solid 1.9.14 comparisons distinguish plain descriptor copies from live
function-source views: getters remain lazy, undefined values fall back, live
keys and symbol reads update, and readonly view writes/deletes are ignored.
Native DOM tests retain nodes across prop updates and stop source evaluation on
disposal; SSR escapes prop text. Dynamic native-store keys require a function
source because Moonshine does not implement Solid's private proxy marker ABI.
These APIs do not establish new compiled TSX or SFC source coverage.

Native Vue `/reactive` now exports `watchSyncEffect`, with immediate tracked
reads, conditional subscriptions, untracked multiple cleanup callbacks and owned
or manual stopping. Five scenarios match cached Vue 3.5.13: ordinary updates,
late cleanup registration, self-writes, cleanup writes and stopping during a run.
Native tests additionally verify errors and request cleanup; actual Vue server
renderer execution was not part of this comparison. Native cleanup drains peers
and propagates the first error; this does not reproduce Vue's app error handler.
Scheduled effects, pause/resume handles, async continuation tracking and Vue SFC
lowering remain separate work.

`component-binding-composite.svelte` and `component-binding-member-child.svelte`
extend permanent native DOM/SSR acceptance to 180 generated modules. Exact
Svelte 5.57.1 reference traces verify binding precedence over a spread in either
attribute order, typed member targets and renamed child bindable props. Resetting
the member to undefined exposes a reactive child fallback without publishing it
to the parent; changing that fallback updates the child, and a subsequent child
write publishes to the parent. Three retained child nodes, sibling isolation,
disposal, fresh SSR requests and escaped ids pass. The isolated new generated
TypeScript graph passes strict checking. Other named component bindings remain
separate source work.

Native Solid `/solid` also provides client-only `lazy` and shared `preload`.
Chromium checks cover one loader shared by independent component instances,
pending cancellation, live props, retained nodes and cleanup. Bare synchronous
SSR and component SSR reject loading before invoking the loader. This does not
provide Suspense, hydration or asynchronous SSR.

Component references can opt into `publication: "post"` inside the rune
scheduler. Registration after a child's own mount/effect callbacks reproduces
Svelte's child-mount-before-parent-reference ordering; default reference timing
is preserved. Chromium checks cover publication, cancellation and cleanup.
The authored `effect-pre.svelte` and `effect-pre-child.svelte` fixtures now have
permanent DOM/SSR source acceptance. Their exact reference traces establish this
bounded `$effect.pre` slice; runtime helpers alone remain insufficient evidence
for other source variants.
The combined handwritten native implementation matches all seven pinned Svelte
5.57.1 pre-effect traces, including coalescing, hidden-child cancellation,
remounts and child-before-parent root destruction. Scheduled control branches
attach to their creation owner so retained rows survive updates and teardown
still reaches children first. Default native and SSR teardown timing stays
unchanged. Copied-package checks exercise lazy loading and post publication
without installing Solid or Svelte.

Native Solid `Switch` resolves nested arrays and zero-argument child accessors
through its existing child normalizer, accepting boolean conditional children.
Pinned Solid 1.9.14 comparisons and native tests cover priority, retained and
keyed branches, cleanup, invalid entries and escaped SSR. This is a source API
runtime fix and adds no compiled TSX or SFC acceptance.

`component-binding-function.svelte`, its child and
`component-binding-function-fallback.svelte` exercise named component
getter/setter bindings. Pinned Svelte 5.57.1 checks cover boolean/string
transforms, independent instances, writes, teardown and fresh escaped SSR.
The fallback fixture verifies capture-once member expressions and unbound calls;
SSR publishes an undefined getter's child fallback once without retrying setup.
DOM still rejects an undefined bound value with a fallback. The permanent
196-module native DOM/SSR gate passes, including child-before-parent disposal.
Strict checking of the new DOM/SSR graphs also passes: the compiler preserves
authored literal-union signatures through prop defaults without making object
and array defaults readonly. This does not establish strict checking of older
untyped fixtures or dynamic replacement capture lifetimes beyond this gate.

The optional Svelte `/directives` runtime now installs actions and attachments
without importing the host. Pinned Svelte 5.57.1 browser traces cover post-DOM
factory setup, action update positions, tracked update bodies, attachment
identity versus dependency reruns, final disconnected cleanup and deep cyclic
state parameters. Reads alone do not invalidate cyclic traversal; later writes
through newly materialized aliases do, preserving independent overlays.
Bare, nested and foreign-owner synchronous SSR skip directive thunks. Native
cleanup drains peers after failures, an explicit host difference. `use:` and
`{@attach}` source lowering and attachment spreads remain separate compiler
work; runtime tests do not admit new source modules.

The optional scheduler now distinguishes reference publication from ordinary
post-effect cleanup. Reference-triggered pre/text work waits until pending posts
finish; ordinary cleanup writes still update DOM before nested posts. Structural
branches follow owner traversal: an earlier branch invalidated by a later branch
waits for the next pass. Four pinned Svelte 5.57.1 graphs verify seven lifecycle
records each, including conditional DOM before and after a child. Permanent
Chromium checks cover combined text/conditional snapshots, two trees, coalescing,
hiding, remounting and disposal. Queue membership is exclusive and canceled
owners cannot revive deferred work. This bounded runtime proof does not establish
async scheduling, hydration or every `$effect.pre` source variant.

Render/structural job scopes now attach to their creation owner, so component
descendants dispose before parent hooks. Reruns replace those scopes without
accumulation; cancellation and throwing cleanups drain peers. Pre-effect jobs
retain their subscription-first shutdown and error precedence. This internal
ownership change does not alter detached public `createRoot` lifetimes.

`directives-reference-action.svelte` and
`directives-reference-attachment.svelte` are permanent reference-only authored
fixtures. Official Svelte 5.57.1 Chromium checks cover two instances each,
connected factories, old-DOM action updates, untracked factory reads, retained
attachment history, identity replacement and disconnected final cleanup. SSR
runs none of their directive expressions. Native source admission awaits
Crepuscularity lowering; the optional native runtime is verified separately.

Pre-effect helpers also suppress callbacks during bare, nested and foreign-owner
synchronous serialization, using the same lightweight SSR context guard as
native lazy components and directives. Foreign scopes retain their lexical
scheduler context, but these helpers install no new scheduling and execute no
pre callback while serializing.

The authored pre-effect pair compiles for both backends and its generated
TypeScript graphs pass strict checking. All seven native source DOM records
match the pinned Svelte reference, including root destruction. SSR erases the
pre-effect factory, preserves fresh escaped requests and destroys children before
parents. Compiler SSR conditionals use attached computations instead of detached
DOM control roots, preserving native controls' existing SSR lifetime contract.

The dynamic function-binding milestone covered 214 generated modules. Three dynamic function
binding fixtures verify one getter/setter capture across component replacement,
unbound calls, live writes, setup of the replacement before old cleanup, and
final disposal. Paired official Svelte 5.57.1 Chromium and fresh SSR traces match;
new DOM/SSR graphs pass strict types. The CLI module-graph path is included, with
all prior 204 module checks retained. These proofs do not establish full SFC,
async, hydration or preprocessor compatibility.

The optional native `/await` runtime is separate from source admission. It uses
existing owned control branches and the opt-in rune scheduler: plain values,
delayed pending, resolved promises, retained branches, replacement ordering,
stale results, raw rejection values and disposal have focused coverage. SSR
emits pending without awaiting promises. Authored `{#await}` remains unadmitted;
async SSR, hydration and transitions are not implemented by this helper.

Post-effects, effect roots and mount hooks also use the synchronous SSR context
guard, including bare renders and retained foreign owners. Discarded SSR attempts
suppress destruction hooks; accepted attempts preserve their final live state.
Manual JavaScript argument evaluation still occurs before calling a helper;
source factory erasure is a separate compiler responsibility.

Current runtime verification passes 1,795 tests, both 25-project typecheck lanes,
340 generated source modules, Chromium components/bindings, and copied host-free
await packaging. The verified local `dafde4ab` compiler automatically installs the rune
scheduler in generated DOM components. Its authored counter is 10,766
gzip bytes against pinned Svelte's 17,389. The older frozen `677c99ee` compiler
produced 8,870 bytes without scheduling and 10,602 with an explicit wrapper;
those are historical compiler variants, not the current default source path.
These are scoped workload sizes, not complete compatibility or a universal
performance ranking. The default signal bundle remains 3,798 raw bytes.

The latest full run passed all 7,772 assertions with a 30-second per-test timeout;
catalog sync also passes. Two earlier packaging checks exceeded Bun's default
five seconds under load and passed immediately in isolation. Permanent timeout
settings remain unchanged.

`await-reference.svelte` and `await-reference-branch.svelte` are reference-only
fixtures alongside the admitted templates. Actual production Svelte 5.57.1
Chromium traces and five SSR cases preserve the await reference baseline. They
remain outside the native source gate until Crepuscularity lowering is verified.

Companion factory modules now have bounded positive source admission with compiler
snapshot `a094b906a799ec0e53d48a7a8de17f560c29dbb22147ea80132adf89bbd82acf`.
`companion-factory-reference.svelte` imports distinct TypeScript and JavaScript
companions using function-local `$state`, `$state.raw`, `$derived` and
`$derived.by`. Two component instances preserve independent factories, cached
reads, raw replacements, retained focus and cleanup; fresh SSR requests escape
inputs and match the official reference. The source gate now covers 224 generated
modules, retaining all prior 214 checks and inspecting both emitted JS and TS.
New generated TS graphs pass strict checks; generated JS parses without type
syntax. Top-level exported object cells remain explicitly unsupported for DOM
and SSR, including an erased `declare const $state` prefix. Initial rejection
publishes no facade, and rejected rebuilds preserve previous facades byte-for-byte.
Named snippets inside component tags remain a safely rejected compiler-only gap.

Reference-only `module-reference.svelte` / `module-reference.svelte.ts` now test
official production module lowering: two independent factories per component,
a deliberately shared module object, retained DOM, disposal and fresh SSR
factories. The companion has a module-local declaration erased before official
compilation; it supplies no runtime or ambient global shim. Both standalone
TypeScript lanes pass. The example-wide config still reports its existing
unresolved `svelte` import in `context-helper.ts`; the repository's 25-project
gates do not include this example config.

Reference-only `snippet-composition-reference.svelte` and its card cover implicit
named snippets alongside ordinary children, reactive lexical values, local state,
retained focus, inherited context and child-first cleanup in production Svelte
5.57.1. Repeated SSR output escapes fresh inputs. Official diagnostics distinguish
named-snippet/explicit-prop collisions and named-children/body conflicts; an
explicit `children` prop with ordinary body is accepted by that compiler and
must not be assumed invalid. These broader reference fixtures remain unadmitted;
the new companion-factory proof does not cover their top-level shared cells.

The reference-only `store-reference.svelte` and host-free `store-reference.ts`
verify official production shared object notifications, immediate release when
replacing a hidden store, lazy replacement subscription, observable receivers,
disposal and fresh SSR request subscription counts. The optional native
`/store-binding` helper is a separate compiler substrate; source `$store` remains
unadmitted. Its end-of-setup `finish()` hook preserves destruction-read and nested
subscription-release order; the existing history machinery supplies previous
flush values to effect cleanup. Failed setup retains resource cleanup without
adding a new core lifecycle phase.

The earlier erased-declaration bypass is covered by the updated negative tests.
Companion batching is still partial: a factory method making two synchronous
writes triggers a derived callback twice natively where pinned Svelte calls it
once. Both the native synchronous renderer and existing scheduler wrapper exhibit
that difference, although values and SSR records match. The admitted fixture
checks writes separately; it does not establish two-write callback-count parity.
Neither isolated scheduling prototype is integrated; the default kernel stays
unchanged while the callback-count difference remains explicit.

The optional store reference runtime has permanent Chromium and copied-package
proof: shared object notifications, retained node/focus, hidden replacement,
receiver-safe unsubscription and per-request cached SSR reads. Reentrant cleanup
reads use temporary subscriptions so they cannot overwrite an owned cleanup;
independent review reproduced the original leak and verified the fix. All 1,638
repository tests pass with both 25-project typecheck lanes; these runtime proofs
do not admit authored `$store` syntax.

The existing `/ssr` runtime now provides plain `createServerState` boxes and
creation-context `createServerDerived` caching, with an explicit `true` cache
argument for component lowering. Five tests and actual official paired probes
cover crossing render contexts, nullish override fallback, falsy/function values,
throw retry and fresh escaped requests. The verified `a094b906` compiler imports
these helpers: components pass `true`, while JS and TS companion factories use
the creation-context default. The 224-module source gate passes with those imports.

The typed factory fixture deliberately shares its basename with the importing
SFC. Compiler output remaps the colliding component module and rewrites graph
imports while retaining the companion filename. CLI DOM interaction, retained
identity, disposal, strict generated TS and fresh escaped SSR all pass; both
declaration-bypass rejection and failed-rebuild facade preservation remain covered.

The first isolated kernel-invalidation prototype is **not integrated**. It fixes
the scheduled two-write callback count but fails an observed fresh optimistic
override case; its full-kernel cost was +138 gzip bytes. Default kernel behavior
and its 3,798-byte bundle remain unchanged. A private adapter-derived-node
alternative is also **not integrated**: preserving a fresh connected override
can expose a half-updated diamond before a sibling receives invalidation.
Official traces also distinguish directly dirty derived assignments from
maybe-dirty parent assignments. Neither candidate meets acceptance; no new
kernel scheduling policy or known failing implementation is included.

`class-fields-reference.svelte` is a reference-only public/private class-state
fixture. Actual production Svelte 5.57.1 Chromium checks preserve method receivers,
independent instances, retained focus and local updates; fresh SSR escapes inputs.
The verified native compiler explicitly rejects its rune fields for both targets.
Class-field source support remains missing; the source gate checks rejection,
without admitting the fixture to its generated-module inventory.

`scoped-css-reference.svelte` and its child are reference-only styling fixtures.
Actual production Svelte 5.57.1 emits matching client/server CSS and scope hashes;
Chromium checks the parent style without leaking into its child or an outside
sibling. The native compiler still rejects these local scoped fixtures before publishing
DOM or SSR output. Explicit-global styles have separate accepted source coverage;
local scoped CSS remains missing, with no native source admission.

`recursive-reference.svelte` and its self-imported node now have native source
admission. Compiler snapshot
`55f4e9f59e7d4764630064cf4d88b2a651ce9c244fe2cba653a68ab2a8b8fca6`
emits the existing scheduler-aware `createRenderMemo` for conditional expressions.
This fixes an accepted-source lifecycle bug in the earlier `a094b906` compiler:
an eager memo could read an old child's null prop before parent branch disposal.
No kernel or control-runtime change is needed. Unmodified compiler output matches
production Svelte 5.57.1 for two trees, retained focus/local state, inherited
context depth, replacement/removal, child-first cleanup, disposal and remounts.
Fresh SSR escapes inputs and isolates requests. This milestone covered 232
generated modules, retaining all previous 224 checks; strict checking
of the new recursive graphs runs inside the gate. This is bounded recursive
composition proof, not every component or scheduling variant.

`factory-effect-reference.svelte` and its TS and JS companions now have bounded native
source admission with compiler snapshot
`628d7910f27b8b467ed3e25bacb9262cfcc024cb648a2344be5a5eae945ea236`.
Actual production Svelte 5.57.1 and native Chromium checks match twelve post-DOM
effect and cleanup records across two factories in each of two instances.
Targeted writes, retained DOM and independent disposal match. Fresh SSR runs
without `document`, emits no effect trace and erases the entire registration.
The source gate preserves all prior 248 checks and now covers 250 generated
modules. The typed factory uses a distinct stem so TypeScript resolution cannot
hide the original same-basename JS collision. Both server helpers erase executable
effects; type-only rune declarations are removed before checking runtime output.
Authored and generated TS graphs pass strict checking; emitted JS parses without
type syntax, with runtime/import checks rather than a claim of strict JS body types.

The companion deliberately shares its basename with the SFC. The compiler
remaps the generated component filename so TypeScript cannot substitute it for
the JS import. Version 1 inventory metadata can now explicitly name `sourceModule`;
the CLI requires that output to be listed, target-contained and referenced by the
entry facade. Legacy filename mapping remains supported. DOM/SSR regression tests
also reject wrong companion pointers, missing modules and invalid paths. Legacy
inventories retain their prior validation rather than being forced to declare a
mapping they cannot express; actual older-compiler DOM/SSR graphs with a renamed
SFC beside a typed companion still compile. No host runtime or new effect
primitive was added.

At that historical checkpoint, `group-reference.svelte` was reference-only and compiler source lowering still rejected `bind:group` (later implemented with component/loop token scoping, connected-form reset verification and static checkbox/radio intrinsic spread support; see the 0.4.11 and 2026-10-19 checkpoints below).

The ordered SSR prototype also needs authored nested snippet bodies: a child
binding write inside a snippet must not change preceding attributes or text.
An independent official-reference probe exposes this omission in the temporary
transformer; this is not admitted source coverage. The same compiler snapshot
explicitly rejects `each` blocks, select `bind:value`, and the probed SVG tag.

The permanent named-snippet composition pair has bounded native source admission
with compiler snapshot
`d31b1c63a8c43f7f1053cf7a0c9ac4e8137b90c4eb09ae635b33575ff8bc35ea`.
The unchanged fixtures now preserve and rewrite their inline `type Snippet`
import to Moonshine's host-free `/svelte` contract. Strict generated TS passes.
Actual production reference and native DOM/SSR checks match two lexical closures,
implicit heading/children, consumer arguments, inherited context, retained local
state/focus and exact child-first cleanup. Fresh requests escape inputs and reset
local state. The compiler fixes deferred named-snippet scope ownership using an
existing owner-capturing cache; no new runtime helper is needed. All prior 256
checks remain, with eight new modules for a total of 264. This does not establish
every nested snippet, import/reexport or asynchronous rendering variant.

`form-reset-reference.svelte` has bounded native source admission with compiler
snapshot `1967f4d1865a9df4144fb317999490e923f2aab9cfff37ce878b3a6dc003ab28`.
Official production browser
checks cover two instances, undefined/default adoption, supplied initial values,
user input, programmatic writes and reset after `tick`. Frozen `628d7910` already
matches bound text/number/checked models, but literal `value` and bare `checked`
lose their reset defaults. Expression attributes correctly retain empty/false
defaults and stay distinct. The corrected compiler preserves literal defaults
without overriding authored explicit defaults. All prior 250 checks remain;
the gate now covers 256 generated modules. Both new graphs pass strict types. SSR
model values match, including undefined bindings not adopting DOM defaults;
official bare marker serialization on bound inputs differs, so raw HTML is not
claimed identical. The permanent gate compares exact five-stage, two-instance
model/live/default property records, fresh SSR semantics and disposal. No
Moonshine runtime or kernel change is needed. Broader reset variants remain open.

Owned portals now have an explicit native Solid `/portal` entry exporting
`Portal` and its opt-in browser `h`. That factory is required across the logical
subtree; existing `/h` retains direct events. Pinned Solid 1.9.14 comparisons
verify nested logical bubbling after physical bubbling, context, direct/capture
events, cancellation, disabled-handler skipping, retained nodes and cleanup.
Listener-object options are captured at registration so later mutation cannot
leak listeners. Independent review also exposed synchronous parent disposal
during child construction; a cancellation guard now drains that pending root
and prevents remote DOM from being appended after disposal. Regression tests
cover both bugs, failed mounting, namespaces and public browser/server types.
The existing `/ssr` entry exports a portal that never reads mount or children;
copied-package tests pass without host runtimes. Body/current-document element
mounts, explicit SVG containers, owned head ranges and open shadow roots are
supported. Head styles update without disturbing unrelated styles. Shadow events
preserve the portal's logical target while ordinary nested shadow boundaries
retarget to their host; pinned browser comparisons and a regression cover both.
Head construction also preserves the reentrant disposal guard. Same-origin
cross-document mounts now preserve source context and logical event ancestry
through browser adoption. Target documents share 22 delegated listeners until
their last portal owner is disposed; even a style-only foreign head mount pays
that fixed cost. Browser probes cover body/head/SVG/shadow, shared owners,
construction cancellation, repeated mounts and disposal after iframe navigation.
Native delegated iframe bubbling intentionally extends the observed Solid
reference behavior. Cross-origin access remains browser-restricted; hydration
and arbitrary foreign-authored node trees are unproven.

The shared native factory hook added 32 gzip bytes to the SFC counter
(10,605 to 10,637); later tick coordination adds another 59. Alternating 25
prototype samples of 200 mounts gave median
1.0 to 1.1 ms; serial click times were below timer resolution. These are scoped
cost measurements, not a general speed ranking. The signal kernel is unchanged.

`bun scripts/benchmark-portal.ts` reproduces an actual nested-portal application
with a common body, context provider, three logical-bubbling counter updates,
retained span and owned teardown. Matching Chromium traces pass against Solid
1.9.14. Production bundles measure Moonshine 17,623 raw / 6,701 gzip / 6,040
Brotli bytes versus Solid 22,866 / 8,567 / 7,781. The native full `Portal`+`h`
export surface is 15,209 / 5,859 / 5,290. This is an explicit-factory application,
not compiled Solid JSX, SSR, hydration or a timing comparison. The script records
versions, common-body and bundle hashes; `BENCHMARK_RESULT` selects the JSON file.

Native React-hook source is not implemented. An actual compiler probe previously
published native DOM/SSR containing unchanged React hooks and failed at runtime
with an invalid hook call. The CLI now rejects emitted `react`/`react-dom`
runtime imports, including subpaths and transitive modules, before publication;
failed rebuilds preserve previous outputs. Type-only imports remain allowed.
The explicit React target retains its supported legacy template behavior.
React-backed Waku/Next/router adapters still use React and remain distinct from
the native path. A future source lowering needs snapshot/queued-setter and
declared-effect-dependency semantics, not direct aliases to signals/effects.
`react-hooks-reference.tsx` records that boundary against React 19.1.0: repeated
direct setters collapse, functional setters accumulate, event handlers retain
their render snapshot, and effects follow their declared dependencies with
captured cleanup values. Two browser instances retain edited input identity,
focus and caret; fresh SSR runs no effects. This is reference evidence only;
the native compiler path correctly rejects its runtime imports.

An actual native TSX counter retaining Vue 3.5.13 `ref` stayed at `0` after a
click because Vue's graph cannot invalidate Moonshine's renderer. Native CLI
publication now rejects `vue`, `@vue/reactivity`, `@vue/runtime-core`,
`@vue/runtime-dom`, `@vue/shared` and `@vue/server-renderer`, including subpaths.
Both DOM/SSR failed rebuilds preserve previous facades. Explicit and inline
type-only imports, unrelated package names, compiler-only packages and the
explicit React target retain their existing contracts. Separately, Bun browser,
Bun and Node builds erase the tested inline type-only declarations; emitted
empty runtime imports/exports remain visible to the guard and reject.

The opt-in native Vue `/reactive` entry now provides `shallowRef` for external
snapshots: raw identity and literal functions are preserved, replacement uses
`Object.is`, and an existing reactive proxy retains its own tracking. Three
regressions and a copied host-free package check pass; actual Vue 3.5.13 traces
match for raw replacement, existing proxy reads, repeated NaN and signed zero.
The full reactive export surface grows by 35 gzip bytes; existing `ref` raw/gzip
sizes and the default signal bundle remain unchanged. This establishes a native
composition primitive, not Vue SFC lowering or `triggerRef` compatibility.

`select-reference.svelte` is reference-only. Official Svelte 5.57.1 checks typed
raw-object and undefined values, user/parent updates, conditional options,
default reset, independent instances and fresh SSR. Runtime helpers already
support these operations; source `select bind:value` is still rejected. The
reference's duplicate selected attributes are compared by presence, not copied
as an output contract. Undefined multiple-select initialization remains outside
this bounded fixture because the reference returns a scalar there.

`each-reference.svelte` is reference-only. Official production browser checks
preserve row-local state, DOM/input identity, edited text, focus and caret across
keyed reorder. Removal avoids a deliberately throwing stale-prop lookup;
append, empty fallback and independent instances pass. Fresh SSR escapes props
and runs row cleanup. This fixture defines source acceptance requirements;
native list primitives alone do not prove authored `each` support.

An actual Chromium integration with an official Svelte 5.57.1 custom element
also confirms the existing optional property helper preserves payload-object
and callback identity, does not invoke callbacks while assigning them, and
updates the widget's shadow content after payload replacement. This proves
external-widget interoperability only: that reference bundle contains Svelte.
Native SFC custom-tag consumption is still rejected at parsing and needs compiler
routing to the existing helper. Native custom-element registration, shadow
wrappers, `$host` and lifecycle compilation remain separate missing work.

`server-text-reference.svelte`, `raw-text-reference.svelte`,
`textarea-prefix-reference.svelte` and `textarea-entities-reference.svelte` now
have native source admission with frozen compiler
`90ef2b0ba33cb3751defa48aa926e0781ac441cf49bcdb965f01b51aaadfd95d`.
The permanent gate preserves all 264 prior modules and adds 24, with six-module
inventory assertions for each new fixture and strict DOM/SSR graph typing.
Expression textarea bodies update `.value` while preserving empty defaults and
text content; literal bodies retain their defaults. Forced dependency reruns
with unchanged output preserve dirty edits, changed output replaces them, and
two instances remain independent. Closing tags, component-looking markup and
script strings remain text. Fresh SSR requests preserve escaping and option
values without injected scripts.

Eight newline-prefix cases and sixteen static/dynamic entity cases match pinned
Svelte 5.57.1 DOM and parsed SSR. Literal CR/CRLF fixture bytes are intentional:
a single CR or `&#13;` retains a DOM newline but loses it when SSR HTML is parsed;
two literal LF preserve one in both. Named `&NewLine;`/`&Tab;`, semicolonless
ampersands and the reference's static-only legacy-prefix decoding now pass.
Truly unknown names remain literal. HTML fixtures explicitly declare UTF-8 so
non-ASCII values are compared correctly. All parsing/lowering changes live in
Crepus; the generic native serializer and signal kernel are unchanged. Ordinary
text fragment whitespace has bounded admission below; broader variants remain separate compiler work.

The `bare-attributes.svelte` pair has native source admission with compiler
snapshot `14ee8e4aafd2b6fbc6512d9ca984a9702668d508a77f91c79e307f749b4e292e`.
Bare intrinsic attributes are empty strings; expression booleans retain their
string values, real boolean controls preserve their properties, and bare
component props remain boolean `true`. Empty file input values do not throw,
quoted single-expression handlers still execute, and SSR erases events. Seven
older SSR assertions incorrectly expected bare marker attributes to contain
`"true"`; these were corrected against the actual official reference. All prior
232 checks remain, with eight new generated modules and strict generated types.
That milestone covered 240 modules. This does not establish form-reset parity.

`derived-pattern-reference.svelte` is reference-only: renamed/default object
projections, array projections, independent optimistic writes, dynamic inputs
and lazy unused derived values match production Svelte 5.57.1 across six browser
steps and fresh SSR. Native destructured rune declarations remain explicitly
unsupported. Scalar derived reassignment already works and is a separate case;
future array pattern lowering must preserve iterable semantics.

The reference-only `object-binding-reference.svelte` pair exposed a separate SSR
ordering bug: child
setup mutation can affect earlier parent text and attributes. Official output
preserves the earlier value, then exposes the mutation to following nodes.
Deferring only the child fixes earlier output but makes following conditions
and attributes stale. An isolated ordered-node correction using existing
`scopeSSRChild(defer(...))` for authored intrinsic, component and conditional
nodes matches all four tested binding-retry cases, inherited context,
child-first accepted cleanup and early-error short-circuiting. It adds 32 gzip
bytes to the permanent server fixture bundle with compiler `14ee8e4a`.
The correction is not integrated; raw-text
contexts, snippets, each blocks, selection and namespaces still need proof.
Browser object mutation and replacement tests pass independently and do not
establish correct SSR evaluation order.

Native `tick()` now yields and drains pending default rune effects and opt-in
render queues, including synchronous writes between independent roots. Actual
Svelte 5.57.1 comparisons exposed stale DOM when observers were registered before
a synchronous write and when one root's post effect updated another root.
Nine regressions cover those cases, pre/render/post ordering, disposal, first
errors with peer draining, stale queued callbacks, bounded cycles and recovery.
The private coordination reuses existing queues; it imports no pre scheduler
into the ordinary lifecycle entry and changes no kernel scheduling policy.
The authored SFC counter grows from 10,637 to 10,696 gzip bytes; the default
signal bundle remains 3,798 raw bytes. Future promise/timer work, hydration and
Svelte asynchronous compiler behavior remain separate missing contracts.

`whitespace-reference.svelte` now has bounded native source admission on frozen
compiler `85d7a08e3a941d58d011d4035e65e754bd8630b907e88b5f0c8ef5b9aeb69cf7`.
The permanent 294-module gate retains all prior 288 modules and adds six with
strict DOM/SSR graph typing. Exact pinned Svelte 5.57.1 assertions check two
instances, live expressions, conditional removal, snippet boundaries and parsed
SSR text. Ordinary element-edge whitespace is trimmed; sibling/expression spaces
remain visible, including `left  right` after hiding the conditional. NBSP edges
and pre/textarea indentation remain intact. Fresh SSR requests preserve escaping.
Evidence: `/tmp/moonshine-whitespace-root-permanent294.log`; official reference
records are in `/tmp/moonshine-whitespace-reference/`. Leading pre newlines before
conditional blocks or components remain separate compiler boundary work.
The authored counter stays byte-identical at 29,001 raw / 10,696 gzip / 9,719
Brotli bytes; `/tmp/moonshine-whitespace-root-counter.json` records the compiler
and bundle hashes. This does not establish complete whitespace compatibility.

`raw-snippet-reference.svelte` remains reference-only. Pinned production Svelte
checks two instances through eight phases and 33 exact lifecycle records,
including writes after both hides. Initial setup effects and lifecycle work
survive hiding until consumer disposal; remount work ends with that branch.
Returned raw cleanup runs on each hide. Context belongs to the consumer, not the
declaration component; fresh SSR only invokes factory/render.

The isolated stage-two DOM insertion-hook prototype now matches the exact
reference lifecycle trace, consumer-context get/set behavior and independent
manual `$effect.root` lifetime. It also checks setup failure cleanup, late
returned cleanup after parent disposal and peer cleanup after teardown errors.
The evidence is `/tmp/moonshine-raw-snippet-prototype/stage2-handoff.md` and its
`stage2-results.log`, `context-results-ids.log`, `manual-results.log` and
`stage2-edges.log`. These checks now underpin the private runtime bridge below.
Native lowering still needs an explicit authored-consumer identity and initial
setup state through synthetic render wrappers; their nearest active frame is
not sufficient. Public snippet values and private compiled argument cells must
remain distinct. The private SSR bridge now preserves render-attempt and retry context using an
explicit raw-only lifecycle registrar. The default lifecycle policy outside that
registrar is unchanged. Authored source lowering remains unadmitted.

The permanent reference-only `raw-snippet-ssr-reference{,-consumer,-bind}.svelte`
fixtures expose the required SSR lifecycle split. A consumer's inner binding
retry invokes factory/render twice and retains both raw destroy registrations,
after its own destroy callback. An outer parent retry discards the entire first
consumer and its callbacks. Failure cleanup also depends on that enclosing
attempt: a consumer outside a discarded parent buffer drains callbacks, while
one inside it does not. Raw lifecycle registration therefore needs the authored
consumer owner and its enclosing attempt; factory/render must retain the current
inner attempt. A blanket current-attempt guard suppresses valid callbacks and
changes ordering. The private bridge handles this split; source acceptance is
still pending. Exact official evidence:
`/tmp/moonshine-raw-snippet-ssr-permanent/results.log`; the no-outer-retry failure
comparison is `/tmp/moonshine-raw-snippet-ssr-reference/results.log`.

The `pre-boundary-reference{,-child}.svelte` pair has bounded native admission
on frozen compiler `bbab527b93a1288557f9e9b5cde852caaf6ac11c72b5c7a2493fd411e7e85e2e`.
The expanded 302-module gate retains all 294 previous modules and adds eight
inventory-checked modules, with strict DOM/SSR typing. All pre bodies contain two
authored leading LFs: direct-expression DOM retains two; conditional, key,
snippet, raw HTML and imported-component boundaries retain one. Parsed SSR
retains one across visible, hidden and empty variants. Textarea DOM value and
empty text/default content remain distinct from parsed SSR defaults. Exact
live-update, hide, empty, disposal and fresh-request matrices preserve those
differences. Official evidence: `/tmp/moonshine-pre-boundary-reference/`;
frozen compiler candidate: `gate-302-bbab.log` in that directory. SVG and nested
snippet whitespace, plus call-expression memoization, remain separate work.

`text-memo-reference.svelte` remains reference-only. Exact production Svelte
traces cover two instances, equal/changed call results, proxy coercion, unrelated
writes, disposal and fresh SSR. DOM evaluates call-bearing readers before its
grouped coercion work: equal outputs skip coercion, while a changed sibling or
proxy dependency reruns both object coercions. SSR retains per-node evaluation
order. Independent per-node caching is insufficient to establish that contract.
Evidence: `/tmp/moonshine-text-memo-reference/results.log`; no 308-module gate
admission is claimed.

`abort-signal-reference.svelte` is also reference-only. Pinned official browser
proof covers shared derived consumers, partial/final disconnection, manual reads,
nested derived teardown/reconnection, retries after compute errors and component
disposal. A derived's creation owner alone does not establish cancellation
lifetime: the last tracked consumer disconnect aborts, while a later untracked
read creates a signal that survives component disposal. SSR instead shares a
request signal across components and attempts, aborting after destroy callbacks;
nested renders isolate and restore that request signal, including errors.
No public helper or consumer-graph overlay is shipped. Exact fixture evidence:
`/tmp/moonshine-abort-reference/{permanent.log,permanent-ssr.log,HANDOFF.md}`.

The isolated raw-snippet SSR candidate now matches the permanent five-case
reference and no-outer-retry failures. Nested raw calls and factory/render throws
restore owner, context map, authored frame activity and current attempt; setup
getters remain unread. This is bounded private-runtime evidence. The missing source ABI
must explicitly carry authored consumer identity through synthetic render
wrappers and keep DOM argument cells distinct from SSR source values. Handoff:
`/tmp/moonshine-raw-snippet-prototype/ssr-handoff.md`.

A handwritten native text-group prototype now matches the exact six-phase
memo reference using existing derived values, explicit Text handles and one
render effect. This is not source acceptance. A separate official ordering
counterexample shows why compiler composition still matters: for text followed
by a dynamic attribute, the calls run text then attribute before text coercion;
an attribute failure suppresses that coercion. Deferring text until after an
ordinary `h` build reverses call order. Source lowering needs explicit node
handles and ordered reader/commit groups, reusing native property semantics.
No global DOM/kernel grouping or duplicate attribute policy is introduced.
Evidence: `/tmp/moonshine-text-group-prototype/results.log` and
`/tmp/moonshine-text-group-order-reference/results.log`.

Vue's `templates/vue/setup-counter-reference.vue` is reference-only. Actual
Vue 3.5.13 and a clearly handwritten native equivalent match two counters,
per-instance setup, live labels, unchanged initialized state after parent prop
changes, retained DOM/focus/props identity and fresh escaped SSR requests.
Crepus still explicitly rejects this script-setup source; native reactivity alone
is not SFC compilation. The next compiler contract needs ref/computed imports,
typed defineProps, per-instance setup and template-only top-level ref unwrapping.
Mutation probes also distinguish Vue development prop guards from production,
which permits those writes; no readonly-props helper was added on an assumed
production invariant. Evidence: `/tmp/moonshine-vue-setup-audit/HANDOFF.md`.

The private raw-snippet runtime bridge is now implemented. `/raw-snippet`
creates a tagged callable assignable to the existing public `Snippet<P>` type;
direct unlowered calls fail explicitly. `/raw-snippet-dom` accepts getter cells,
an explicit authored consumer and initialization provenance; `/raw-snippet-ssr`
accepts source values and that consumer. Mixed ordinary/raw dispatch preserves
the existing ordinary snippet ABI. Initial DOM setup work survives branch hiding;
remount work belongs to its branch, and manual effect roots remain independent.
Returned cleanup removes the root first and handles disposal during setup.
SSR never reads setup, and registers destruction against the consumer's enclosing
attempt while retaining the current inner render attempt. Runtime tests also
cover errors, invalid roots, context restoration, optional clearing and host-free
packaging. HTML single trimmed element roots only; hydration is not implemented.
These are compiler-facing entries, not authored SFC support: Crepus must still
carry the authored consumer through synthetic wrappers and map source imports.
The permanent source gate therefore stays at 302 modules.

Post-bridge root verification: 1,742 tests / 7,413 assertions / 939 files pass;
both 25-project typecheck lanes, manifests, adapters, catalog and lint pass.
The 302-module authored source gate still passes on frozen `bbab527b`.
The same authored SFC counter is now 29,093 raw / 10,726 gzip / 9,725 Brotli
bytes, an increase of 30 gzip bytes from the insertion hook. Its bundle SHA is
`9b2385bfd5f73555341d9fec9f16fa37034501492bc4a8d6c0f8131ab334626b`.
The default signal bundle stays 3,798 raw bytes. This size comparison does not
measure a compiled raw-snippet application or establish a general speed ranking.
Logs: `/tmp/moonshine-raw-{full-tests,types,native-types,source302}.log` and
`/tmp/moonshine-raw-counter.json`.

`textarea-default-reference.svelte` is reference-only. Exact official production
checks cover five cases in two instances through initial render, dirty edits,
updates, reset and disposal. Authored static/dynamic bodies establish live values;
explicit defaultValue independently establishes reset defaults. Updating a static
body's default preserves its dirty live value; reset applies the new default
without changing the model. Empty bodies adopt the default in DOM. SSR erases
defaultValue and its expressions completely, evaluates only the two body readers,
and parsed bodies establish live/text/default values. The frozen `bbab527b`
candidate fails that exact SSR trace: it reads defaults and drops body reads.
No expected trace was weakened or native gate expanded. Evidence:
`/tmp/moonshine-textarea-default-reference/{results.log,ssr.log,bbab-baseline308.log}`.
The separate default-value 308 candidate is not the text-memo 308 candidate.

The prepared raw-source admission patch also preserves the complete 302-module
gate and adds the existing DOM lifecycle and SSR retry/error fixtures. Frozen
`bbab527b` explicitly rejects the authored createRawSnippet import before source
publication; that diagnostic remains the source boundary despite the now-tested
private runtime. Evidence: `/tmp/moonshine-raw-source-admission/bbab-baseline.log`.
The new module count will be derived from real compiler output after lowering
exists; no unsupported source is counted as accepted.

Solid's optional `/dynamic` entry now implements native Dynamic/createDynamic;
server counterparts live explicitly on `/ssr`. Component identity owns setup,
while forwarded getters preserve nodes/focus during prop changes. Intrinsic
attributes and events stay live using the existing native factory and adapter
event policy. A memo equality gate prevents identical event values from
reactivating consumed once listeners. Tests cover function/tag selection,
undefined hiding, cleanup order, event tuples/options/null, literal function
attributes, errors, context, server isolation and host-free packaging. Actual
Chromium matches Solid 1.9.14, including the once-handler regression. These are
native factory APIs, not compiled Solid instructions or hydration. The optional
export bundle is 16,365 raw / 6,288 gzip bytes including DOM/events; existing
native counter and signal fixtures retain identical bytes. Source parsing and
SFC coverage are unaffected. Evidence:
`/tmp/moonshine-solid-dynamic-audit/{shared-browser-final.log,once-after.log,size-equal-event.log}`.

The first textarea-default compiler candidate also revealed an edit-boundary
regression: whitespace between two static-default textareas broke authored
children parsing; adjacent tags passed. A second frozen compiler `0fb8a524`
fixes parsing and SSR erasure. It matches all live/default/text/model fields and
read counts, but runs the static-default reader last instead of first, during
both initialization and writes. The exact trace assertion remains unchanged;
no 308-module admission is claimed. Evidence:
`/tmp/moonshine-textarea-default-reference/{reductions-whitespace.log,delta-0fb8.json}`.

Final Dynamic root verification passes 1,754 tests / 7,482 assertions / 940
files, both 25-project typecheck lanes, manifests/adapters, lint and scoped
format checks. Independent Chromium matches the selection/live-props trace and
the same-value once-handler case. The default full signal bundle remains 3,798
raw bytes. Logs: `/tmp/moonshine-dynamic-equal-{final-tests,types,native-types}.log`,
`/tmp/moonshine-dynamic-root-{browser,once}.log`. This verification adds native
component APIs; authored-source acceptance remains 302 modules.

The permanent gate now admits `textarea-default-reference.svelte` on frozen
compiler `196998f1b7680c395dd93da63461be943477701c1a392c3d7794fa72d78095a4`.
All 302 previous modules remain checked; six strict inventory-checked modules
bring the total to 308. Exact two-instance/five-phase assertions cover live/body
versus reset defaults, dirty-edit preservation, model independence, reader order,
sibling isolation and disposal. Fresh SSR erases defaultValue readers and keeps
body reads/escaped parsed defaults. Earlier failing traces remain unchanged.
Root proof: `/tmp/moonshine-textarea-default-permanent308.log`.
The authored counter remains byte-identical at 29,093 raw / 10,726 gzip / 9,725
Brotli bytes; `/tmp/moonshine-textarea-default-counter.json` records compiler and
bundle hashes. Object/Symbol/error-order coercion variants remain separately
reference-only until their real compiled graph is verified.

The new `textarea-coercion-reference.svelte` reference records actual DOMString
semantics: null/undefined become their strings, numeric/boolean values stringify,
and objects receive a string hint. Three default readers plus the body reader
run before coercion; Symbols/default-object failures occur after those reads,
while a body failure wins before default coercion. SSR erases all default reads
and coercions, even failing ones. Exact production evidence is in
`/tmp/moonshine-textarea-coercion-reference/{results.log,ssr-proof.log}`.

Additional source-like raw probes wrap every authored component in
withRuneScheduler and pass the authored frame explicitly through a synthetic
render helper. The existing 33-record lifecycle, context and independent manual
root traces pass. Replacement exposes two new unadmitted orders: new setup must
precede old returned cleanup, and active replacement effects must precede retained
initial effects. A temporary initial-work scheduler correction resolves the
second by capturing the consumer scheduler inside its authored setup wrapper;
frame.owner.context may hold the parent scheduler instead. The private DOM bridge now requires a fifth `RenderScheduler | undefined`
argument captured inside authored setup. Initial work replaces only that carrier
key (or removes it for explicit undefined); replacement work keeps its branch
carrier. The remaining setup-versus-old-cleanup order is still unadmitted.
No raw authored source admission is implied.
Evidence: `/tmp/moonshine-raw-source-scheduler-probe/consumer-scheduler-handoff.md`.

Real compilation of the coercion reference on `196998f1` passes strict DOM/SSR
types, every SSR erasure/body-error case, and successful DOM field values. Four
DOM traces still fail: Symbol/default-object coercion runs before later readers,
object reads/coercions interleave, and a body failure occurs after default
coercions instead of before them. The reference remains outside the gate.
Actual native records: `/tmp/moonshine-textarea-coercion-reference/native/delta.json`.

Latest combined verification passes 1,758 tests / 7,512 assertions / 940 files,
both 25-project typecheck lanes, lint, package/adapters checks and scoped format.
The permanent 308-module source gate passes on frozen `196998f1`; the default
signal bundle remains 3,798 raw bytes. Logs:
`/tmp/moonshine-consumer-{final-tests,types,native-types,lint}.log` and
`/tmp/moonshine-textarea-default-permanent308.log`.

The private raw DOM bridge now includes a per-render-slot commit queue.
`mapArray` can transfer removed-root disposal to that slot; the ordinary path
keeps its existing timing. New raw setup runs before the previous branch's
cleanup, including replacement between two noninitial snippets. Owner disposal
drains pending removals, and callback/setup failures retain the primary error
while draining cleanup peers. A nested ordinary array/thunk setup failure keeps
the previous output alive until unmount, matching official Svelte behavior.
Four permanent tests cover these paths. Real Chromium checks against shared
runtime sources match the official eight-phase trace and nested failure trace;
input hashes remain unchanged throughout. Evidence:
`/tmp/moonshine-raw-commit-review/{shared-browser.log,shared-nested.log}`.
The isolated default mapArray fixture grows by 18 gzip bytes; an h-only fixture
is byte-identical. Authored raw-snippet source admission remains pending.

Dynamic delegated event updates now replace their existing handler entry without
reacquiring the document listener. Direct/options/object/null transitions retain
ordinary registration and cleanup; unchanged once handlers remain consumed.
Three permanent tests cover registration and Dynamic mode transitions. Shared
Chromium checks preserve receiver/tuple/once behavior and show one document
listener acquisition and release for 100 handler changes, versus 101 of each
before the change. Same-run 20,000-operation event medians improve from 55.7 to
46.9 ms at a cost of 79 gzip bytes. Prop and replacement timings overlap the
previous implementation. Solid remains faster on replacements and events;
the current application is 6,883 gzip bytes versus Solid's 7,521, including the
same harness. These native factory results do not prove compiled SFC, JSX ABI,
hydration, or universal performance superiority. Evidence:
`/tmp/moonshine-dynamic-event-prototype/{benchmark-results.json,shared-build.log,shared-counts.log,shared-matrix.log}`.

The permanent `scripts/benchmark-dynamic.ts` reproduces the workload using
installed references, checks binding/ownership/focus/disposal invariants, records
versions, source/output hashes and all samples, and rejects changed inputs.
Its independent root run preserves both application bundle hashes and the same
performance tradeoff: native/Solid medians are 7.4/7.6 ms for props, 44.2/26.0 ms
for replacements and 42.5/34.8 ms for events. Timing variation between runs does
not establish a prop-update winner. Evidence:
`/tmp/moonshine-dynamic-permanent-root.json`.

Combined verification after raw commit and event updates: 1,765 tests / 7,557
assertions / 942 files pass, both 25-project typecheck lanes pass, and lint,
package, adapter and size checks pass. The default signal bundle stays at 3,798
raw bytes. The permanent 308-module source gate also passes with the shared raw
commit runtime. Logs: `/tmp/moonshine-commit-events-root-*.log` and
`/tmp/moonshine-raw-commit-308-gate.log`.

Independent verification on frozen compiler
`3fefc7c8bcf773bcf8a30c769fe1490f2182eda8b5c292c4695d37fec2b2fd89`
also passes the unchanged 308-module gate. The authored counter remains
byte-identical at 10,726 gzip bytes. Reference-only textarea body and default
coercion fixtures pass both strict generated graphs and all SSR records, but
remain outside admission: an unchanged object body is coerced again on a forced
rerun, and default-value coercions run before later readers rather than after
all readers. Those differences affect user conversion side effects and error
ordering even when visible field values match. Evidence:
`/tmp/moonshine-textarea-value-root308.log`,
`/tmp/moonshine-textarea-value-counter.json`, and
`/tmp/moonshine-textarea-{body,coercion}-reference/native/delta-3fef.json`.

The permanent source gate now admits `textarea-body-reference.svelte` on frozen
compiler `13832db877ae7ec83454a09e2c7bda5ff45817cc2f9b3618296441e39158c656`.
All 308 prior modules remain, with six additional inventoried modules and strict
DOM/SSR graphs bringing the total to 314. Exact ten browser records cover
unchanged-object conversion caching, dirty edits, reset, changed output,
independent instances, disposal, Symbol assignment errors and literal/expression
newlines. Twelve fresh SSR records preserve conversion traces and errors;
parsed HTML preserves escaping and textarea fields. Root independently applied
and ran the gate: `/tmp/moonshine-textarea-body-root314.log`. The authored
counter remains byte-identical at 29,093 raw / 10,726 gzip / 9,725 Brotli bytes,
SHA `9b2385bfd5f73555341d9fec9f16fa37034501492bc4a8d6c0f8131ab334626b`;
`/tmp/moonshine-body13832-counter.json` records compiler/runtime fingerprints.
Default-value coercion ordering and mixed-expression body coercion are still
outside this admission.

The same 314-module gate now also checks six primitive textarea cases. NaN
reruns overwrite dirty text, while null, undefined state, false and signed zeros
retain it; swapping signed zeros introduces no new read. Undefined initial
props still adopt the authored default and are distinguished from explicitly
assigned undefined state. Twenty-four fresh SSR records and parsed textarea
fields pass. Root proof: `/tmp/moonshine-textarea-edges-root314.log`; official
and native primitive traces are retained under
`/tmp/moonshine-textarea-body-reference/`.

Four permanent private raw-snippet boundary tests cover factory, setup, old
cleanup and combined failures, fallback writes, reset, final cleanup and inert
post-disposal work. Native recovery intentionally drains all resources and
preserves the setup error when old cleanup also throws; the official reference
aborts recovery in that combined case. This proves the existing native boundary
bridge, not authored `<svelte:boundary>` lowering. Differential evidence:
`/tmp/moonshine-raw-boundary-reference/handoff.md`.

Native mapArray now removes entries in their previous list order, matching both
Solid 1.9.14 and Svelte reference traces, including interleaved duplicate
identities. A no-removal fast path avoids allocating the retained-entry set.
The isolated optional list application grows 28 gzip bytes; the checked paired
100-row reorder workload improves from 70.16 to 61.14 ms median across eleven
samples. These are list-workload measurements, not general speed claims.
`/tmp/moonshine-map-order/{control.patch,benchmark-fast.log,browser.log}`.
The new permanent duplicate-entry regression also covers retained identity and
exact-once removal. Authored `#each` remains outside admission: a compiler needs
stable keys, live item/index bindings and scheduler-aware binding caches. Pure
memos read stale removed rows; uncached bindings erase dirty inputs on reorder.
Use a per-update key map rather than linear lookup in each binding, and create
an owned `createRenderMemo` row cell inside the mapper. A direct lookup getter
throws during removed-row cleanup; the owned cell retains its final cached row
after disposal. Paired official/native traces now match cleanup row props and
index as well as updates, focus and local state. This is a bounded runtime
contract, still awaiting authored lowering. Evidence:
`/tmp/moonshine-each-cleanup-live/{results.log,cached-results.log}` and
`/tmp/moonshine-map-order/shared-browser.log`.

Latest combined checks pass 1,770 tests / 7,635 assertions / 943 files, both
25-project typecheck lanes, lint, package/adapter/size checks, scoped formatting,
the 314-module source gate and native Chromium component checks. Catalog sync
also passes. Default core remains 3,798 raw bytes; the authored counter remains
byte-identical at 10,726 gzip bytes. Logs:
`/tmp/moonshine-map-order-root-*.log`, `/tmp/moonshine-map-order-root314.log`,
`/tmp/moonshine-map-order-counter.json`, and
`/tmp/moonshine-body-root-catalog.log`.

A hidden-store replacement audit now fixes one native `/store-binding` disposal
guard: a subscription first acquired by a destruction read stays live until
that read finishes, then closes in normal cleanup. The compiler must lower an
assignment as `reference.releaseIfChanged(current = rhs())`, evaluating the RHS
once and assigning before the old unsubscribe callback runs. After `tick`,
official/native traces subscribe B → destroy-read B → unsubscribe B. Immediate
replacement/disposal instead reads historical A in both runtimes. Failed setup,
retained post-disposal reads and late callbacks leave no active subscriptions.
This is a runtime substrate fix; authored `$store` remains unadmitted. Evidence:
`/tmp/moonshine-store-lowering-audit/{official.log,shared-settled.log,immediate-official.log,shared-immediate.log,shared-retained-failure.log}`.

Native Vue `/reactive` now provides `toRefs` using existing property refs.
Destructuring preserves live reads/writes, existing ref identity, inherited
enumerable string keys, sparse array holes/length and source getter receivers.
Symbols are omitted, as in Vue. Result keys are defined as own properties so
`__proto__` cannot replace the result prototype. The existing ToRef type now
keeps optional value unions in one ref rather than a union of incompatible refs.
Permanent runtime/type/no-host tests pass. Shared Chromium traces against Vue
3.5.13 verify two instances, live prop aliases, alias writes, literal callbacks,
retained focus/caret and disposal. This proves handwritten native components,
not `<script setup>` lowering or Vue readonly-proxy behavior. Importing toRefs
instead of toRef costs 53 gzip bytes in the isolated export fixture; existing
counter and signal fixtures remain byte-identical. Evidence:
`/tmp/moonshine-vue-torefs-browser/results.log` and
`/tmp/moonshine-vue-torefs/size.ts`.

Destructured-derived runtime contracts are also proven without another helper:
one lazy RHS, writable per-projection derived cells, undefined-only lazy
defaults, and one shared materialization for bounded iterable patterns. Ordinary
JavaScript tuple extraction preserves iterator closing/error behavior after the
array fast path; elided positions still need temporary reads. A pinned twenty-
case DOM/SSR nullish-override probe confirms their intentional difference: DOM
retains null/undefined overrides until dependency change; SSR uses its cached
RHS for nullish overrides and retains false/zero/NaN overrides without reactive
invalidation. Source lowering remains missing; nested/rest/computed-key patterns
are outside this bounded proof. Evidence:
`/tmp/moonshine-derived-pattern-manual/handoff.md` and
`/tmp/moonshine-derived-pattern-extra/nullish-native.log`.

Combined verification passes 1,774 tests / 7,656 assertions / 944 files, both
25-project typecheck lanes, lint, package/adapter/size checks, scoped formatting,
the 314-module source gate and native Chromium component checks. Core remains
3,798 raw bytes. Logs: `/tmp/moonshine-store-torefs-root-*.log` and
`/tmp/moonshine-store-torefs-root314.log`.

### Authored store subscriptions and native Vue text conversion

The frozen isolated Crepuscularity CLI
`ad8954f2e32cca4d8d2d7b01979f1ce1f5bf377f66faa221baed4beb5ae1a3a6`
passes the permanent 322-module gate, retaining all previous 314 modules. The
unchanged store reference source and companion produce DOM and SSR graphs with
strict types and no host runtime imports. Browser checks cover two subscriptions
to a shared object store, identical-object notification, hidden-branch store
replacement, remounting, observable unsubscribe receivers and inert callbacks
after disposal. Two fresh SSR requests verify escaping and balanced subscriptions.
The reviewed six-file compiler patch is now applied to the live Crepuscularity
working tree and matches the tested snapshot byte-for-byte. It is uncommitted
and is not a published compiler release.

Store lowering runs before prop lowering so typed prop stores read their payload,
not a prop cell. It supports declared top-level/imported store reads and simple
replacement of a store variable backed by `$state`. It rejects `$store` assignment,
mutation and unsupported store-variable writes. Root proof:
`/tmp/moonshine-store-root322.log`. The same compiler keeps the authored counter
byte-identical at 29,093 raw / 10,726 gzip / 9,725 Brotli bytes,
SHA `9b2385bfd5f73555341d9fec9f16fa37034501492bc4a8d6c0f8131ab334626b`;
`/tmp/moonshine-store-ad895-counter.json`.

Vue's optional `/text` entry now supplies native interpolation conversion,
including native refs, JSON conversion, collection ordering and errors. DOM and
SSR deliberately differ when `toJSON` returns undefined, matching pinned Vue
3.5.13: DOM returns undefined while SSR emits its literal string. The renderer
escapes text. Paired proofs are under `/tmp/moonshine-vue-display-prototype/`.
This adds no Vue runtime dependency and does not establish SFC compatibility.
The full suite passes 1,782 tests / 7,698 assertions across 945 files; both
25-project typecheck lanes and lint/package/adapter/size gates pass.

The integrated store compiler snapshot also passes all 854 native Rust tests
across 61 suites (`/tmp/moonshine-store-root-rust-native.log`). Full CLI/workspace
Rust gates have not run. A subsequent reference probe found an SSR store
lifetime gap: official Svelte unsubscribes before a later destruction hook reads
the cached value, while the current native helper unsubscribes after that hook.
`/tmp/moonshine-writable-store-audit/lifetime-{official,native}.log` preserves
the differing traces. The admitted store fixture does not exercise destruction
reads. The subsequent server-store completion work below resolves this ordering
gap; writable `$store` source support remains open.

### Combined authored Vue, derived patterns and SSR store completion

The live, uncommitted Crepuscularity working tree matches the reviewed combined
snapshot for nine changed source/test files. Frozen CLI
`dafde4ab76f5d2fbdee5763ee85df27cc61244694616bbc0f36c1f691649bf57`
passes the permanent **340-module** gate: all prior 322 modules, six basic
derived-pattern modules, six typed iterator/default/error modules, and six Vue
setup modules. Root proof: `/tmp/moonshine-combined-root340.log`.

One-level object rename/default and fixed-array `$derived` patterns reuse the
existing scalar cells after an Oxc expansion/reparse. Tuple and iterable types
remain checked; defaults stay lazy, iterators close after bounded consumption,
and projection overrides remain independent. Nested/rest/computed patterns
still reject. The supplemental authored fixture matches 18 official browser
actions, fresh SSR, error retries, retained nodes and disposal. A private
derived invalidation map fixes eager pulls of unobserved derived chains without
changing the kernel. A regression fails before and passes after the fix; the
historical cleanup call-count correction matches actual Svelte source.

SSR store references now use an optional server group. It closes subscriptions
in first-access order after successful serialization and accepted own
settlement, before publishing bindable props. Same-source destruction reads use
the completed cache. Fresh two- and three-level bindable/retry traces match
Svelte 5.57.1. Late/new destruction reads use balanced one-shot subscriptions,
and cleanup drains peers after failure; these intentionally avoid reference
leaks/aborted cleanup. Actual probes: `/tmp/moonshine-writable-store-audit/`.

The unchanged Vue setup fixture now compiles through the real CLI into complete
native graphs. Copied-package Chromium proves independent ref/computed state,
live parent props, retained nodes/focus/props identity and disposal. Two fresh
SSR requests match exact escaped HTML. Six negative public-prop calls pass both
strict type lanes. Root independent transport proof: `/tmp/moonshine-vue-cli-root/`.
Direct props mutation diagnoses, while escaped props mutation remains a known
runtime gap (`/tmp/moonshine-vue-props-escape-root/results.log`). No Vue
scheduler, hydration, readonly-proxy, full component ABI or scoped CSS claim.

Final runtime gates pass **1,795 tests / 7,772 assertions / 946 files**, both
25-project type lanes, lint, package, adapter, catalog and size checks. The
combined native compiler passes **869 tests / 62 suites**, and the real CLI
module graph suite passes **9 tests**. Full Rust workspace/default-feature gates
have not run. Logs: `/tmp/moonshine-combined-final-*.log`.

Default core stays **3,798 raw bytes**. The optional derived export adds 44 gzip
bytes in isolation. The actual authored counter is now **29,198 raw / 10,766
gzip / 9,737 Brotli** (40 gzip bytes over the preceding milestone), SHA
`5826995485a7aac8bf91a8ccc199ef248173241100dccc1c45c9bf27423001bb`.
The same pinned Svelte counter is 17,389 gzip bytes. One local 25-load run measured
startup medians 5.1 ms native / 6.7 ms Svelte; both click medians round to zero
and p95 is 0.2 ms. These observations describe this workload and machine only,
not a universal ranking. `/tmp/moonshine-derived-lazy-root-counter.json`.

### Writable stores, numeric equality and scheduled list ownership

Frozen compiler `09129e18079d1ee3e0da17e27d58894a68c37017d0242be4dbc0283873bf5413`
passes the **346-module** source gate, retaining all 340 previous modules and
adding six writable-store modules. Direct, compound, logical, prefix/postfix and
member `$store` writes have exact 17-phase browser traces and two fresh SSR
requests, including replacement during evaluation, receiver preservation, lazy
subscription, nested assignments, escaping and disposal. Compiler output runs
against copied packages without helper aliases or output rewriting. Root proofs:
`/tmp/moonshine-writable-root/` and `/tmp/moonshine-writable-control-root346.log`.
Destructuring/delete/iteration write targets remain rejected. SSR member updates
retain the pinned host's distinct notification behavior; this is not blanket
legacy-Svelte compatibility. Live Crepus compiler edits remain uncommitted.

Vue reactive objects and arrays now opt into `Object.is` property equality,
preserving signed zero and suppressing repeated NaN notifications. Native
`createMutable` keeps its strict-equality default. Pinned Vue 3.5.13 browser
traces, accessor receivers and both strict type lanes pass. The two-instance
native Vue fixture adds 77 gzip bytes; this is a separate workload from the
Svelte counter. `/tmp/moonshine-vue-equality-root/`.

Scheduled Svelte list groups retain current keyed row order during final
cleanup, with each row's children disposed first and later siblings afterward.
Duplicate item identities and deferred removed roots retain their lifetimes;
disposed owners reject new lists. An actual Svelte 5.57.1 nested-keyed browser
probe confirms reordered child/parent cleanup order
(`/tmp/moonshine-nested-order-reference/proof.ts`). Unscheduled native/Solid
list ownership keeps its existing contract. Authored `#each` compiler work is
still separate and not admitted by this runtime change.

Default core remains **3,798 raw bytes**. The authored counter remains
**29,198 raw / 10,766 gzip / 9,737 Brotli**, SHA
`5826995485a7aac8bf91a8ccc199ef248173241100dccc1c45c9bf27423001bb`.
The current native Rust suite passes **874 tests / 62 suites**; full Rust
workspace/default-feature gates remain unchecked. Vue escaped props, broader
component/compiler semantics, styles and hydration remain active work.

Combined verification passes **1,806 tests / 7,817 assertions / 948 files**
(`bun test --timeout 30000`), both 25-project typecheck lanes, lint, package,
adapter, catalog and size gates, plus scoped formatting. The package-script
subset separately passes 1,798 tests. A preceding five-second-default run timed
out in the standalone kernel bundle test under concurrent build load; the
unchanged test passes in the full longer-timeout run.
`/tmp/moonshine-current-all-tests.log` and
`/tmp/moonshine-writable-control-final-*.log` preserve the results.

### Declared Vue props and reactive identity

Frozen CLI `44c723b24f0febb4e3e07654b20c32de4621ca85eafdb95d6b938cd21874d5e5`
passes the **354-module** source gate under both `tsc` and `tsgo`, retaining
all 346 prior modules and adding eight imported-prop modules. The Vue graph
inventory is exactly 14 modules. Original and imported-interface components
share the same two-instance Chromium scenario: local escaped label writes,
same-final-value parent bounce, click, delete, parent refresh, retained
node/focus/props identity and disposal. Both have two fresh requests with exact
escaped SSR. Public missing/wrong props remain errors in both type lanes.
The original authored fixture remains unchanged. Root real CLI/copied-package
proofs are under `/tmp/moonshine-vue-props-root-integration/`;
`/tmp/moonshine-vue-props-root354-both-types.log` preserves the full gate.

Crepus resolves finite inline/imported interfaces, aliases, intersections and
inheritance through a callback into the CLI's existing safe resolver. Unknown,
cyclic, generic or dynamic shapes and unresolved Boolean casts diagnose. The
reviewed five-file compiler patch is live and uncommitted, preserving concurrent
scriptless/dynamic-import guards. The peer compiler audit subsequently found a
long acyclic re-export stack overflow and is adding a depth diagnostic;
frozen44c723 predates that follow-up and the newer non-regular-output guard.

Optional Vue `/props` supplies shallow declared snapshots, tracked local
writes/deletes and an owned microtask for coalesced parent refresh. Missing
optional keys are own undefined properties; functions and nested objects retain
identity. Inherited initial values clear on later own-prop refresh, matching
the sampled reference. Same-input retry remains possible after setter failure,
and sibling queues drain. This is not full nested Vue scheduling, immediate DOM
timing, effectful getter evaluation or arbitrary descriptor mutation parity.

Two additional regressions fail before and pass after their fixes: reactive
child self-assignment now retains identity/raw storage and avoids duplicate
notifications; deep refs now distinguish signed zero and suppress repeated NaN.
Actual Vue 3.5.13 reference traces match. The scoped two-instance Vue bundle adds
28 gzip bytes for proxy assignment and three for ref equality, ending at
**20,705 raw / 7,811 gzip / 7,049 Brotli** (gzip default level six). These are
separate from the authored Svelte counter workload. Evidence:
`/tmp/moonshine-vue-proxy-identity/`.

Current Vue tests pass **74 tests / 361 assertions**, both 25-project type lanes
and lint/package/adapter/catalog/size gates pass; default core stays 3,798 raw
bytes. A broader run passed 1,812 tests with one existing Waku hash-isolation
failure, independently reproduced without Vue tests. That run predates the final
deep-ref regression; no all-green current workspace claim is made.
`/tmp/moonshine-vue-props-final-*.log` and
`/tmp/moonshine-vue-props-waku-hash-isolated.log` preserve the checks.
Full combined Rust workspace verification remains separate.

### Solid type bridge and router fragment isolation

The reviewed two-file native compiler type bridge is live and uncommitted.
Frozen `3b362d4cfc8058e637715cce7000d666386c7eb8492fc670b30a3d7d82bf9a71`
passes the 354-module gate and 36 isolated positive/negative generated type lanes.
Named interfaces use an object constraint rather than requiring index signatures;
primary review found and fixed that regression before integration. Typed cached
children retain generic callback correlations. Explicit type-only `JSX.Element`
imports map to target-specific native child types; other namespace surfaces
still diagnose. Svelte's `Object.create` descriptor seam stays intact, including
its existing prop-call typing gap. The authored SFC counter remains byte-identical;
a typed TSX child-call workload adds 16 gzip bytes DOM / 20 SSR.

`check:components --compiler <path>` now supplies permanent authored Solid
fixtures, generated `tsc`/`tsgo` positive and invalid-call checks, no-host import
checks, Chromium interactions and two fresh escaped SSR requests. The gate
fingerprints an immutable compiler copy and requires assignability diagnostics
for negative cases, rather than accepting missing-import/parser errors. Default
`check:components` remains compiler-free. Native cleanup order/timing differences
from Solid remain explicit. Proof: `/tmp/moonshine-solid-jsx-types-prototype/`
and `/tmp/moonshine-solid-components-root.log`.

Waku's previous global hash getter could change an untouched router's snapshot
on an unrelated React rerender. A real Chromium probe reproduced it. Router
runtimes now own a separate fragment signal, updated in the existing navigation
batch; pathname/query and history snapshot shapes stay unchanged. Waku subscribes
to that signal, with global hash/pop events updating mounted consumers and empty
SSR snapshots. New consumers/remounts retain the correct runtime fragment even
when another runtime navigated while they were unmounted. The affected 212 tests
and Chromium own/global/back/forward traces pass. HappyDOM emits nonstandard
hash events for History API writes; a precise test-local queued-pair filter
models Chromium while retaining real hash assignments and explicit events.
`/tmp/moonshine-waku-hash-isolation-review/` preserves the before/after evidence.

The combined runtime rerun passes **1,817 tests / 7,894 assertions / 949 files**,
both 25-project type lanes and lint/package/adapter/catalog/size checks. An
intermittent native deployment CSS-output lookup failure passed isolated tests,
metadata probes and the full rerun; its error now includes canonical input and
returned output metadata for future diagnosis. No speculative lookup fix was
made. `/tmp/moonshine-props-fragment-confirm-tests.log`.
The combined typed compiler snapshot passes **904 Rust tests / 66 nonempty suites**
after updating stale call-shape assertions while retaining ownership/untracked
branch checks. This snapshot predates the peer compiler's Vue depth/component
follow-ups; it is not a full current Rust workspace claim.
`/tmp/moonshine-typed-props-native-final.log`.

The source-keyed-list prototype now matches reference key visits and visible DOM
movement across a 162-update permutation/index-key sweep, but remains isolated.
Stable range insertion, failure cleanup and optional footprint work must pass
real compiler wiring and permanent source admission before `#each` is covered.
The typed snapshot's CLI module-graph suite also passes all 11 tests
(`/tmp/moonshine-typed-props-cli-final.log`). Scoped formatting and diff checks
pass; all changes remain uncommitted and unreleased.

### Keyed-list and nested-props admission review

Further primary review found a dynamic SVG-row gap in the isolated keyed-list
candidate: an accessor that creates an ambiguous SVG `a` element during detached
range preparation used the HTML namespace. The actual Chromium regression is
`/tmp/moonshine-each-range-prototype/root-svg-dynamic.log`. A separate review
found that moving an end marker forward across an unrelated same-parent sibling
could make range cleanup consume that sibling. The candidate remains unadmitted;
the next runtime revision must preserve creation namespace and validate owned
contents as well as boundary reachability before moving or removing a range.

The parent/child Vue props differential also confirms the documented queue limit:
a parent refresh reaches the child after a second native microtask, whereas the
reference's `nextTick` observes both updated. Sampled local overrides, bounce
coalescing, retained nodes/focus, sibling isolation and disposal traces match.
`/tmp/moonshine-vue-nested-props/browser.log` preserves this helper-level result;
it is not compiled SFC or full renderer-scheduler coverage. Shared optional queue
work and real imported-component compiler admission remain pending.

The optional-each compiler snapshot
`880f8737beb161b26e128966ff67fe141cf3b003dc86e42cf5bb9cf1887c5a1e`
passes the existing permanent 354-module source gate independently against the
current shared runtime, including both generated typecheck lanes, Chromium and
fresh SSR (`/tmp/moonshine-each-root-source354.log`). Its 228 focused Svelte Rust
tests and two core each tests pass. This proves baseline regression coverage;
new keyed source graphs still require the corrected isolated runtime and
permanent fixture admission before either compiler/runtime patch is integrated.

The corrected isolated range revision now passes primary Chromium checks for
accessor-created SVG nodes and eight damaged-boundary move/remove cases,
including a forward-crossed foreign sibling, plus cleanup/cancellation failures.
Proofs: `root-svg-fixed.log`, `root-failures-fixed.log` and
`root-crossed-fixed.log` in `/tmp/moonshine-each-range-prototype/`.
The frozen optional-each CLI also passes actual untouched generated graph
`tsc`/`tsgo`, key-visit and 162-update browser sweeps against that corrected copy
(`/tmp/moonshine-each-compiler-prototype/abi-integration/actual-*.log`).
Permanent authored fixtures, final footprint measurement and shared integration
remain pending; earlier hand-edited helper wiring is not used for these checks.

An isolated shared optional props queue fixes the observed second-microtask gap
and passes reversed parent/child enqueue order, error draining, retry, disposal,
two fresh SSR requests and both type lanes. Its client helper adds 172 gzip
bytes; the SSR helper is unchanged. Evidence and immutable patch fingerprints:
`/tmp/moonshine-vue-nested-props/HANDOFF.md`. It remains outside the shared tree
pending real imported-component source acceptance; arbitrary Vue renderer jobs,
local synchronous DOM timing and effectful getter counts remain unsupported.

### Integrated keyed each and nested Vue source milestone

Reviewed Crepus parsing/lowering and Moonshine's optional `/each` entry are now
integrated locally. Keyed/unkeyed identifier items and live indices, arrays,
iterables, array-like/nullish inputs and else fallbacks have untouched actual-CLI
DOM/SSR proof. Exact key/setup visits observe real movement; the 162-update
reference sweep also checks focus, dirty values, local state and fallback counts.
Source SSR never evaluates keys. Destructuring/default/rest bindings and direct
item/index body write targets remain diagnosed, pending further source work.

The shared DOM insertion path carries private range dispatch, while range
validation remains in the optional marker implementation. Owned ledgers prevent
missing/foreign/reversed/forward-crossed markers from consuming unrelated
siblings. Dynamic detached rows retain their creation namespace; moved rows use
the actual parent namespace. Cancellation during old-row cleanup prevents late
DOM or live listeners in ordinary and nested insertions. Duplicate/unstable keys
and setup/cleanup failures drain provisional roots rather than reproducing
reference production leaks. Raw-snippet initial/append detached setup matches
the pinned reference; that observation was not a bug.

The permanent source test caught a further bug: a repeated empty input disposed
an existing fallback while retaining its stale entry. The integrated one-guard
fix preserves its root, dirty DOM and cleanup count across `[]`, null and
undefined, then cleans it once when rows return. Exact reference fallback census
and a permanent regression fail before/pass after. Proofs:
`/tmp/moonshine-each-compiler-prototype/abi-integration/FINAL-HANDOFF.md` and
`/tmp/moonshine-each-fallback-root.log`.

Vue's optional props queue now drains nested refreshes in setup order within one
microtask, keeping last-successful snapshots, bounce coalescing, disposal,
first-error peer draining and retry. The permanent three-level regression fails
before/pass after. Unchanged authored imported Parent/Child graphs also match
reference live state, focus, identity, both enqueue orders and fresh escaped SSR.
Native disposal removes listeners on saved detached nodes; official Vue can
still invoke those handlers. No general Vue scheduler/nextTick, synchronous local
DOM timing, getter-count, attrs, slots, event or source-lifecycle parity is claimed.
The optional client props helper adds 172 gzip bytes; SSR is byte-identical.

The combined immutable CLI
`cc2eff277425a7493c34c23280d9c7b13f2d2c85316848022eec73907244e0d0`
passes the permanent **370-module** source gate independently at the primary:
all prior 354 modules plus eight each and eight nested Vue modules, both generated
strict type lanes, no-host resolution, Chromium and fresh SSR.
`/tmp/moonshine-each-vue-root370.log`. Its combined native snapshot passes
**923 tests / 67 nonempty suites**, and CLI module-graph tests pass **14**;
these are snapshot checks, not a full current Rust workspace claim.
`/tmp/moonshine-each-combined-build/` records the archived previous sources,
stable before/after copy hashes, frozen binary and logs.

Final shared runtime checks pass **1,829 tests / 7,964 assertions / 983 files**,
both 25-project type lanes, lint, package/adapter/catalog/size and scoped format
checks. The source-check script itself also passes strict `tsc` and `tsgo`.
Default core stays **3,798 raw bytes**. The unchanged authored SFC counter measures
**29,622 raw / 10,967 gzip9 / 9,956 Brotli11** versus the pinned Svelte workload's
46,692 / 17,389 / 15,652; this is +201 gzip bytes over the previous native counter,
not a speed claim. Bundle SHA
`d54edbdd98b4b9bea94f61f3a0b4fa2ce28b9f1cafe91e770def02b1d3ef3fa9`.
`/tmp/moonshine-each-integrated-counter.json` preserves the exact workload and
runtime/compiler hashes. All changes remain uncommitted and unreleased;
full SFC/rune/component coverage remains unfinished.

The optional authored Solid/native component gate also passes against the same
combined frozen CLI, including its 24 generated positive/assignability-negative
type checks and Chromium/fresh SSR checks:
`/tmp/moonshine-each-final-components.log`. Final scoped formatting and both
repository diff checks pass. Full SFC completion remains unproven.

### Follow-up: lifecycle, shorthand properties and structural scheduling

Native Vue hooks now retain their component context while running mounted and
before-unmount callbacks. Those callbacks can register unmount finalizers;
references publish before mounted callbacks, and disposed owners still reject
registration. Four regressions fail before/pass after. The full runtime suite
at that checkpoint passes 1,833 tests / 7,985 assertions. Source lifecycle
admission is separate and remains pending.

The permanent inventory/browser/SSR gate now passes 378 generated modules,
including eight shorthand-property modules. `__proto__` shorthand must remain
an own data property after lowering, rather than becoming an object prototype
setter. A reference compiler bug for an alias literally named `__proto__` is
recorded separately, without claiming trace parity for that alias.
Audit subsequently found the gate's explicit strict-type entry list omitted the
earlier each and shorthand graphs. Its prior passing type lanes did not prove
those omitted graphs; complete type inventory verification is being repaired.

Flat object each-pattern lowering is integrated in Crepuscularity. Independent
actual CLI proof covers six untouched DOM/SSR graphs, twelve strict type lanes,
eight production browser phases and two fresh SSR requests. Atomic structural
range scheduling puts key reads before row reads while retaining range damage,
SVG and disposal checks. The current focused runtime suite passes 736 tests /
3,599 assertions. Permanent pattern fixtures and combined compiler acceptance
are still pending. Defaults, rest, nested and array each patterns remain outside
this admitted slice.

The reference benchmark now resolves production browser conditions explicitly.
The corrected counter reference is 46,617 raw / 17,344 gzip9 / 15,628 Brotli11;
the corrected list reference is 54,647 / 20,417 / 18,388. Previous reference
numbers above include unpruned environment fallback branches. Their browser DEV
value was falsy, so those timings must not be attributed to extra development
validation. Native list measurements are smaller but slower for full-row updates;
there is no fastest-framework claim. A proposed range move shortcut was rejected
because it offered no reliable win and bypassed damaged-range validation.
Evidence: `/tmp/moonshine-production-reference-audit/HANDOFF.md`,
`/tmp/moonshine-keyed-benchmark/HANDOFF.md`, and
`/tmp/moonshine-each-pattern-shared-proof/`.

The current unchanged authored counter, including atomic structural scheduling,
measures 29,663 raw / 10,988 gzip9 / 9,987 Brotli11: +21 gzip bytes over the
previous native counter. SHA
`881ace25b36450c81fd26f261168cda7eddc340e116161254df8f1ca10f46389`;
`/tmp/moonshine-flat-atomic-counter.json` records the frozen compiler and copied
runtime hashes. Concurrent host load makes these timing samples unsuitable for
a speed ranking. Both 25-project type lanes, lint, package/adapter/catalog/size
and scoped formatting pass. The full runtime rerun with the existing 30-second
timeout passes 1,834 tests / 7,987 assertions / 983 files. The first run's only
failure was the known five-second standalone kernel subprocess timeout; its
isolated rerun passes in 5.47 seconds.

The component-reference cohort's 59 type diagnostics were all authored fixture
typing: undefined reference cells, mounted-state invariants, fixture globals,
and function signatures. Two source fixtures now declare those types explicitly;
their erased scripts preserve the original runtime behavior. Official Svelte
accepts both targets, and the actual CLI's complete DOM/SSR graphs pass both
strict checker lanes with all existing browser/SSR assertions unchanged.
This does not establish inferred component-export metadata on the generated
component type. The repaired permanent gate still needs final integration.

The new minified flat-pattern browser check caught a Bun 1.4 minifier bug:
`(0, fields.tag)` as a template tag loses its unbound receiver after minification.
Unminified proof is insufficient for this case; a minification-safe compiler
emission is required before the new permanent flat-pattern slice is admitted.

### Integrated flat object patterns and strict inventory repair

The tag-only emission fix now returns the function through an immediately called
getter. Unlike the comma expression, Bun 1.4 preserves its unbound receiver when
minifying. The primary independently verifies four cases (success and getter,
argument or tag errors) across official/native and minified/unminified browser
builds. Getter evaluation happens once, before interpolation; inferred types are
retained. Other rune/prop/snippet tag paths already use a safe identity helper.

The permanent **396-module** gate passes independently with frozen compiler
`b89783ebb64d68192bd422b712f73108536db84f7deffabcadf816a5f2d2a11e`.
All earlier 378 runtime assertions remain, plus renamed flat aliases, live index,
same-key item replacement, member binding, retained input identity, exact getter
and callback traces, two instances and two fresh SSR requests. Source graphs
remain untouched after compilation and resolve no host runtime.

Strict checks now discover emitted TypeScript modules automatically: **298
modules pass both checker lanes**. An explicit ledger records **24 legacy entry
graphs** with outstanding source typing; new graphs cannot silently escape the
inventory. Typed component-reference and checked/value/range sources removed
eight exceptions without changing runtime code or assertions. Historical claims
that passing checker commands covered every emitted graph were too broad.
The gate script itself passes both strict checker lanes, formatting and lint.
Evidence: `/tmp/moonshine-flat-each-root396.log`,
`/tmp/moonshine-flat-each-admission/HANDOFF.md`, and
`/tmp/moonshine-each-nested-review/root-tag-proof.log`.

Nested static object patterns and plain module-script source admission are under
independent verification. Defaults/rest/array each patterns and module-level
runes still need implementation; full SFC/rune/component coverage is unfinished.

Nested static object projection is now integrated in Crepuscularity after
primary review. It collects leaf symbols and static paths iteratively, leaving
reads uncached and retaining the original key/SSR destructuring patterns. There
is no runtime addition. The primary independently passes twelve generated strict
type lanes, eight minified browser phases and two fresh SSR requests; the
existing permanent 396-module gate also passes with frozen compiler
`60be7204a528d1ceeca6c880a570e172c7ad65d194df46d74bc32fcdc607e931`.
Five new native source tests, eighteen source rejection cases and twelve
negative type lanes cover the bounded nested slice. Permanent nested source
fixtures remain pending; defaults, rest, arrays, numeric/computed keys and direct
alias writes are still explicit diagnostics. Evidence:
`/tmp/moonshine-each-nested-review/HANDOFF.md` and
`/tmp/moonshine-nested-root396.log`.

Plain module scripts are now admitted in the permanent **404-module** gate,
independently passed by the primary against the same frozen nested compiler.
Both `module` and legacy `context="module"` syntax preserve named exports,
one module execution, shared state across four independently updated instances,
module/instance shadowing, input identity/focus/caret and cleanup. Two fresh SSR
requests share the module cache while keeping instance state and escaping
correct. Both strict lanes cover 306 emitted TS modules; the 24 legacy exception
graphs remain explicit. Module-level rune rejection is now a permanent actual
CLI assertion on both targets, including absence of output artifacts. Ordinary
module proof does not establish legal module-rune support. Evidence:
`/tmp/moonshine-module-root404.log` and
`/tmp/moonshine-module-script-admission/official-paired.log`.

The combined permanent gate now passes **424 modules** against frozen `60be`:
all earlier 404 assertions, eighteen nested-pattern modules and two type-only
helper companions. The final 24 type exceptions were source fixture debt and
are resolved. All **420 emitted TypeScript modules** now pass both strict
checker lanes automatically; the exception machinery and redundant manual entry
list have been removed. Existing negative caller assertions remain.

Nineteen typed Svelte fixtures preserve their erased runtime scripts exactly
and compile directly with the official client/server compiler. An imported
type-only declaration helper types event-props globals without changing the
original call expression or introducing preprocessing/runtime imports. That
expression matters to the compiler's eager/lazy prop policy. The primary
reconstructed the prior files from the reviewed patch and independently checked
all nineteen erasures and both official compilation targets.

The primary additionally passes nine focused Rust pattern tests against a copy
whose each-lowering source hash matches the live file, and 45 CLI graph tests /
122 assertions. These are scoped compiler checks, not proof of the current full
Rust workspace. Main runtime remains at its unchanged 1,834-test checkpoint;
subsequent changes affect compiler lowering, source fixtures and acceptance
tooling. Evidence: `/tmp/moonshine-full-typing-root424.log`,
`/tmp/moonshine-full-typing-root-source-validation.log`,
`/tmp/moonshine-nested-root-rust-tests.log`, and
`/tmp/moonshine-full-typing-root-cli.log`. Full source compatibility, module-level
runes, remaining pattern variants and a fastest-framework claim remain unproven.

The next CSS audit found an actual fail-open boundary in frozen `b897`: scriptless
Vue SFCs accept plain/scoped/global style blocks through the ViewIR fallback and
discard them. Chromium renders the reference scoped example red with a scope
attribute, while native output is black with no stylesheet or scope attribute.
Authored Vue setup components and Svelte styles reject; that narrower rejection
must not be described as an all-frontend guarantee. The Crepus peer has the
cross-dispatch guard request. Actual style support still requires inventoried CSS
assets, target-consistent scoping and reference proof; a rejection guard alone
will not complete it. Moonshine already has route stylesheet delivery, so the
proposed consumer contract reuses that path without a runtime injector.
Evidence: `/tmp/moonshine-sfc-css-audit/HANDOFF.md` and `browser.log` beside it.

### Bounded module runes integrated

The reviewed compiler now lowers module state/raw state, snapshots and private
derived values across the complete component module. Resolved export validation
rejects reassigned state and all derived exports; stable exported state exposes
the actual value/proxy, not a private cell. Component placement guards remain.
SSR cache policy is per declaration: module derived reads recompute, component
derived values cache. Module state persists across requests and component
disposal/remount; it must not be represented as request-local state.

The primary independently compiles untouched DOM/SSR graphs, runs both strict
checker lanes and matches nine minified production browser phases plus two
parsed SSR requests with exact computation/cleanup traces. Six illegal export
and props cases retain existing output on failure. The existing 424-module /
420-strict gate also passes with its old now-legal module-state rejection
replaced by an actually illegal reassigned state export. The no-output assertion
is retained. Seven new source tests and the copied native suite pass 939 tests /
72 suites; this predates later peer Vue changes and is not a current complete
Rust workspace claim. Ordinary counter generated graphs remain byte-identical.

Frozen compiler:
`8714f81a67806b2b56f716a1c60311f9f441223c47882936cb8af312b641ab54`.
Evidence: `/tmp/moonshine-module-runes-prototype/HANDOFF.md`,
`/tmp/moonshine-module-runes-root-paired.log`, and
`/tmp/moonshine-module-runes-root424.log`. Async module factories remain
explicitly unsupported despite being legal in the reference; permanent positive
module-rune fixtures and a fresh combined Vue/Svelte snapshot are pending.

The fresh combined compiler is now frozen at
`d6c852b120f525a49fa3697184c7e904ae391adec40bda3bb15afd6471a1f167`.
Its 384-file core/native/CLI copy has equal live-before, copied and live-after
hashes. The copied native suite passes **966 tests / 80 suites**, plus **33 CLI
module tests**. Later peer edits remain separate from this snapshot.

The primary passes the final **438-module / 434-strict-TS** permanent gate with
that compiler. It preserves all earlier acceptance assertions and now includes
positive module-rune lifetime/snapshot/SSR cache proof and authored Vue lifecycle
imports. Named/aliased mounted/before/unmounted hooks restore component context,
support nested registration, observe connected/disconnected phases and suppress
callbacks in fresh SSR. Two instance counters remain independent. Native failed
mount cleanup is asserted separately from Vue's error-handler retention policy;
template refs and general Vue scheduling/error parity remain unclaimed.

Scriptless Vue plain/scoped/global styles now reject through this compiler, with
six permanent actual CLI cases preserving previous output. That closes the
observed entry fallback loss; CSS support itself is not yet admitted. The CSS
consumer/producer remain isolated prototypes. All script checker lanes, scoped
format/lint and diff checks pass. Main runtime code has not changed since the
1,834-test checkpoint. Evidence: `/tmp/moonshine-module-runes-root438.log`,
`/tmp/moonshine-vue-lifecycle-root432.log`, and
`/tmp/moonshine-combined-module-runes/HANDOFF.md`.

### Disposed derived first reads

Unread derived values may complete once after their owner stops, without
resubscribing or tracking the caller. Six regressions cover retained values,
frozen failures, dependency writes, ownership guards, overrides, cleanup history
and reentrant reads. Native failures remain errors; Svelte 5.57.1 swallowing
some disposed computation failures is deliberately not reproduced.

The primary passes 1,840 tests / 8,011 assertions, both project typecheck lanes,
the 438-module SFC gate, lint, manifests, adapters, catalog and core size checks.
The unchanged authored counter now measures 29,916 raw / 11,066 gzip9 / 10,050
Brotli11 bytes, adding 78 gzip bytes. Default core remains 3,798 raw bytes.
Evidence: `/tmp/moonshine-disposed-derived-root-all-tests.log`,
`/tmp/moonshine-disposed-derived-root438.log`,
`/tmp/moonshine-disposed-derived-counter.json`. Async factory compiler support
remains isolated pending actual source acceptance.

### Plain Vue CSS asset delivery

Two authored Vue fixtures extend the permanent gate from 438 to 458 generated
modules, with six separately inventoried CSS assets. Each asset is preserved
byte-for-byte through publication, and generated CSS declarations participate
in both strict TypeScript checks. Browser tests load the normal Bun stylesheet,
verify six exact colors across repeated parent/child instances and one sheet,
then dispose the mounted components. Two fresh SSR requests verify escaping.

The primary additionally exercises actual `buildProject` → manifest → request
handler delivery: styled routes have one working stylesheet; unstyled and
whitespace-only style routes have none. Consumer validation tests cover unsafe
paths, duplicates, symlinks, unlisted imports and prior-output preservation.
Scoped/module styles and external CSS features remain explicit errors; Bun's
parser recovery is not PostCSS validation parity. No runtime style injector or
new dependency was added.

Evidence: `/tmp/moonshine-css-root458.log`,
`/tmp/moonshine-css-consumer-root-tests.log` (48 tests / 131 assertions),
`/tmp/moonshine-css-root-route-proof.log`. This source gate used frozen a919c458;
the newer shared parser's integrated snapshot is still being verified.

### Module async and generator rune factories

The primary passes the expanded **464-module / 460-strict-TS** source gate with
frozen ee16c871. Seven authored module factory cases cover async declarations,
arrows, generators, async generators, state/raw state, snapshots and derived
values before and after pauses. Production Chromium and fresh SSR factory
records match the pinned reference. Derived caching follows the creation
context; this does not implement asynchronous SSR component rendering.

At this historical checkpoint, instance and companion placement restrictions remained enforced. Eight illegal
export/instance/props cases reject and preserve previous output. A separate
authored failure factory keeps the native frozen-error policy, explicitly
differing from the reference's swallowed error. Evidence:
`/tmp/moonshine-async-root464.log`,
`/tmp/moonshine-module-async-compiler-review/HANDOFF.md`. The combined compiler
with newer shared parser changes still needs its integration snapshot checks.

The primary also reran the full 464-module / 460-strict-TS gate on combined
compiler `38eb6e140a4f94cdb4726cdf19f8f0967ff27507ebb1659019d86878a208cc6c`,
including the newer shared Vue parser and CSS metadata boundary correction.
The stable 395-file / nine-root snapshot matches before/copy/after; 980 native,
36 CLI, 60 Vue parser and five metadata tests, Clippy and build pass.
Evidence: `/tmp/moonshine-combined-root464.log`,
`/tmp/moonshine-css-slots-combined-final/`. Static Vue slots remain under
source acceptance; a new prop-refresh test exposed a transient-owner cache
regression in their optional runtime, which is being corrected before admission.

### Static default Vue slots and consumer context

The primary passes **474 generated modules / 470 strict emitted TS modules**
with frozen context compiler `59234a43acd93b103a748c38b513b2717020824eb2281631e030c786bc9035dd`.
Three permanent authored Vue fixtures cover implicit default bodies, two outlets
per instance, lazy fallback, child-provided injection overriding a conflicting
parent, live lexical values, child prop refresh, retained leaf state/nodes/focus,
disposal and two fresh escaped SSR requests. Named/aliased provide/inject
imports resolve to the existing independent native context helper.

The source fixture fails on the original slot helper: refreshing a declared
child prop destroys cached leaf text and stops a leaf early. DOM slot factories
now use an existing attached component scope under the consumer owner, retaining
content across transient reads and rolling back failed factories before retry.
SSR keeps its current invocation/attempt owner. The helper adds no component
frame; thirteen tests cover error preservation, retry, frozen props descriptors,
late callbacks and disposal during factory execution.

Native granular effects skip unrelated fallback-call reruns: the reference
Vue 3.5.13 trace has ten records after the update; native has eight. Both exact
traces and identical UI are verified separately. This is an explicit component
job scheduling gap, not full Vue compatibility. Named/scoped/dynamic slots,
component events, attrs fallthrough and template refs remain separate work.

Full runtime verification passes **1,856 tests / 8,101 assertions / 986 files**,
both 25-project typecheck lanes, lint, manifest/adapter/catalog/size checks and
scoped formatting. The default signal core remains 3,798 raw bytes. Evidence:
`/tmp/moonshine-slots-root-all-tests-green.log`,
`/tmp/moonshine-slots-root474.log`,
`/tmp/moonshine-vue-slots-prototype/context/native-before.log`,
`/tmp/moonshine-vue-slots-prototype/context/native-fixed.log`.

### Explicit global Svelte CSS

The primary passes **490 generated modules / 486 strict emitted TS modules**
with frozen compiler `d825f9d50d5bb2418c81e75a0d61ae03ce4ed70d1a00386a17b2e00227c015d3`.
Two permanent authored fixtures extend the source gate without dropping existing
assertions. Ten CSS assets are inventoried across the complete gate; transformed
CSS and generated declarations survive publication byte-for-byte. Production
Chromium verifies normal stylesheet links, colors both inside and outside the
components, independent state, retained dirty input/focus/caret and cleanup.
Fresh escaped SSR matches official parsed HTML; native void-tag spelling differs.

Core parsing exposes an explicit style-aware entry carrying raw CSS; ordinary
parser entries retain their rejection. Native compilation uses optional MIT
Raffia 0.13.0 plus its MIT macro crate to validate full CSS syntax and remove only
parsed global-wrapper spans. The browser receives external styles, with no new
runtime package or injector. The original counter graphs remain byte-identical:
DOM three files / 3,688 bytes; SSR three files / 2,625 bytes.

Local/mixed scope, keyframes/at-rules, preprocessing, escapes and external
references remain errors. Raffia lacks a recursion limit: a separate hostile
input subprocess overflows on 500 nested selectors. The current adapter rejects
more than 256 opening delimiters before parsing and uses an existing bounded
8 MiB stack. This conservative guard also counts literals/comments; it is a
known large-stylesheet limitation, not full CSS coverage. Actual functional
pseudo-element probes preserve the reference's unchanged inner arguments.

Evidence: `/tmp/moonshine-global-css-root490.log`,
`/tmp/moonshine-svelte-css-prototype/HANDOFF.md`,
`/tmp/moonshine-svelte-css-prototype/counter-cmp.log`. Rust focused metadata,
original Svelte parser, CSS tests, Clippy and locked dependency checks pass in
the isolated build; a fresh combined native snapshot remains pending other
compiler work. The Moonshine runtime stays at the verified 1,856-test checkpoint.

## Typed Vue events and companion placements: combined checkpoint

The primary passed **518 generated modules / all 514 emitted TypeScript modules strict** with frozen compiler `1bdffae66fbd8e4a192e5ec111c89cbb4641910c50b53a7e4bfa2b318b169c11`. All previous 490-module assertions remain, with four authored Vue event fixtures adding regular/once and kebab listeners, declared props excluding callbacks, typed emit-only children, two instances, retained focus, disposal and fresh escaped SSR. Thirty unsupported event/component attribute cases preserve previous output. Production browser checks and both strict checkers pass. SSR regular/once callback merging intentionally follows the reference server compiler. Native immediate DOM updates and error routing remain different from Vue scheduling.

Companion `.svelte.ts`/`.svelte.js` modules now share the existing module export law: private top-level cells and factories before/after async or generator pauses are accepted; reassigned state and derived exports reject. A real imported SFC/companion proof passed both strict checkers, production Chromium and fresh SSR; class-field runes, companion snapshots and other unsupported forms still reject. The permanent gate replaces the obsolete stable-export negative with a reassigned-export negative while retaining output-preservation assertions. Positive companion placement fixtures now have permanent admission at the 528-module checkpoint below.

Full native compiler suite: 1,018 tests passed; relevant CLI suites passed 36 tests, focused core checks passed 41, and native/CLI Clippy passed. A broader web CLI run has two environment failures because its spawned WASM builds lack the installed target; its other 27 tests passed. Full Moonshine runtime: 1,863 tests / 8,115 assertions passed; both 25-project typecheck lanes passed. Default signal core remains 3,798 raw bytes. Evidence: `/tmp/moonshine-root-combined518.log`, `/tmp/moonshine-companion-placement-review/native-full.log`, `/tmp/moonshine-events-root-all-tests.log`. Full SFC coverage, hydration and a fastest-framework claim remain unfinished.

Class-rune follow-up probes against actual Svelte 5.57.1 confirm public/private fields, first constructor assignments, inheritance and method-local factories. DOM public rune fields become non-enumerable accessors, while SSR public state remains an enumerable ordinary field. Private brand initialization must remain source-ordered. Static/computed fields and invalid duplicate/constructor assignments reject. These are reference compiler observations, not native support; native class-field source guards remain. Evidence: `/tmp/moonshine-class-rune-root/reference.log` and `/tmp/moonshine-class-rune-root/PLAN.md`; [official class-state documentation](https://svelte.dev/docs/svelte/$state#Classes).

## Permanent companion placements: 528-module checkpoint

The primary passed **528 generated modules / all 522 emitted TypeScript modules strict** with the same immutable `1bdffae6` compiler, production Chromium and fresh SSR. Three authored inputs import actual typed and JavaScript companion modules: stable exported object/primitive state, private top-level state/derived, default getter privacy, and async/arrow/generator/async-generator factories before and after pauses. Two component instances deliberately share the module singleton while paused factories stay independent. Browser assertions retain node/focus, finish factories after disposal and verify frozen/live creation-context behavior; two fresh server renders retain the reference cache behavior and escaped IDs. All previous 518-module assertions remain. No runtime or default-kernel change was needed. Evidence: `/tmp/moonshine-root-companion528.log`; paired official/native evidence: `/tmp/moonshine-companion-placement-review/admission/paired.log`.

Replacement audit at this checkpoint: Solid and Svelte package manifests have no host runtime peer. Vue still exposes optional legacy `/vue` and `/compiler-sfc` host re-exports; Angular `/core`, Astro `/compiler`, and Nuxt `/vue` also import their hosts. Those remain incomplete replacements. Native source proofs never justify aliasing arbitrary precompiled host output onto these helpers. Removing the remaining host entries requires independent behavior and compiler contracts, rather than deleting functionality or claiming their optional peers have already been replaced.

## Bounded local Svelte CSS

Reviewed local scope lowering is now integrated in Crepus. One validated Raffia parse classifies styles; Oxc identifies authored intrinsic elements before component/control lowering. Only possible selector participants get a target-independent scope class, and compile-only markers never reach public props or DOM. Dynamic classes use the existing optional `/class` helper once per evaluation. Components without styles perform no scope hash work; their DOM/SSR graph bytes remain unchanged. No CSS injector, browser dependency or signal-kernel change was added.

The primary independently compiled fresh App/Child/Helpers graphs, passed all 12 strict type lanes and 18 invalid-source preservation cases, and compared production browser/parsed fresh SSR against Svelte 5.57.1. Checks include dynamic arrays/objects/empty/false/null/whitespace class values, selector specificity, unrelated elements with no class attribute, opaque child/raw HTML boundaries, global prefixes/suffixes, dirty input focus/caret, keyed-row identity, if/each/snippet scope propagation and disposal. Compiler b27e passed the primary 528-module / 522-strict-TS regression, 1,034 native tests, 17 CLI graph tests and Clippy. Permanent positive CSS fixtures are admitted at the 556-module checkpoint below.

The accepted selector slice covers ordinary type/class/id/universal compounds and bounded combinators with global prefix/suffix forms. Pseudo/attribute selectors, nesting, at-rules/keyframes, complex global placement, intrinsic spreads and uncertain relational branch/slot cases still diagnose; unused-selector diagnostics are unfinished. Existing CSS complexity/external-reference guards remain. Evidence: `/tmp/moonshine-root-local-css-{source,types,negative,paired-focus}.log`, `/tmp/moonshine-root-scoped528.log`, `/tmp/moonshine-local-css-scope-review/HANDOFF.md`.

## Current list performance investigation

An isolated sequential 1,000-row source-list benchmark with the accepted compiler/runtime and pinned production Svelte measured median/p95 milliseconds: native startup 47.5/56.4 versus 19.2/23.9; prepend 15.4/18.3 versus 3.0/3.7; rotate 15.5/18.2 versus 2.0/2.6 (three warmups, 15 alternating paired samples). Input/focus/local state, keys, lifetimes and disposal checks passed. These timings describe this workload and machine, not a general ranking. A lazy immutable ancestry-cache prototype was rejected: ABA/BAB batches did not show a stable benefit or p95 improvement, while retaining about 118 KB more heap for 1,000 rows. It was never applied to the shared runtime. Profiles and exact result hashes are retained in `/tmp/moonshine-current-list-profile/`; the signal core remains unchanged.

## Permanent scoped CSS: 556-module checkpoint

The primary passed **556 generated modules / all 550 emitted TypeScript modules strict**, production Chromium and fresh SSR with frozen b27e. The unchanged earlier static parent/child CSS fixtures now compile, alongside three new authored dynamic/opaque-child/if-each-snippet fixtures. The complete stylesheet inventory contains 16 assets (previous 10 plus six); exact published CSS/declaration bytes, target-independent hashes, compile-only marker erasure and absent normalization imports for static components are asserted. All prior 528-module assertions remain. Twenty new unsupported-style rebuilds preserve prior facades. The permanent browser checks retain dirty input/caret/focus and keyed row identity, enforce component/raw HTML boundaries, compare specificity against an application rule, and check two instances/cleanup and escaped parsed SSR. Evidence: `/tmp/moonshine-root-local-css556.log`; exact pinned-reference renamed-source proof: `/tmp/moonshine-local-css-admission/proof/paired.log`.

A subsequent stress check found and fixed exponential ancestry-path enumeration. The matcher now caches successful and failed prefix/node states, still visiting every candidate ancestor so all participating elements retain scope classes. The primary passed 24 CSS parser/Oxc tests, including an actual evaluation-count bound and multiple qualifying ancestors. Actual combined compiler `373e9efe` compiled the previously slow 24-level/12-part and 32-level/16-part inputs in about 28–33 ms in both targets; both previously exceeded a two-second subprocess deadline. All six stress graphs have exact participant counts, specificity and matching DOM/SSR CSS bytes. All 28 generated files of the existing App/Child/Helpers proof remained byte-identical before/after the fix. These are bounded compiler-path measurements, not framework speed comparisons. Evidence: `/tmp/moonshine-root-css-complexity-path`, `/tmp/moonshine-root-css-dp-path`, `/tmp/moonshine-root-css-matcher-tests.log`, `/tmp/moonshine-root-local-css-dp-source.log`.

## Vue normalization and bounded CSS matching: 564-module checkpoint

Crepus now preserves class/style literal provenance for native Vue compilation. Declared component props use the optional Moonshine `/normalize` helpers; static classes preserve internal non-HTML whitespace, static style declarations become records, and dynamic DOM versus SSR values retain the reference distinctions. Native reactive style objects clone while plain object identity survives. Compiler imports are demand driven; ordinary Vue graphs remain byte identical. Safe own-data `__proto__` merged keys intentionally differ from Vue's prototype setter. Intrinsic dynamic attributes and undeclared fallthrough remain unsupported.

The primary independently recompiled fresh source graphs against current MAIN packages, with no prototype helper overrides. Actual Vue 3.5.13 comparisons passed the full Unicode/falsy/constant-alias/proxy matrix and narrow declared class/style types, both strict checkers for both targets, production Chromium state/focus/identity/disposal and two fresh SSR renders. Evidence: `/tmp/moonshine-root-vue-normalization-{matrix,narrow}.log`.

The permanent source gate now passes **564 generated modules / all 558 emitted TypeScript modules strict**, production Chromium and fresh SSR. It retains every previous 556-module assertion and adds real 32-node/16-descendant CSS graphs for both targets, exact stylesheet publication/declarations, all participant markers and computed styles. Prefix matching memoizes actual selector/node states; its unit regression bounds evaluation counts instead of imposing a timing threshold. Evidence: `/tmp/moonshine-root-combined564.log`.

Combined compiler checks passed 410 core, 1,047 native and 38 relevant CLI tests plus native/CLI Clippy. Current Moonshine checks passed 1,868 tests / 8,155 assertions across 988 files, both 25-project typecheck lanes, lint, package/adapters/catalog policy and size. The default signal bundle remains 3,798 raw bytes. Full SFC coverage, scheduler/hydration compatibility and a fastest-framework claim remain unfinished.

## Permanent Vue normalization: 592-module checkpoint

Four authored Vue fixtures now extend the complete gate to **592 generated modules / all 586 emitted TypeScript modules strict**. The primary passed every previous 564-module assertion, exact fresh SSR for narrow typed class/style props and Unicode/falsy/proxy policies, and production Chromium updates, independent instances, identity/focus and cleanup. Fourteen new unsupported intrinsic/combined/ref/key rebuilds preserve existing output bytes. No generated output or prototype helper overrides are used. Evidence: `/tmp/moonshine-root-combined592-pre-pseudo.log`.

Scoped CSS state predicates and generated content are now integrated in Crepus: 16 bounded nonfunctional state names plus `::before`/`::after` and legacy single-colon forms, with ASCII case preserved. Scope anchors precede pseudo elements and follow the last ordinary simple selector; state changes do not incorrectly prune possible participants. Structural/functional selectors, at-rules and complex global placement remain explicit unsupported variants. The primary independently passed actual CLI graphs under four strict lanes, production Svelte 5.57.1 browser/fresh parsed SSR comparisons and 28 invalid-source facade-preservation cases. Combined native checks passed 1,071 tests, 38 relevant CLI tests and Clippy. Existing 28 local CSS graph files and the unstyled counter remain byte identical. Evidence: `/tmp/moonshine-root-css-pseudo-{compile,types,paired,negative}.log`. The primary also passed the full combined 592-module / 586-strict-TS gate with this newer compiler, including all browser and fresh SSR assertions (`/tmp/moonshine-root-combined592-pseudo.log`). Permanent positive pseudo fixtures remain pending.

## Permanent CSS states: 602-module checkpoint

The primary passed **602 generated modules / all 596 emitted TypeScript modules strict** against frozen dfdf, retaining all previous 592-module assertions. One authored Svelte fixture adds ten graph modules and two CSS assets (20 total): exact CSS/declaration publication and DOM/SSR hash agreement, uppercase/legacy pseudo spelling, actual hover/focus/checked/disabled/required/readonly behavior, pseudo-element specificity, opaque child/unrelated element boundaries, dirty input identity/focus/caret, independent instance state and disposal. Fresh parsed SSR and two escaped requests pass. Evidence: `/tmp/moonshine-root-combined602.log`; exact pinned-reference proof: `/tmp/moonshine-css-pseudo-admission/proof/paired.log`.

The optional Vue `/props` helper now accepts finite Boolean cast metadata, with 42 focused tests / 263 assertions and the complete 1,876-test / 8,233-assertion runtime suite passing across 989 files. Both 25-project typecheck lanes pass. This initial runtime checkpoint predates the split below. Boolean source lowering is now integrated with fresh primary proof; permanent positive admission remains pending. Actual Vue 3.5.13 comparisons distinguish absent versus explicit undefined, Boolean/String union order, raw alias precedence, mixed property order, inherited initial values, refresh and cleanup. `withDefaults` remains unsupported.

The first Boolean metadata implementation grew a fixed minimal ordinary props consumer from 6,375 raw / 2,571 gzip9 / 2,373 Brotli11 to 6,765 / 2,754 / 2,536 bytes. The reviewed split now emits 6,425 / 2,590 / 2,393: 164 gzip bytes recovered, with a residual 19 gzip bytes over the original. Boolean helpers are separate exports on the same `/props` entry, sharing the existing private queue/cores; ordinary imports exclude the resolver. These are scoped bundle comparisons, not application timing results. The default signal kernel remains 3,798 raw bytes. Evidence: `/tmp/moonshine-root-props-size-main-split.log` and the directory recorded in `/tmp/moonshine-root-props-size-path`.

## Boolean source lowering and opt-in runtime split

Crepus now lowers finite direct/imported/inherited Boolean-bearing props with ordered cast metadata and demand-selected native helpers. Literal empty/name inputs and declared ASCII hyphen aliases retain reference behavior while keeping narrow public caller types. Primary fresh MAIN-package proofs passed inline/imported graphs plus setup type probes under both strict checkers for both targets, eight browser records with retained nodes/sibling isolation/cleanup, two fresh sets of eight SSR cases, and typed Parent-to-Child alias/literal source comparisons (five browser / ten SSR records). Ten unsupported cases preserve no initial output and previous facades on both targets. No generated output edits or prototype helper replacements were used. Evidence: `/tmp/moonshine-root-boolean-{inline,imported,alias,negative}.log`.

Final compiler 344ac844 passed 1,083 native tests, 38 relevant CLI tests and Clippy. Eight ordinary source graphs (38 files) remain byte identical to the previous compiler. The primary combined **602-module / 596-strict-TS** gate also passes with the new compiler and current split helpers (`/tmp/moonshine-root-combined602-boolean.log`). Permanent Boolean-positive fixtures are being prepared separately.

Remaining Boolean variants diagnose: conflicting canonical/alias inputs, duplicate/intersected declarations, unresolved value types, mixed literal-hyphen declared names, reserved Boolean id/class/style props and non-ASCII nonempty name-literal casts. `withDefaults`, full readonly/LooseRequired macro typing and Vue render-job semantics remain unfinished. Defaults research confirms that raw factory mutations refresh Vue render output without notifying a prop watcher; native granular prop cells need a distinct render refresh/abort contract before claiming equivalent general factories.

Current split helpers pass both 25-project typecheck lanes, scoped lint/format and the full source gate. One full attempt had 1,875 passes and a standalone kernel timeout; that unchanged test passed in isolation in 1.9 seconds. The subsequent complete rerun passed **1,876 tests / 8,233 assertions across 989 files** in 117.44 seconds. Evidence: `/tmp/moonshine-root-boolean-split-all-tests-recheck.log`; the earlier timeout log is retained.

## Interface order correction

Exact renamed imported-source admission caught an inherited-prop ordering bug: the earlier imported proof had incorrectly compared an inline reference snapshot. Actual Vue source options enumerate own interface fields before bases, including ordinary non-Boolean interfaces. Browser and SSR probes confirm own/base, own/a/b and own/a/shared/b for single, multiple and diamond inheritance. The shared finite resolver now uses that order for all interfaces, with precise unit/golden corrections. This intentionally changes affected generated metadata rather than preserving incorrect bytes. A rebuilt combined compiler and exact imported-source admission are pending; the previous imported proof does not establish enumeration parity. Evidence: `/tmp/moonshine-vue-boolean-admission/interface-order-reference.log`, `/tmp/moonshine-vue-interface-order-fix/interface-order.patch`.

## Boolean admission and structural CSS: verified checkpoint

The primary passed **630 generated modules / all 624 emitted TypeScript modules strict**, production Chromium and fresh SSR against immutable compiler `52a7da6f`. All previous 602-module assertions remain. The exact renamed Boolean fixtures separately pass the pinned Vue reference: 42 fresh SSR records, two type probes and 21 Chromium records including focus, sibling independence, bounced updates and disposal. Imported interface metadata now follows own members before base members; an earlier imported proof used an inline reference and did not establish that ordering. Evidence: `/tmp/moonshine-root-combined630-context.log` and `/tmp/moonshine-root-boolean-admission-reference.log`.

Bounded structural CSS is integrated: first/last/only child and of-type, empty, and four validated nth selectors. Potential participants retain scope across changes; nth argument bytes remain unscoped. The primary separately passed actual CLI output through both strict checkers, production browser and parsed SSR, plus 38 invalid-source guards. This is one app with keyed rows; it does not establish arbitrary relational selector or multi-app coverage. Permanent positive structural fixtures are still being prepared. Evidence: `/tmp/moonshine-root-css-structural-{types,paired,negative}.log`.

The optional DOM `/rotating-text` helper provides owned timers, initial/live reduced-motion behavior and disposal without adding to the default entry. Four unit tests and an actual browser proof cover two independent timers, retained text/input identity and cleanup. Compiler migration from inline rotation logic remains pending. A shared component-consumer fix also prevents disposed owner contexts from being restored after callbacks return or throw. The latest full runtime checkpoint passes **1,881 tests / 8,268 assertions**, and both project TypeScript lanes pass. Evidence: `/tmp/moonshine-root-rotation-context-all-tests.log`.

Vue defaults remain research-only: the isolated render-epoch prototype cannot abort component DOM updates caused by unrelated reactive writes during a failing default factory. Class rune receiver, brand and constructor semantics are under reference investigation. Neither feature has full source admission.

## Permanent structural CSS admission: 640 modules

The primary passed the final authored `toReversed()` fixtures in **640 generated modules / all 634 emitted TypeScript modules strict**, production Chromium and fresh SSR using immutable compiler `52a7da6f`. All previous 630-module assertions remain. The additional ten files include complete DOM/SSR component graphs, CSS assets and declarations. Exact CSS bytes, scope hashes, foreign sibling boundaries, keyed node identity, dynamic emptiness, conditional removal/remount and disposal are checked. Two fresh SSR requests match; parsed SSR also applies the expected styles. This fixture uses one app with keyed rows, not independent app instances. Evidence: `/tmp/moonshine-root-combined640.log`; exact pinned-reference rerun: `/tmp/moonshine-css-structural-admission/proof/paired-reversed.log`. Both gate-script strict checkers, scoped lint/format and diff checks pass.

## Shared rotation runtime: actual generated-caller proof

Crepus now emits the optional DOM rotation import instead of inline timer code. The primary copied a stable executable (before/copy/after SHA `e8f602f35276db763c498be5d4cca88c000bf2a94da8bbca51da816d30ae0b23`) and compiled an unchanged authored slot-rotate/input source into DOM and SSR graphs. Both strict checkers, two fresh SSR requests with timers forbidden, and minified Chromium passed. Browser checks cover two instances, initial/live reduced motion, independent timers, retained text node and dirty input focus, and complete disposal. SSR imports no browser rotation helper. This focused caller proof is separate from the full 640-module gate on `52a7da6f`; it does not establish full current-compiler regression coverage. The first browser harness failed because its observer queried an element after disposal; retaining the observed element fixed that harness, with no product change.

The fixed single-component browser consumer costs **13,836 raw / 5,546 gzip-9 / 5,006 Brotli bytes** inline versus **13,876 / 5,572 / 5,014** with the import. Two distinct generated component modules cost **14,689 / 5,571 / 5,013** inline versus **14,185 / 5,584 / 5,026** imported. Sharing saves raw code across modules but is not a compressed-size win in these workloads. Default core remains unchanged; no timing claim follows. Evidence: `/tmp/moonshine-root-generated-rotation-{browser-final,ssr,size-pair}.log`; complete artifact directory is recorded in `/tmp/moonshine-root-generated-rotation-path`.

## Directive source ordering: remaining compiler boundary

Actual pinned production Svelte probes show why the existing directive helpers alone do not prove source support. Same-template child and parent action updaters see the old DOM before grouped template updates. Keyed row blocks instead complete their own action/DOM work before the outer parent's updater, in live keyed order. A render-first wrapper sees new DOM; ref-first sees a child's new DOM too early. Moving updater jobs to the existing pre phase, including a captured caller scheduler, still fails keyed block ordering even though all 15 existing directive tests pass. No such counterfactual is integrated. Source lowering requires a template/block registration seam; a global action-pre queue would be incorrect. Exact reference and rejected alternatives: `/tmp/moonshine-directive-source-design/PROPOSAL.md` and `verify-rows.py`.

## Further source acceptance findings

The isolated public-class compiler pass has a pinned production browser comparison covering inheritance, initialization order, descriptors/enumeration, callable/tag receivers, updates, derived overrides, two instances, retained focus/caret and disposal. The strengthened SSR proof asserts each serializer's expected output and compares model keys/cleanup across fresh requests. Primary review found two type-preservation requirements before admission: explicit macro generics must survive lowering independently of a field annotation, and zero-argument state generics include undefined on both DOM and SSR. The implementation remains isolated pending the final typed source matrix and full native/CLI checks. The initial full native library run exposed an obsolete public-class rejection test (592 pass, one fail); its precise replacement retains private/constructor/static rejection coverage. No class source support is admitted by this research entry.

The directive investigation found a smaller update seam: explicit typed node handles, platform append for static structure, existing directive installers, and the existing render effect registered at each template/block end. The unchanged helper matches the full static Order trace. Nested keyed-range cleanup still removes descendants before a detached parent's destroy callback reads them; production Svelte retains those descendants. A bounded ownership/retention design is being prototyped; connectivity heuristics and skipping resource cleanup are rejected. Evidence: `/tmp/moonshine-directive-source-design/PROPOSAL.md`.

Actual Vue production error probes distinguish interpolation evaluation from DOM patching: an interpolation error replaces the component subtree with a comment, then a later valid update recovers; attribute coercion errors during patching can leave partial DOM. A general transactional rollback would exceed the reference requirement. The isolated defaults scheduler matches tested success, failure, reentrant refresh, intermediate synchronous watcher reads, independent descendant updates and lifecycle readiness, but source admission still needs the scoped error policy and expression-fallback behavior. Evidence: `/tmp/moonshine-vue-error-policy-reference/{Render.vue,check.ts,results.json}` and `/tmp/moonshine-vue-defaults-component-jobs/HANDOFF.md`.

## Public class fields admitted: 646-module checkpoint

The primary integrated compiler patch `67c58f64` and permanent public-class fixture/gate patch `bb8b8845`. Immutable compiler `990e3cf1` passes the complete **646 generated-module / all 640 emitted TypeScript modules strict** gate, minified Chromium and fresh SSR on MAIN. Every previous 640-module assertion remains, including the existing mixed public/private class rejection fixture. The exact newly named authored fixture separately passes the pinned production Svelte reference with explicit runtime environment conditions and no page errors. Evidence: `/tmp/moonshine-root-combined646.log` and `/tmp/moonshine-root-class-admission/paired.log`.

Supported class fields are public identifier-keyed instance state/raw/derived/by initializers, including zero-argument state/raw, explicit macro generics and declared field types. DOM uses per-instance private boxes and nonenumerable accessors; SSR preserves ordinary enumerable state fields. Source initialization order, inheritance, assignment/update/destructuring, public callable/tag receivers, independent instances, dirty input focus/caret, optimistic derived overrides, disposal and fresh requests are checked. AST lowering preserves comments and decoded-name hygiene without a runtime dependency or proxying instances. The final candidate passes **1,120 native tests**, **47 targeted CLI tests**, both Clippy lanes and rustfmt; type-negative and failed-output-preservation cases remain active. Core/kernel JS is unchanged.

Private rune fields, constructor rune assignments and advanced field/type wrappers remain unfinished. Static/computed and other invalid placements retain explicit diagnostics. This is not full class or SFC coverage.

A fixed runnable consumer of the exact public-class fixture, including mounting and its existing observable APIs, bundles to **31,705 raw / 11,701 gzip-9 / 10,568 Brotli bytes** with Moonshine versus **50,403 / 18,562 / 16,693** with pinned Svelte 5.57.1. Both minified consumers render, update and retain dirty input focus in Chromium. This one client workload establishes neither a universal size ranking nor speed. Reproduce with `/tmp/moonshine-root-class-admission/proof/sizes.ts` and `size-browser.ts`; outputs/hashes: `/tmp/moonshine-root-class-admission/sizes.log`. These numbers precede the unintegrated template-boundary candidate.

## Owned template runtime integrated; source directives still pending

The primary integrated boundary patch `410a3197` (worker's `1416ed68` plus repository-relative test imports). Compiler-owned typed node blocks detach roots before directive cleanup, retain detached descendants through nested range disposal, and still stop all resources. Ordinary insertion behavior remains unchanged. Source-created ranges explicitly receive the retention predicate; this is not an implicit policy for arbitrary `h` trees. The existing attribute setter is exposed without a second attribute implementation.

Primary review found three reentrant late-removal paths that also needed the explicit policy: cancellation immediately after a child read, cancellation during old-range teardown, and continued removal of old nodes after nested cleanup stops the containing block. Each was reproduced RED before the shared path was corrected. Retention never suppresses range metadata disposal, and moved-out/fresh nodes still remove. Tests cover detached hosts, damaged ranges, first-error preservation and peer cleanup, failure before publication, post-factory cancellation, action/attachment/component destroy order, and no context restoration after disposal.

Fresh MAIN validation passes **1,898 tests / 8,343 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/size checks, scoped formatting and lint (only three existing DOM warnings). The first full run exposed a new test importing an unlinked workspace package; relative repository imports fixed the harness without adding a dependency. Evidence: `/tmp/moonshine-root-template-boundary-all-tests-final.log`, `*-typecheck{,-native}.log`. Fresh minified browser runs using MAIN source match all pinned Order, keyed RowsTeardown and lifecycle records: `/tmp/moonshine-root-template-boundary-browser.log`. The complete source gate also passes again: **646 modules / all 640 emitted TS modules strict / Chromium / fresh SSR**, `/tmp/moonshine-root-combined646-template.log`.

The fixed DOM consumer adds 70 raw / 28 gzip bytes; the directive consumer adds 89 raw / 35 gzip bytes. The signal kernel remains **3,798 raw bytes**. The current runnable class consumer is **31,776 raw / 11,728 gzip / 10,628 Brotli bytes**, versus unchanged pinned Svelte **50,403 / 18,562 / 16,693**; both consumers pass browser render/update/dirty-focus checks. Evidence: `/tmp/moonshine-root-class-admission/{sizes-after-template,size-browser-after-template}.log`. No timing or universal ranking follows.

Actual authored directive lowering remains unimplemented. The approved compiler plan preserves existing text coercion/cache readers, events, classes, binding semantics, block provenance and native validation. New Controls reference probes require action/binding initialization in authored order and ordinary-select option refresh without re-evaluating the authored getter. A stable 448-file compiler snapshot has been frozen before isolated source changes; it includes concurrent peer IR work not covered by the earlier `990e` compiler snapshot. Private class helper/type design remains isolated. The native watcher-error scope below is now integrated.

## Optional native watcher errors integrated

`@tschk/moonshine-vue/errors` now exports `withComponentErrorHandler(handler, setup)` for a live native owner. It captures the actual native component frame and handles function-source getters, callbacks, synchronous effect bodies and individual cleanups through the existing watcher machinery. Handlers run synchronously and untracked; returned promise rejections retain the captured handler/frame after disposal. Unconfigured watchers keep their prior throwing and native boundary behavior. This does not implement Vue application configuration, ancestor error capture, props-job attribution or render-expression fallback.

Primary review checked getter-return observation against pinned Vue 3.5.13: getters also inspect returned thenables, preserve the original returned identity, read `then` once and `catch` twice, and report asynchronous rejection. The permanent regression preserves this behavior. Fresh MAIN production-browser graphs match all ten calibrated phase workflows; native component-frame disposal metadata is explicitly distinguished from Vue public-instance unmount timing. Evidence: `/tmp/moonshine-root-watch-errors-browser.log` and `/tmp/moonshine-root-watch-errors-browser/phases-assert.py`.

Validation passes **1,912 tests / 8,379 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/size gates, and package formatting/lint. The complete source gate passes again: **646 generated modules / all 640 emitted TypeScript modules strict / production Chromium / fresh SSR**. Evidence: `/tmp/moonshine-root-watch-errors-{all-tests,all-types,all-native,sfc646}.log`. The Vue package alone passes 125 tests / 608 assertions, including host-free standalone imports.

Measured production consumer costs are explicit: watch grows **9,858 raw / 3,760 gzip bytes** to **10,483 / 3,958**; synchronous effect grows **9,525 / 3,603** to **10,095 / 3,793**. Ref-only gzip grows two bytes from emitted naming; the bridge remains byte-identical at **611 raw / 368 gzip**. Default signal core remains **3,798 raw bytes**. No startup or runtime speedup is claimed.

## Current counter performance checkpoint

The existing `scripts/benchmark-sfc-counter.ts` was rerun against MAIN runtime sources and immutable compiler `990e3cf1`, Bun 1.4.0 and pinned Svelte 5.57.1. The same authored two-component counter produces **29,987 raw / 11,096 gzip / 10,055 Brotli bytes** for Moonshine versus **46,617 / 17,344 / 15,628** for Svelte. Five functional clicks and retained child identity pass for both. Runtime/source/compiler fingerprints and bundle hashes are saved in `/tmp/moonshine-root-current-counter-benchmark.json`.

Across 25 alternating samples per framework after five warmups, local HTML-to-observed-DOM startup medians were **4.8 ms native / 6.2 ms Svelte** (p95 **5.8 / 7.1 ms**). Across 625 serial click commits each, both medians round to zero at browser timer precision; p95 was **0.2 / 0.1 ms**. These are one-machine, warm-browser localhost observations including module fetch/evaluation and DOM commit. They exclude paint, cold startup, remote network, SSR, hydration and allocation profiling; they establish no universal speed ranking.

An isolated source-map attribution identifies the largest retained native raw-code contributors as DOM insertion/forms (~7.2 KB), the Svelte pre/template scheduler (~4.8 KB), deep state (~4.4 KB), owners (~2.8 KB) and component instances (~2.6 KB). This is approximate generated-character attribution, not compressed savings or evidence that those semantics can be removed. Source-map debug metadata is excluded from the benchmark size above. Evidence: `/tmp/moonshine-root-counter-footprint/attribution.json`.

The same authored counter now also has an actual generated SSR comparison, using pinned official server compilation and current Moonshine packages rather than handwritten equivalent render functions. Both outputs retain their own exact serialization across requests; visible HTML agrees after removing official hydration comments. Native server bundle: **10,527 raw / 4,181 gzip / 3,779 Brotli bytes**; Svelte: **26,287 / 9,876 / 8,943**.

Warm-process alternating samples (five discarded warmups, then 25 samples of 5,000 fresh renders each) measured native median **0.00465 ms/render** versus Svelte **0.000717 ms/render**, approximately **6.5 times slower** for this tiny workload; p95 **0.00517 / 0.000876 ms/render**. Moonshine is smaller here, but it does not meet the fastest objective. Generated SSR currently routes several compiler-owned fragment functions through generic component scopes; this is a concrete optimization candidate, not a proven fix. Real authored component scopes, cleanup and context must be preserved. Evidence: `/tmp/moonshine-root-counter-footprint/{ssr.ts,ssr-build.log,ssr-timing.ts,ssr-timings.json}`. These results exclude cold process startup, async SSR, hydration and network.

## SSR absent-props descriptor fast path

A one-line native SSR change skips collecting descriptors from a newly allocated empty object when a component receives children but no props. Existing supplied accessors and the readonly/configurable/enumerable child descriptor remain unchanged. In the generated counter, instrumented descriptor calls fall from **four to zero** per render, also avoiding their temporary empty inputs and descriptor results. Exact repeated HTML is unchanged.

Four alternating before/after warm-process measurements show a modest scoped improvement (median pairs in ms/render: **0.002898/0.002786**, **0.002802/0.002750**, **0.002840/0.002727**, **0.002836/0.002739**); a separately named final driver measured **0.003220/0.003069**. The generated SSR bundle changes **10,527→10,526 raw**, **4,181→4,185 gzip**, **3,779→3,777 Brotli bytes**. This is reduced work, not a gzip-size win or a resolution of the larger Svelte SSR gap. Proof scripts/results: `/tmp/moonshine-root-counter-footprint/ssr-descriptors-{count,timing}.ts`, `ssr-descriptors-count.json`, `ssr-descriptors-timings.json`.

The new regression checks absent and accessor props, original child descriptors, lazy single child reads and request cleanup. **1,913 tests / 8,391 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/size gates and the complete **646-module / all 640 strict TS / Chromium / fresh SSR** gate pass. Scoped formatting passes; lint retains three existing SSR warnings. Evidence: `/tmp/moonshine-root-ssr-descriptors-*`.

## Configured watcher getter feedback

A source-read guard now prevents getter error reporting from recursively evaluating the same configured watcher before its outer read finishes. It restores in `finally`, including when an authored thenable's `catch` method throws, and resets before callback delivery so genuine callback feedback stays reentrant. Unconfigured native getter behavior is preserved. No extra watcher, scheduler or kernel field is introduced.

Six regressions cover previous values, initial and subsequent feedback, branch dependency recovery, continued multi-source reads, disposal/cleanup and thrown catch restoration. Primary production Chromium builds from fresh MAIN package copies exactly match four pinned authored Vue traces. The full run passes **1,919 tests / 8,400 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/size gates and the complete **646 generated-module / all 640 strict TS / Chromium / fresh SSR** gate. The Vue package passes **131 tests / 617 assertions**. Evidence: `/tmp/moonshine-root-getter-feedback-{tests,types,native,sfc646,browser,vue}.log`.

The measured watch consumer grows **10,483→10,531 raw / 3,958→3,978 gzip bytes**. Ref-only and bridge bundles retain exact bytes and SHA; the default kernel stays **3,798 raw bytes**. This closes the bounded getter-feedback discrepancy, not Vue's application error API, factory-job attribution or all lifecycle behavior. Hardened defaults scheduling and readonly source lowering remain unadmitted.

## Component reference feedback bounded across fresh publishers

Primary review reproduced a gap in the per-callback limit: each publication could create a new component/reference callback, never repeating an identity and therefore never reaching the guard. A finite 2,005-publication reproducer failed before the fix. Publication now snapshots each wave while retaining the actual pending set for cancellation/deduplication, then limits successive waves to 1,000. A whole wave can contain 1,500 independent references. The old callback-count map is unnecessary because a callback runs at most once per wave and has been removed. The guard preserves the first failure and clears runaway pending work; later explicit publication can recover.

New regression coverage proves the bound, initial independent peer delivery and recovery; the existing large cohort is strengthened to 1,500. **1,920 tests / 8,405 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/size checks and the complete **646 generated-module / all 640 strict TS / Chromium / fresh SSR** gate pass. Scoped format passes; lint retains four existing test warnings. Evidence: `/tmp/moonshine-root-reference-feedback/{red,focused-final,full-tests,types,native,sfc646}.log`.

The fixed exported-reference consumer shrinks **6,851→6,825 raw / 2,628→2,604 gzip / 2,399→2,371 Brotli bytes**. The ordinary `h`/`render` consumer remains byte/SHA-identical, and the signal kernel stays **3,798 raw bytes**. Baseline/source inventory differs only in `component-instance.ts`; no speed claim is made. Exact entries and artifacts: `/tmp/moonshine-root-reference-feedback/{size,size-refs}.ts`.

## Directive compiler candidate: regression checkpoint only

The isolated `b35060fa` compiler snapshot now independently passes the existing **646-module / all 640 strict TS / production Chromium / fresh SSR** gate against MAIN runtime packages. The primary also ran the broader component gate to completion: authored Solid TSX prop/child/generic negatives and native component, directive-helper, store-reference, await and raw-HTML browser checks pass. Evidence: `/tmp/moonshine-root-directive-b350646.log` and `/tmp/moonshine-root-directive-b350-components.log`. This verifies prior behavior for that immutable snapshot; it does not admit new directive source syntax or the later key-block changes.

Actual isolated directive source graphs separately match pinned Order, Controls and RowsTeardown traces through updates/disposal on both targets, with complete strict TS graphs. Key-block composition exposed the same independent-reconciliation lifetime issue as conditional blocks and is still being corrected using opt-in pull scheduling. No ledger-validity bypass or default control-policy change is integrated. The proposed generic select-registry extraction is unused: source selection replay instead uses a real owned MutationObserver and cached values.

Vue defaults remain unadmitted. Primary review caught both duplicate scheduler installation in nested authored wrappers and inherited Vue group metadata under a foreign carrier. Isolated regressions now pass with actual-carrier branding and group reuse; the type-only helper extension erases to unchanged JavaScript. Source Rust is still unbuilt. Solid cleanup order research also remains isolated because reversing callbacks removed DOM before user cleanup; a scoped finalization policy is under investigation.

## Directive runtime contracts: integrated checkpoint

Template retention now reaches ordinary nested `h` children and insertion ranges, including a range's own disposal path. Detached blocks preserve descendant text for authored cleanup while effects and listeners stop; moved-out nodes still release normally. Explicit range predicates override inherited policy. Three regressions and a fresh production Chromium build prove retained content, stopped updates/listeners, moved-out cleanup and failure draining. This closes the ordinary imported-child composition gap without graph-wide recompilation.

The existing control helpers now accept an optional scheduling function, allowing compiler-owned ranges to reconcile inside their containing pull. `mapArray` keeps its third deferred-removal argument and takes scheduling fourth; default scheduling is unchanged. Two behavioral regressions and strict positive/negative caller fixtures cover the seam. The Svelte directives entry also provides type-only `Action`/`ActionReturn` contracts; these add no runtime dependency.

The integrated checkpoint passes **1,925 tests / 8,433 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/size checks, scoped lint/format and the existing **646 generated-module / all 640 strict TS / Chromium / fresh SSR** acceptance gate. Evidence: `/tmp/moonshine-root-directive-contracts-{tests,types-final,native,sfc646,lint,format-check}.log`. One initial negative type fixture was invalid because TypeScript permits ignored callback returns; the corrected incompatible disposer and schedule fixtures pass both checkers.

Retention costs **+26 gzip bytes** for the fixed ordinary `h`/`render` consumer and **+41 gzip bytes** for the range consumer; the fixed block consumer grows **7 gzip bytes**. Exact entries/results: `/tmp/moonshine-root-inherited-retention-proof/{size.ts,sizes.json}`. The signal-only core remains **3,798 raw bytes**. No speed claim follows from these lifecycle changes.

Authored directive lowering remains isolated pending final compiler integration and regression acceptance. Its current source proofs cover action/attachment ordering, controls, keyed/unkeyed rows and imported key children; the permanent action/attachment fixtures each match pinned Svelte across two instances and fresh SSR. The compiler's Rust tests and source traces do not establish full SFC coverage. Private class runes, Vue defaults source lowering, Solid lifecycle policy and unsupported directive combinations remain open.

Primary fixed-entry measurements isolate the scheduling seam: ordinary `h`/`render` output is byte/SHA-identical; exporting all four affected controls changes **6,997→7,024 raw / 2,781→2,798 gzip bytes**. The Show-only entry changes **4,826→4,830 raw / 1,974→1,972 gzip bytes**, where compression noise is not a meaningful size win. The baseline differs only in those scheduling signatures/calls. Reproducer/results: `/tmp/moonshine-root-control-contract-size/{measure.ts,results.json}`.

The final isolated directive compiler **d0aed0bc** independently passes the existing complete 646-module gate and broader component gate against current MAIN runtime packages. Copied runtime source inventories now match MAIN exactly. Evidence: `/tmp/moonshine-root-directive-d0ae-{sfc646,components}.log`. Permanent directive source acceptance is being added separately; earlier full native/compiler checks remain distinct from that integration gate.

## Defaults and renderer boundary audit: candidates remain held

Review of the coherent Vue defaults candidate found a recovery discrepancy: a default factory could mutate raw props and throw, after which restoring exactly the previous successful source snapshot was incorrectly skipped. The isolated correction invalidates equality only for a failed defaults application while retaining the last successful snapshot; it does not publish partial writes as a successful snapshot or change ordinary/Boolean batched props. An authored production Vue comparison reproduces the failure and proves recovery plus subsequent updates after correction. Evidence: `/tmp/moonshine-vue-defaults-held/proof/recovery-equality/`. Package-wide revalidation and compiler source acceptance remain pending.

The unbuilt Vue defaults source proposal also used an approved wrapper span too broadly: nested unbound macro identifiers inside a defaults factory could be accidentally whitelisted. The source proposal must permit only the exact validated macro callee spans and reject nested macros on DOM/SSR without replacing prior artifacts. This is a review finding in the held proposal; the current admitted compiler rejects the outer defaults form already.

The rebased isolated Solid cleanup policy preserves the integrated template retention and control scheduling seams. Known foreign native component frames reset its policy; a bare generic root deliberately inherits the active parent policy and cannot infer a source language. The Svelte scheduler's existing new-owner context is the finite explicit reset point. Template blocks detach before cleanup by their explicit Svelte contract and must not be selected for Solid source. Source dispatch, lifecycle policy cost and SSR timing differences still prevent claiming full Solid compatibility.

The compiler agent's SSR fragment prototype now calls its explicit transparent grouping helper directly, avoiding synthetic component scopes without a new Moonshine runtime API. The earlier local runtime `Fragment` prototype remains unintegrated because that runtime addition is unnecessary for this compiler solution. Combined compiler checks and actual authored counter measurements are pending; the peer's eight-fragment fixture timing is separate evidence, not a general SSR performance result.

## Permanent directive source acceptance

The reviewed additive gate is now integrated in `scripts/check-native-sfc.ts`. It reuses the unchanged authored action and attachment fixtures and retains all previous assertions. The primary independently ran it against immutable compiler **d0aed0bc** and actual MAIN runtimes: **658 generated modules**, all **652 emitted TS modules** strict under both checkers, production Chromium and two fresh SSR requests pass. The browser asserts five exact pinned-reference trace phases across two action and two attachment instances; SSR checks exact four-element HTML and zero directive-expression/factory traces. Evidence: `/tmp/moonshine-root-directive-gate658.log`; scoped format and diff checks pass.

This admits the bounded fixtures into permanent verification; it does not establish every directive combination or published compiler availability. The compiler source patch still needs combined live-repository integration with concurrent SSR fragment changes. Its isolated final proof separately preserves all earlier emitted artifacts/facades across 24 negative target cases and preserves the complete eight-file ordinary counter graph byte-for-byte. The compiler source delta and permanent acceptance delta remain separate, reviewable artifacts.

## Reproducible same-authored SFC SSR benchmark

The existing `scripts/benchmark-sfc-counter.ts` now includes SSR alongside its browser startup/click measurements. It reuses the frozen compiler, copied native packages and exact unchanged authored sources; builds both production server graphs; verifies repeated fresh output and visible HTML equality after removing only compiler hydration comments; then measures 25 alternating samples of 5,000 renders after five warmups. Raw samples, medians/p95, compressed sizes and artifact fingerprints share one result. A fresh measurement process avoids a reproduced Bun same-process import failure after building newly written artifacts. No runtime/framework behavior changed.

Primary full execution passes with compiler **d0aed0bc**, Bun **1.4.0**, Svelte **5.57.1**: native SSR **10,526 raw / 4,185 gzip / 3,777 Brotli bytes**, reference **26,287 / 9,876 / 8,943**. Warm per-render median is **0.002559 ms native / 0.000376 ms Svelte** (about **6.8× slower native**); p95 is **0.002747 / 0.000497 ms**. These tiny warm-process timings are workload-specific and sensitive to machine load; they are not a universal ranking or an improvement relative to older independently run timings. The compiler fragment optimization is not included in this frozen baseline.

The same run's browser bundle is **30,037 raw / 11,120 gzip / 10,048 Brotli bytes** versus **46,617 / 17,344 / 15,628**; local startup medians **3.3 / 4.3 ms**, click medians both zero at browser timer resolution and p95 both **0.1 ms**. This preserves the distinction between smaller bundles and faster rendering. Evidence: `/tmp/moonshine-root-permanent-sfc-ssr-d0ae.json` and `-final.log`. Both strict checkers, scoped lint/format and diff checks pass for the benchmark. The tightened ArrayBuffer-backed asset annotation also resolves an existing standalone strict-check mismatch without changing runtime bytes.

Combined compiler integration has uncovered additional repair cases beyond the frozen directive fixture cohort: textarea helper construction must remain once-only, SSR rune validation must precede operand erasure, and unchanged text must not create spurious mutation notifications. Those repairs are being proved in the compiler repository; the existing frozen source acceptance evidence does not cover them yet. Private class work also reproduced the generic-arrow ambiguity in plain/public scripts before private lowering; the isolated parser fix uses existing TypeScript AST spans before JSX merging, with no new parser dependency.

## Combined compiler acceptance and paired fragment measurement

The compiler repository now contains the reviewed directive delta plus concurrent SSR fragment and directive repair work. Primary checks against immutable **ccd4de0a5a59ab1421fe70866321530df53740f70d8996be8f57513fdd206c30** pass the complete **658-module / all 652 strict TS / production Chromium / fresh SSR** gate and broader authored component/runtime gate. Logs: `/tmp/moonshine-root-combined-{gate658,components}.log`. Reviewed repair differences include once-only eager textarea-node construction, cached grouped text writes and validating erased directive operands through the existing rune pipeline. These remain bounded checks, not full framework parity or publication.

The authored counter's four synthetic fragment calls now bypass component scopes directly. The exact generated-source difference is limited to those helper definitions/calls; all **66 copied runtime/manifest files** are byte-identical before/after. A fresh paired warm-process run alternates **50 recorded samples × 10,000 fresh renders**, after ten warmups per version, with exact markup/length assertions. Native median changes **0.005993→0.004064 ms/render** (about **32.2% lower**), p95 **0.007757→0.006245 ms**; the new version is faster in **47/50 paired samples**. SSR bundle changes **10,526→10,528 raw / 4,185→4,187 gzip bytes**; browser output stays byte/SHA-identical. No runtime `Fragment` API was needed. Exact scripts/data: `/tmp/moonshine-root-fragment-pair/{build.ts,measure.ts,sizes.json,results.json,runtime-identical.json}`.

The separate full browser/SSR benchmark passes on the same compiler, but its server timing run contains substantial machine-load outliers, so it is not used to infer a before/after speedup. Its result remains `/tmp/moonshine-root-combined-counter-benchmark.json`. The earlier unminified CPU attribution run locates costs in map/owner allocation and prop-descriptor construction; its profiling overhead and code shape make its **30.9-second** total unsuitable as benchmark evidence. Profile source/artifacts: `/tmp/moonshine-root-sfc-ssr-profile/`.

## Newly reproduced SSR named-prop evaluation gap

Eight actual authored Svelte cases on the combined compiler prove that named prop expressions must evaluate in lexical parent order before child setup, even if unread or later overridden. Native currently delays reads and can completely skip an unread throwing expression. The official trace `value, throw` stops before setup; native instead renders successfully. Named-before-spread and spread-before-named ordering also differ. Spread-only getters remain lazy in both runtimes, so eagerly snapshotting every key would introduce another mismatch. Callback values and snippet bodies remain uncalled, and the bindable fallback/retry/commit trace already matches. This is a compiler-owned SSR source fix; generic native accessor props and DOM live getters retain their existing contracts. Frozen repro/assertions: `/tmp/moonshine-ssr-prop-order-corpus/{HANDOFF.md,results.json,assert.py}`. The gap remains open.

## SSR named-prop order: integrated permanent acceptance

The compiler-only fix now evaluates ordinary named SSR prop expressions in lexical parent order while preserving spread/binding accessor metadata. The frozen **27f98db96094536201e72008ec1cb773e7929883b8e760064f6462b45cbbe4f0** passes all eight exact authored comparisons against pinned Svelte: unread throws stop before setup, overwritten named expressions still run, spread getters remain lazy, callback/snippet values are not invoked and bindable fallback/retry/commit stays intact. The generic native `h` contract and DOM live getters are unchanged.

The reviewed portable acceptance patch adds the eight exact source pairs and trace helpers after all existing assertions. A primary module-count assertion fixes the independently observed new census at **40 SSR modules**, giving **698 total generated modules**. Both strict lanes check all **692 emitted TS modules**, plus authored helper dependencies; existing browser/SSR/negative assertions remain intact. Primary run `/tmp/moonshine-root-prop-admission698.log` passes against actual MAIN runtimes, including the new private-field helper exports. The old failing compiler corpus remains preserved. Scoped lint/format and diff checks pass. An earlier candidate patch serialized missing final newlines incorrectly; it was rejected before application, corrected with explicit markers and checked for applied byte parity.

## Optional private-field cell runtime: integrated checkpoint

The Svelte `/runes` entry now exports `createPrivateState` and `createPrivateRawState`. Deep cells reuse the existing proxy graph/history and return the locally resolved assignment result even if notification triggers feedback or disposal. Their tracked historical `value` and live untracked `peek()` support the compiler's distinct constructor/read contracts; raw cells retain literal values/functions. No new kernel state, dependency, proxy graph implementation or global registry is introduced. The parser/compiler source cohort is still isolated and is not admitted by these runtime exports alone.

Four runtime regressions cover assignment feedback/disposal, history versus live peeks, deep identity and literal functions. Positive/negative caller types now participate in both project typecheck lanes. The fixture uses the existing repository-relative import convention because the root intentionally has no Svelte workspace symlink. **1,929 repository tests / 8,450 assertions**, both **25-project** TypeScript lanes, package/adapters/catalog/core-size checks and scoped lint/format pass. The configured package-only test command excludes eight example tests; the required repository-wide `bun test` run includes them and is the reported full count. Logs: `/tmp/moonshine-root-private-helper-{full-tests,types,native,packages,adapters,catalog,size,format,lint}.log`. Lint retains one existing state-module warning.

Primary fixed-entry builds prove ordinary state/raw/derived outputs byte/SHA-identical when identifier names are retained. Minifier name allocation changes ordinary state by **+2 gzip bytes**, raw by **+1 gzip byte** and derived by **+3 raw / +1 gzip byte**; this is recorded rather than claiming universal byte identity. The signal-only core remains **3,798 raw bytes**. Reproducer: `/tmp/moonshine-root-private-helper-size/{measure.ts,results.json}`. Actual isolated private-class source proofs already cover two browser instances, fresh SSR, exact cleanup and forty wrong-payload type lanes, while broader native/CLI verification and permanent source acceptance remain pending.

## Committed derived overrides: cleanup history correction

A dependency invalidation after a committed derived override now restores the previous computed inputs for cleanup. The existing first-write history still wins for assignments in the same flush. The change is one argument in the existing history record, with a non-class regression; private-class calibration matches the pinned Svelte reference over seven phases.

Primary verification passes **1,930 repository tests / 8,452 assertions**, both **25-project** typecheck lanes, the complete **698-module / 692 emitted TS** source gate against frozen compiler `27f98db9`, and package/adapters/catalog/core-size checks. Scoped lint/format and diff checks pass. Logs: `/tmp/moonshine-root-derived-invalidation-{tests,types,native,sfc698,lint}.log`. Core remains **3,798 raw bytes**.

Separate preexisting discrepancies remain open: equal-valued child derivations can reset a parent override too early, unrelated-effect cleanup can observe the wrong historical override, and external nonreactive error flags expose eager evaluation timing. Broader getter-policy changes were rejected after reference calibration; this bounded fix does not claim full rune parity. Evidence: `/tmp/moonshine-private-class-source/HISTORY-CALIBRATION.md`.

## Held component candidates: independent review findings

The held Solid cleanup candidate is not admitted. Independent review reproduced a live insertion-range replacement whose cleanup sees disconnected nodes, despite the candidate's root-disposal cases passing. The range calls deferred removal outside a cleanup transaction, causing immediate physical removal. The correction must keep cleanup connected and physical removal before replacement setup, while preserving adoption and error draining. Reproducer: `/tmp/moonshine-solid-adapter-factory/review-range-removal.test.ts`; failing evidence: `review-range-removal.log` in that directory.

The isolated Vue `withDefaults` compiler now builds and passes three focused compiler tests, but the unchanged recovery source exposed an existing named-import guard rejecting `watch`. Moonshine already implements the cohort's explicit synchronous watcher on `/reactive`; a bounded source import mapping and alias regression are being verified. This is not source admission or full watch scheduling support. The initial frozen compiler is `eb1bd7dd`; actual source diagnostic: `/tmp/moonshine-vue-defaults-admission/native-current.log`. No source fixtures were weakened to bypass the guard.

Independent cleanup review also reproduced two reentrancy failures in the held Solid candidate: nested owner disposal reset the fixed finalizer drain's local wave bound, and nested pending-work draining ran post-commit callbacks before remaining physical removals. Isolated corrections reuse one drain reentrancy flag, defer pending work until that drain exits, and bracket opted range disposal with the existing cleanup depth. The finite 2,005-wave reproducer now stops at 1,000; the focused ordering/error/adoption cohort passes 15 tests / 41 assertions. Complete candidate verification and MAIN integration remain pending. Original failures and focused correction evidence are preserved in `/tmp/moonshine-solid-adapter-factory/review-{reentrant-slot,post-finalizer-red}.log` and `reviewed-post-green.log`.

## Solid component lifecycle integration

The reviewed native Solid component factory and optional cleanup policy are now integrated (`7de6df73` candidate plus repository-relative cross-package test imports). Function components share their consumer owner; native component frames and Svelte scheduler entry reset the optional cleanup policy. Root disposal, nested descendants, list rows, returned node shapes, live insertion-range removal, adoption, errors and bounded reentrant finalization have reference/browser and regression coverage. The final isolated suite passed **330 tests / 1,592 assertions**; the primary verified all 27 integrated files matched that candidate before changing only three test import paths to the established repository-relative convention. The initial full repository run found those missing workspace aliases; all ten affected tests now pass. The primary full repository rerun passes **1,977 tests / 8,615 assertions**, with no failures (`tests-fixed.log`).

Both primary **25-project** typecheck lanes, the full **698-module / 692 emitted TS** browser/SSR gate against frozen `27f98db9`, package manifests, adapters, catalog, scoped formatting and lint pass. Lint reports warnings; it is not warning-free. Primary logs: `/tmp/moonshine-root-solid-integration/`.

The same-run fixed-consumer costs are **+204 gzip bytes** for default DOM, **+204** for Svelte, **+205** for Vue, **+175** for SSR and **+926** for the public Solid consumer. The selected 500-byte signal consumer retains its exact hash; the complete signal-only core gate remains **3,798 raw bytes**. Per-element/result cleanup registrations and transient retained-root sets are real allocation costs. No speed improvement is claimed. Source compiler dispatch, Solid compiled helper ABI, hydration and server timer cleanup parity remain open; deterministic native SSR cleanup stays synchronous.

The independent `unref` type correction is also integrated: ordinary `{value: ...}` objects retain their type, branded refs unwrap, and unions/readonly refs/functions/null/undefined have caller checks in both typecheck lanes. The implementation retains its prior runtime behavior.

## Next source integration review

Private class source admission remains held: independent compiler review reproduced four assignment/identity failures beyond the original thirteen class tests. The repaired candidate passes eighteen class tests, with emitted TypeScript and browser/SSR verification still running in Crepuscularity. The unchanged original mixed-class fixture has separate official/native browser, fresh SSR and both typecheck proofs; the proposed additive class gate now adds twelve modules (710 total before Vue defaults), retaining the original source and replacing its obsolete rejection assertion with explicit static-private rejection. No combined-gate pass is claimed.

The Vue defaults runtime has been rebased against the integrated Solid cleanup and `unref` changes: 150 Vue tests / 676 assertions, both strict lanes, the actual 18-generated-module / 22-file authored source graph, negative output preservation, production browser and fresh SSR comparisons pass in the isolated copy. Independent scheduler review is now complete and the eight-file runtime patch is integrated; full combined compiler acceptance remains pending. Evidence: `/tmp/moonshine-vue-defaults-main-rebase/RESULTS.md`.

Remaining derived semantics require a separately reviewed optional invalidation contract. Ordinary memo value subscriptions eagerly validate user code and lack source-origin invalidation provenance; adapter flags reproduced fresh-override and diamond failures. The proposed mechanism must mark all connected dependencies before waking consumers, account for signal and store mutations, preserve source revision ordering and release observed edges. No kernel implementation is admitted. Review rejected an opaque temporary-listener-token protocol before implementation. Evidence: `/tmp/moonshine-private-class-source/{DERIVED-ARCHITECTURE,INVALIDATION-PROPOSAL}.md`.

## Remaining host dependencies: manifest audit

Current adapter checks verify export files and package import declarations; they do not prove host-runtime replacement. The actual manifests and exported source still retain Vue (`/vue`, `/compiler-sfc`), Nuxt (`/app`, `/vue`), Angular (`/core`, `/common`) and Astro (`/compiler`) host reexports. Their optional peers must not be removed while those exports still import the hosts. Native Solid and Svelte surfaces are independent; native Vue subpaths and authored compilation are also independent, but this does not make every exported Vue entry host-free. The replacement audit must cover the complete exported surface, copied-package execution and compiler ownership before declaring those packages complete. No manifest was changed merely to hide a remaining import.

## Vue defaults runtime: integrated checkpoint

The primary integrated reviewed runtime patch `281b76ca`, after independent review found no actionable defect and an additional reentrant-disposal probe proved peer cancellation and once-only cleanup. All eight integrated files match the reviewed candidate byte-for-byte. This supplies ordered lazy default factories, per-instance caches including undefined, setup/caller type separation, synchronous watch visibility, and the optional compiler-owned render carrier. It does not implement the full Vue application API or asynchronous SSR scheduling.

Primary verification passes **1,996 repository tests / 8,674 assertions**, both **25-project** typecheck lanes, the complete **698-module / 692 emitted TS** browser/SSR source gate against frozen `27f98db9`, package/adapters/catalog/core-size gates, scoped lint/format and diff checks. Logs: `/tmp/moonshine-root-defaults-integration/{tests,types,native,sfc,lint,format}.log`. New defaults source admission remains pending the combined compiler; these source-gate numbers cover the previously accepted source cohort.

A fresh fixed-entry before/after build uses identical copied core/DOM sources and the pre-integration props snapshot: ordinary props changes **6,860→7,011 raw**, **2,744→2,817 gzip9**, **2,540→2,607 Brotli11**. This is **+73 gzip bytes**, with no timing claim. Reproducer and hashes: `/tmp/moonshine-root-defaults-integration/size/{measure.ts,results.json}`. The signal-only core gate remains **3,798 raw bytes**.

## Interface-typed component props

Native DOM, SSR and Solid portal factories now accept props stored in interface-typed variables. The public component overload previously constrained props to `Record<string, unknown>`, which rejects ordinary interfaces without an index signature even when the same inline object passes. Three public overload constraints now use `object`; implementation signatures and runtime logic are unchanged. Positive interface-variable calls and wrong-property-value negatives participate in both 25-project typecheck lanes. Both lanes and scoped lint/format/diff checks pass. Independent before/after Bun transpilation proves identical emitted JavaScript for all three factories. Evidence: `/tmp/moonshine-interface-props-review/{tsc-typed,tsc-fixed,tsgo-fixed,final-types,final-native}.log` and `check-erasure.ts`.

## Private class source: primary 710-module checkpoint

The primary integrated the additive private-class and unchanged mixed-class source fixtures, then passed the complete **710 generated modules / all 704 emitted TS modules strict** acceptance on frozen compiler `c2ae808e` against current MAIN runtimes. This includes all previous 698-module assertions, seven-phase private override/cleanup behavior, two instances, callable receivers, generic arrows, deep/raw assignment identities, exact fresh SSR and the original mixed-class source. The obsolete mixed-source rejection is replaced by explicit static-private rejection; the original fixture remains byte-identical.

Compiler primary review repaired four additional assignment/constructor issues and preserved authored casts/contextual types. Its full workspace passes **3,029 tests**, with **16 existing ignores**, Clippy/format checks and all six public-class generated files byte-identical. Cast-wrapped private state assignments with top-level await/yield still reject explicitly, as do unsupported static fields, constructor first rune assignment and unresolved callable forms. Broad rune invalidation discrepancies remain separate work. No full class-language claim is made.

The first Moonshine gate run caught a serialization error in the proposed test patch: embedded expected HTML lost quote escapes inside its generated SSR script. The assertion now uses a single-quoted HTML literal, retaining exactly the expected value; the repaired complete gate passes. The failed log is preserved. Scoped script lint passes with one existing shadow warning, formatting and diff checks pass. Evidence: `/tmp/moonshine-root-private710/{compiler.json,gate.log,gate-fixed.log}` and `/tmp/crepus-private-primary-review/verification.json`.

## Native Vue application delivery

The optional `@tschk/moonshine-vue/app` entry now mounts native compiled factories with typed original props through the existing DOM renderer. Its two-method application handle mounts once and unmounts idempotently. A private container lease rejects overlapping apps before clearing content and remains held through reentrant cancellation, cleanup and failed mount rollback. No additional render group, VNode implementation, host dependency or default export is added. Legacy Vue entries remain separate and host-backed.

Independent source/browser proof uses the unchanged authored defaults/recovery cohort through this mount API: eighteen generated modules, the complete twenty-two-file graph under both strict checkers, four production Chromium workflows and two fresh SSR comparisons against pinned Vue. Selector, shadow root, SVG namespace, focus retention, cancellation, lease recovery and stopped resources also pass. Review found a rejected-promise leak in unsupported roots; known native promises now have their rejection observed before the existing explicit diagnostic, without reading authored `then` getters or assimilating arbitrary thenables. Cross-realm, VNode/Options/public-instance/app-config/hydration and async component support remain open.

Primary verification passes **2,011 repository tests / 8,741 assertions**, both **25-project** typecheck lanes, complete **710-module / 704 emitted TS** browser/SSR acceptance, package/adapters/catalog/core-size gates, scoped lint/format and diff checks. The first concurrent full run timed out in three unchanged standalone tests; all sixteen tests in those files passed separately, then the sequential full rerun passed without changing timeout limits. Logs: `/tmp/moonshine-root-vue-app/{tests,recheck-timeouts,tests-sequential,types,native,sfc,lint,format}.log`. All seven integrated files match reviewed candidate `99b56a7c`. Signal-only core remains **3,798 raw bytes**; no app timing claim is made.

## Compiler-facing Solid control: integrated runtime checkpoint

The optional Solid `/control` entry now exports accessor-shaped `createSolidShow` for the explicit-source compiler. It adds a fixed component scope and untracks the existing native Show creation. Existing `/control` Show identity and the distinct public `/solid` props ABI remain unchanged; the helper does not install a root cleanup policy. Two regressions cover policy isolation, retained branch state, connected child cleanup and child-before-parent disposal.

Primary verification passes **2,013 repository tests / 8,749 assertions**, both **25-project** typecheck lanes, all **144 Solid tests / 620 assertions**, scoped lint/format and package/adapters/catalog/core-size gates. A fresh copy of current MAIN packages also passes actual Moonshine CLI DOM/SSR compilation and both strict caller graphs on isolated compiler `9ef1c6ad`, followed by exact pinned Solid production Chromium five-phase traces and two fresh SSR comparisons. SSR serialization quotes intentionally differ while parsed text/attributes match. The strict graph resolves the declared optional Crepus WASM type peer for legacy IR exports; the browser bundle contains no host, WASM or SSR serializer. Logs: `/tmp/moonshine-root-solid-source-control/`.

The source compiler patch itself is still isolated pending Crepus primary integration and full combined acceptance. Only explicit leading per-file `@jsxImportSource solid-js` provenance is proved; no tsconfig interpretation, graph inheritance, normal route bootstrap selection, imported/dynamic component ownership, hydration or host compiler ABI parity is claimed. Source review caught async/generator roots, reassigned live default exports and namespace-object defaults that compiled but rendered incorrectly; the isolated candidate now rejects all three before publication. The accepted shared SFC checkpoint remains **710 modules / 704 emitted TS** on `c2ae808e`. Signal-only core remains **3,798 raw bytes**.

## 2026-10-17 — causal invalidation and derived consumer demand

Integrated reviewed runtime `f6426977`: source writes mark derived inputs before waking consumers; side observers do not eagerly compute values. Unobserved optimistic overrides inspect immediate dependency versions, while connected overrides retain their value until their own inputs invalidate. First assignment computes dependencies once, matching the pinned reference. Pre/post jobs validate value versions before cleanup, so equal derived values retain their effects and DOM. Cleanup invalidations still force their queued rerun.

The optional registry reuses kernel memo dependencies and existing listener sets. Native demand inspection registers nothing and runs no user computation. Unsupported foreign protocols unsubscribe and fail explicitly. Causal feedback is bounded at 1,000 callback generations; 1,500 independent sibling writes remain valid. First errors survive peer draining and later recovery. Independent reference probes cover connection/disconnection, dynamic dependencies, first assignment/error retry, equal children, fresh overrides and historical undefined values. This remains bounded Svelte parity, not a complete scheduler ABI.

Primary verification passes **2,030 tests / 8,833 assertions**, both **25-project** strict typecheck lanes, package/adapters/catalog/core-size gates and scoped lint/format/diff checks. All ten integrated files match the frozen reviewed inventory. The unchanged **710-module / 704 emitted TS** gate passes with candidate core/Svelte sources, current native DOM and frozen compiler `c2ae808e`, including minified browser and fresh SSR checks. Logs: `/tmp/moonshine-root-demand710/`; exact differential source traces and independent probes: `/tmp/moonshine-invalidation-adapter/DEMAND-HANDOFF.md`.

Costs are explicit: default core **3,798→4,041 raw / 1,585→1,671 gzip9 bytes**. The same authored counter, compiler and production bundling pipeline changes browser **30,598→34,650 raw / 11,297→12,683 gzip9 / 10,265→11,482 Brotli11**. SSR stays **11,067 raw / 4,361 gzip**; Brotli changes 3,946→3,935 through emitted naming. Both runtimes pass five Chromium clicks, retained child identity and two fresh SSR requests. The official reference remains byte/SHA-identical at 46,617 / 17,344 / 15,628 browser bytes. No timing improvement or universal ranking is claimed. Reproducer fingerprints/results: `/tmp/moonshine-invalidation-adapter/counter-cost-comparison.json`.

## 2026-10-17 — finite Vue defaults source acceptance

The permanent gate now passes **728 generated modules / all 722 emitted TypeScript modules** on frozen compiler `224d115b`. The additive Vue cohort contributes **18 generated modules** and a complete **22-file strict caller/helper graph**, preserving all previous 710-module DOM/SSR assertions. Five source-policy negatives preserve existing facades and publish no fresh output; three typing negatives run in both targets and both strict checkers. Original authored fixtures remain unchanged. Source/runtime APIs are independent of Vue; the separate legacy Vue entries still retain their optional peer.

Actual minified Chromium assertions cover two independent default instances plus a supplied-value instance, absent/undefined/null and Boolean values, callable values versus factories, ordered raw-props mutation, injection context, cached undefined, retained DOM identity, disposal, initial failure and successful/throwing refresh recovery with independent descendant updates. Two fresh SSR requests assert escaped output and exact factory traces. Setup types are shallow readonly; public caller types retain their original required/optional fields. Unsupported factory captures, nested macros, spreads/accessor defaults and invalid values diagnose. This is bounded finite defaults support, not arbitrary Vue application scheduling, render-error attribution or the VNode ABI.

Crepus primary review also corrected callable constructor classification, retained outer casts/satisfies wrappers and reserved decoded identifiers from scripts and supported template expressions. Its workspace record reports **3,042 passed / zero failed / 16 existing ignores**, Clippy/format pass and eighteen ordinary Vue output files byte-identical. Exact classifier/wrapper/hygiene runtime proofs remain in `/tmp/crepus-vue-{defaults-primary-review,shared-hygiene,template-hygiene}/`; the permanent Rust regressions live in Crepuscularity.

Primary Moonshine evidence: `/tmp/moonshine-root-vue728-prep/gate-main.log` passes the actual repository gate with current runtimes. Integration caught a missing `access` import in the older portable test patch and replaced its obsolete rejection of finite Boolean defaults with unsupported spread defaults; the positive cohort covers finite Boolean defaults. Added cohort bindings were renamed to avoid new lint shadows; the existing SSR-prop `built` shadow warning remains. Runtime code and measured core/counter bundles are unchanged from the 2,030-test checkpoint. No new speed claim, host compiler ABI or release is implied.

## 2026-10-17 — explicit Solid source acceptance

The permanent source gate now passes **734 generated modules / all 728 emitted TypeScript modules** on frozen compiler `82e517ca`. A separate `scripts/check-native-solid.ts` helper preserves every previous 728-module assertion and adds the complete six-module Solid DOM/SSR graph plus strict public caller negatives. The exact formatted authored fixture was independently rechecked against pinned Solid 1.9.14 production; the permanent gate asserts those frozen expectations without adding Babel or a host compiler dependency.

Actual Moonshine CLI compilation consumes only a complete leading per-file `@jsxImportSource solid-js` selector. Supported local stable synchronous factories use independent Solid ownership and accessor-shaped controls. Minified Chromium verifies two instances, setup/mount order, live props, local state, retained input identity/focus/user edits, connected child cleanup, remount and child-first/LIFO teardown. Fresh subprocess SSR verifies two exact escaped requests with no document. Both browser and SSR bundles exclude host/WASM imports; the strict legacy IR export graph explicitly resolves its declared optional Crepus WASM type peer. This does not claim parser-peer-free declaration checking.

Eighteen representative negative target cases retain prior public facades and create no fresh facade. They cover late/duplicate/fake selectors, async/generator/reassigned or namespace roots, direct known foreign components and unmarked helper imports. A selector before `use strict` has positive factory-selection and selector-consumption assertions: primary integration caught and repaired an original-offset panic that the earlier isolated candidate missed. Unsupported syntax is rejected before publication.

Primary evidence: `/tmp/moonshine-root-solid734/gate.log`, scoped lint/format and exact reviewed patch `f42d01e5`. Fresh current-runtime paired proof is `/tmp/moonshine-root-solid82/app/proof-fixed.log`; built SSR harnesses use distinct `.mjs` names to avoid Bun resolving a same-stem `.js` import back to its TypeScript entry. No generated compiler output is rewritten. Crepus primary reports 3,052 workspace passes, zero failures, sixteen existing ignores and Clippy/format success for the frozen compiler. Moonshine runtime code and measured 4,041-byte core are unchanged from the 2,030-test checkpoint.

This remains an explicit manual native bootstrap, not normal project delivery, tsconfig provenance, imported/foreign component ownership, hydration or full Solid compiler ABI support. A normal raw-TSX Solid project currently builds but fails with `React is not defined`; `/tmp/moonshine-solid-project-audit/HANDOFF.md` records the reproduced gap and missing project-to-compiler provenance transport. Native SSR cleanup remains deterministic synchronous FIFO rather than Solid's deferred server policy. No speed or universal size claim follows from this source admission.

## 2026-10-17 — shared compiler source pipeline

The optional `@tschk/moonshine-compiler/source` entry now owns the existing Crepus invocation, graph validation and immutable publication code. The CLI keeps its argument handling and legacy JSON writer, with compatibility reexports for existing callers. Moved graph/publisher bytes and extracted invocation function bodies match their reviewed originals. The standalone CLI fixture supplies only the compiler manifest and four source modules, proving this entry does not load TypeScript or the route compiler. No dependency or runtime behavior was added.

Primary checks pass: **2,030 tests / 8,833 assertions**, both **25-project** typecheck lanes, the full **734-module / 728 emitted TS** browser/fresh-SSR gate on frozen `82e517ca`, package/adapters/catalog/core-size gates, scoped lint/format and diff checks. Default core remains **4,041 raw bytes**. Logs: `/tmp/moonshine-root-source-extraction/`; reviewed nine-file patch `22ef228f`.

Automatic original-source `buildProject` delivery remains unfinished. Its integration must preserve original source identities for client/server boundary checks, validate before deleting previous output, and preserve shared helper identities across route graphs. The separate Solid project-provenance transport and source/bootstrap selection are still required; this extraction alone does not fix raw Solid TSX project builds.

## 2026-10-17 — authored await source acceptance

The permanent source gate now includes 44 generated await modules from unchanged authored fixtures. The primary passed the complete **778-module / 772 emitted TS** gate with immutable compiler `0e75bbaf`; both strict checkers, five minified Chromium cohorts, eighteen fresh SSR records, two type-negative cohorts and sixteen publication guards pass. The prior 734-module acceptance remains included. Evidence: `/tmp/moonshine-root-await-admission/sfc.log`; reviewed nine-file acceptance patch `74e155ed` and five-file Crepus compiler patch `918c4ff9`.

The cohort covers pending/then/catch and shorthand branches, plain values and promise races, retained branch identity, disposal, nested each/await blocks, two independent instances, renamed/default/nested/rest/array bindings, symbol rest and getter counts, legal member writes/bindings, and escaped helper-name/type collisions. Unknown destructuring and invalid number-member access remain strict errors. Only the generated catch accessor uses the reference language-tool boundary's local `any`; then values keep their inferred types. The optional erased `AwaitValue` and `AwaitInput` exports avoid capturing authored utility-type names. No host runtime, runtime parser or dependency was added.

The compiler reuses the existing await state machine and component descriptor. A per-block builder creates its lazy source reader under that descriptor's existing frame. An earlier JSX-child IIFE passed strict typing but failed actual browser ownership; that shape was rejected. The final builder has real closure work: on the same authored App/current runtime, browser gzip changes from 14,400 to 14,412 bytes and SSR gzip from 8,126 to 8,136. The pinned Svelte workload measures 19,698 and 10,208 gzip bytes respectively. These are selected bundle measurements, not timing or universal size rankings. Reproduction: `/tmp/moonshine-await-source-prototype/cost.ts`. The signal-only core stays **4,041 raw bytes**.

Await alias type queries remain an explicit diagnostic pending the separately staged correction. Async SSR, hydration, arbitrary thenable assimilation and all directive/SSR binding combinations are not established. Native cleanup-error draining/recovery intentionally differs from the reference's failed terminal lifetime. The source compiler snapshot also contains unadmitted constructor/Astro work; this milestone does not admit those features or resolve the JavaScript SFC computed-getter failure. Current primary runtime checks remain **2,040 tests / 8,884 assertions**, both **25-project** typecheck lanes, package/adapter/catalog/core-size checks and affected script lint/format checks.

## 2026-10-17 — authored native mount and ESM source check

A separate permanent source check now verifies **28 generated modules** on immutable compiler `703ceb65`, using byte-identical authored Counter/Launcher and self-import/two-module-cycle fixtures. The primary passed both strict checker graphs with required/optional prop and exported method/value negatives, minified Chromium with two independent instances, synchronous method returns, retained foreign nodes/anchor, copied contexts and idempotent cleanup, two fresh DOM-free server subprocesses, and actual Bun/Node 22 ESM graph cycles. Node receives bundled runtime dependencies while validated compiler-graph relative imports remain external; no handwritten observer replaces emitted modules. Evidence: `/tmp/moonshine-root-mount-admission/check.log`; reviewed six-file acceptance patch `48c64a0f`.

Run `bun scripts/check-native-svelte-mount.ts --compiler <path>` with a compiler that implements native mount metadata. These 28 modules are not added to the **778-module** combined gate yet: `703ceb65` supplies typed native mount source, while the await gate uses `0e75bbaf`. A narrow source merge and one-compiler verification remain required. The current runtime package provides fresh mount/unmount only; hydration, transitions and legacy event/error options remain unsupported. Setup-local interface declaration output still reports TS4060. Public forwarding functions preserve ESM hoisting and setup runs once; their runtime code is real, measured at +42 raw / +9–20 gzip bytes across the eight compared fixtures. No timing claim follows.

## 2026-10-17 — await type queries and lazy mount context

The current common source gate passes **784 modules / 778 emitted TypeScript modules** with immutable compiler `ae8c6f6f`. Its fifty-module await cohort now includes direct and qualified `typeof` queries, nested pattern defaults and annotations, and local shadowing. Both strict checkers pass the positive graphs and preserve exact TS2749, TS2503 and TS18046 failures for invalid types. Six minified browser cohorts, twenty fresh SSR records, five type-negative cohorts and sixteen publication guards pass. Erased queries add no getter reads. This supersedes the prior await-query diagnostic limitation, without admitting constructor or Astro work. Evidence: `/tmp/moonshine-root-type-query-admission/common-sfc.log`; reviewed acceptance patch `99c93b7a` and narrow Crepus delta `0af1b36e` after the original await patch.

An outer await alias assignment inside an inner pattern default intentionally rejects on both native targets. Pinned Svelte accepts the source but emits an invalid assignment target in its client output and a mutable assignment on the server. This guard is a native readonly policy, not diagnostic parity.

Native component context now copies its inherited map on the first context API call, then caches that invocation's copy. The unchanged authored mount launcher matches the pinned Svelte browser records exactly for both instances, caller-map mutation, method calls, anchor placement and cleanup. The permanent standalone mount gate passes all twenty-eight modules, both strict lanes, minified browser checks, fresh server imports and Bun/Node ESM cycles with compiler `703ceb65`. These modules remain separate from the common **784-module** gate until one compiler snapshot combines both source changes. SSR unavailable-mount error formatting still differs (`Error:` versus `Svelte error:`).

The same mount launcher measures native **40,173 raw / 14,528 gzip9 / 13,169 Brotli11 bytes**, versus pinned Svelte **48,921 / 18,066 / 16,256**. Lazy context copying adds twenty raw / six gzip / thirty-one Brotli bytes to that native bundle. No timing or general size claim follows. Evidence: `/tmp/moonshine-mount-context-reference/HANDOFF.md` and `/tmp/moonshine-root-lazy-context/mount-source.log`.

Current repository checks pass **2,041 tests / 8,903 assertions**, both **25-project** typecheck lanes, package policy, eleven adapters, forty-two catalog entries and the **4,041-byte** signal-only core. Hydration, general async SSR, declaration-output gaps, JavaScript SFC computed getters and the remaining ledger variants remain unfinished.

## 2026-10-17 — untouched ancestor context maps

A child context read no longer initializes untouched ancestor maps. The private source lookup skips those ancestors; each invocation still snapshots its inherited map only on its own first context API call. The exact unchanged three-component reference records now match pinned Svelte in minified Chromium and fresh SSR: first child reads `root`, parent reads `changed`, second child reads `changed`. Previously native read `root` for all three. Caller-map mutation and the original mount launcher's full records also match. The new DOM/SSR unit regression passed only after the shared fix. Evidence: `/tmp/moonshine-nested-context-reference/HANDOFF.md` and `unit-before.log`.

The actual same-entry mount bundle is now **40,267 raw / 14,562 gzip9 / 13,246 Brotli11 bytes**, adding **94 / 34 / 77 bytes** to the preceding lazy-copy checkpoint. Pinned Svelte remains **48,921 / 18,066 / 16,256**. Allocation and timing improvements are not established. The default signal-only core remains **4,041 raw bytes**.

Current checks pass **2,042 tests / 8,911 assertions** with the established thirty-second per-test verification window, both **25-project** typecheck lanes, package/adapter/catalog/core-size gates and scoped lint/format checks. The initial simultaneous-build run had seven five-second test timeouts and two follow-on killed-child errors; its log is retained separately. A subsequent normal five-second replay passes all **75 tests / 397 assertions across the seven affected files** in 9.19 seconds (`default-timeout-replay.log`). The same **784-module / 778 strict TS** source gate and separate **28-module** mount gate pass after this shared runtime change. Evidence: `/tmp/moonshine-nested-context-reference/{tests-30s.log,common-sfc.log,mount-source.log}`.

A separate source limitation is now calibrated rather than assumed: template context reads work on initial and reactive renders in Svelte, while retained direct calls fail. Native deferred SSR text can run outside its authored frame, and later child setup can precede an earlier text mutation. Reopening a frame alone cannot fix lexical ordering. This requires coordinated compiler-owned template consumption; the generic native frame initialization guard is unchanged. Exact text/ordering/sibling reference cases and rejected shortcuts are recorded in `/tmp/moonshine-nested-context-reference/lifetime/DESIGN.md`. These references do not establish a source fix or full JavaScript SFC typing.

## 2026-10-17 — tick bridge and unadmitted const calibration

The existing compiler-facing `/ssr` entry now exports an empty async `tick`, matching the pinned server helper rather than flushing a browser renderer's work. A regression proves one-microtask completion, preserves pending browser work, and verifies that browser `tick` subsequently drains it. The affected Svelte suite passes **347 tests / 1,481 assertions**, both Svelte typecheck lanes, package policy, scoped lint/format and the **4,041-byte** core check. This follows the preceding complete **2,042-test** repository run; it does not claim a new complete-suite total. Evidence: `/tmp/moonshine-const-tag-admission/{server-tick.log,svelte-runtime-all.log}`.

A separate two-file Crepus patch (`tick-only.patch`, SHA `d7307507`) maps ordinary imports, aliases and barrels to the existing client or server helper according to target. Frozen prototype `7b771acd` retains the full **784-module** gate and exact generated source/CSS bytes against `ae8c6f6f`; only manifest JSON key order differs, with parsed manifests equal and raw hashes retained. The bridge is staged for the Crepus peer independently of const support.

The unchanged const corpus now emits **26 modules**, but remains **unadmitted**: both complete strict lanes report thirty original JavaScript-to-TypeScript diagnostics; a nested lazy initializer loses the correct lifecycle context; and scalar tagged templates expose a minifier receiver mismatch. Independent typed cases, App/Types browser records, eight parsed SSR records and fourteen publication-preservation guards pass. These partial results do not replace the failing full cohort. The tag correction and explicit-frame evaluation helper remain isolated prototypes. Context references prove that snippets use their consuming component's frame, while cleanup belongs to each derived evaluation; the next design reuses the existing owned Svelte scheduler rather than inventing a global frame. Evidence: `/tmp/moonshine-const-tag-admission/HANDOFF.md` and `/tmp/moonshine-const-context-reference/HANDOFF.md`.

## 2026-10-17 — one compiler for await and component mounting

The common source gate now passes **844 generated modules / 838 emitted TypeScript modules** on immutable compiler `25102730`. Both strict checkers cover the complete generated TS graphs; the six original JavaScript modules retain their syntax/import checks. The inventory is 670 baseline, forty SSR prop, eighteen Vue defaults, six Solid, sixty-four Svelte await and forty-six Svelte mount modules. Native mounting is now part of the common gate, replacing the preceding split-compiler verification. Evidence: `/tmp/moonshine-root-combined-await-mount/full-final-common.log`.

The await additions retain the authored fixture bytes and verify actions together with imported child context, mount/cleanup order, retained plain-value branches, promise transitions, wrapped callback calls, generic instantiation and scalar/member tagged-template receivers. Eight production Chromium cohorts and twenty-four fresh SSR records pass, alongside all five prior type-negative cohorts and sixteen publication-preservation guards. The mount cohort retains both strict caller graphs, production browser checks, DOM-free server import rejection and actual Bun/Node 22 ESM self/cross-module cycles. No generated source rewrites or host runtime aliases are used.

The previous setup-local interface declaration limitation is also repaired in this compiler: the unchanged Alias, Recursive and LocalProps fixtures emit eighteen DOM/SSR modules; both tsc and tsgo declaration emission and strict consumers of each emitted declaration graph pass required-prop, recursive-member and literal-type negatives. The eighteen declaration modules now participate in the common gate and both full strict graphs; both declaration-emission lanes and their DOM/SSR consumers run permanently inside the mount check. The initial separate proof is recorded in `/tmp/moonshine-mount-declaration-acceptance/results.json`, with permanent regression evidence in `/tmp/moonshine-mount-dts-admission/HANDOFF.md`.

Current repository checks pass **2,044 tests / 8,925 assertions**, both **25-project** typecheck lanes, package policy, eleven adapters, forty-two catalog entries and the **4,041-byte** signal-only core. The complete test run uses the documented thirty-second per-test verification window. Scoped common-gate typechecks, lint (zero errors; existing warnings) and formatting pass. Evidence: `/tmp/moonshine-root-combined-await-mount/`. This does not admit the const prototype, full JavaScript SFC typing, deferred SSR text ordering, hydration or general async SSR, nor establish a performance ranking.

The isolated const candidate has progressed on compiler `a6571fb6` with five explicitly hashed runtime overlays: the unchanged App, Nested, Receiver and Types fixtures match all **6 / 13 / 4 / 2** browser records, including per-evaluation lifecycle cleanup and unbound scalar tags. Eight fresh SSR records match parsed HTML, counts and traces; raw void-element syntax still differs (`<input>` versus `<input/>`), and the raw-string comparison remains a recorded failure. The complete twenty-six-module graph still produces **thirty original JavaScript typing errors in each strict lane**; only the twelve-module typed subset passes both lanes. A separate unchanged context fixture is rejected because its snippet is declared inside an HTML element. Neither the const compiler changes nor their runtime overlays are admitted to Moonshine by these partial results. Evidence: `/tmp/moonshine-const-tag-experimental-proof/` and `/tmp/moonshine-const-context-admission/actual-experimental.log`. The candidate retains the earlier STORE source lineage rather than the combined `25102730` baseline; clean integration and full verification remain required.

Pinned Svelte 5.57.1 scope calibration now establishes the intended intrinsic-element rule: snippet declarations belong to the element's children, excluding its opening attributes and outside siblings. Separate/nested elements may reuse a name; duplicate declarations in one children scope reject. Sixteen compiler records, seven production-browser cases and six executable SSR cases are preserved in `/tmp/moonshine-intrinsic-snippet-reference/HANDOFF.md`. The pinned SSR emitter hoists these declarations inconsistently and can emit invalid duplicate declarations for an otherwise accepted script-shadowing case; that exact output is retained as a failure, rather than counted as an executable SSR pass. The native parser extension remains experimental and must preserve lexical scope, generated-name hygiene and unchanged source fixtures before acceptance.

A read-only compiler provenance audit recovered the narrow current await delta and verified scratch application against twelve captured source files (`/tmp/moonshine-251-provenance/HANDOFF.md`, patch SHA `44e91146`). This is not a complete contemporaneous source snapshot for binary `25102730`. The recorded full Rust workspace run passes 3,108 tests with sixteen ignores before the last scheduling change; afterward, the proven scope is fifteen focused library tests, two public integration tests and the CLI build. A clean combined compiler snapshot and final complete Rust verification remain required before release.

The next intrinsic prototype (`a2292a0c`) compiles the unchanged context graph into ten modules and passes both strict lanes, but exact seven-phase browser and two-request SSR comparisons expose real component/control/text construction-order differences. Compiler-owned controls were also incorrectly treated as reactive component identities; the separate `3c020c4e` correction removes those wrappers without fixing the ordering gap. Source, owner, namespace and rejected-shortcut evidence is retained in `/tmp/moonshine-const-context-admission/ORDERING.md`. An early keyed-range preparation attempt fails an existing SVG regression and is not integrated.

Local snippet action lowering is repaired in the isolated compiler: unchanged typed App/Child sources emit eight modules passing both strict lanes, and all four browser phase records now match pinned Svelte, including action setup/update/destroy and child lifecycle. Both SSR records also match. The browser still reports `Invalid insertion range boundaries` during cleanup, so this cohort remains unadmitted. Separate immutable compiler results and raw error evidence: `/tmp/moonshine-intrinsic-directive-replays/HANDOFF.md`. The accepted Moonshine source gate remains the `25102730` 844-module checkpoint; these experiments add no runtime dependency or signal-kernel change.

## 2026-10-17 — retired nested ranges and snippet action ownership

Native insertion-range validation now omits already-disposed nested ranges from a live outer range's ownership ledger. Those children have already removed their DOM nodes; counting them again incorrectly rejected an otherwise intact outer range during branch cleanup. Root cleanup retains its own fallback ledger. Four new regressions cover attached and fragment-prepared ranges, repeated cleanup, foreign-node identity, and continued rejection of live nested ranges moved outside or disconnected from their owner. The focused suite passes 24 tests / 133 assertions. Evidence: `/tmp/moonshine-retired-range-fix/` and `/tmp/moonshine-const-runtime-review/insertion-retired-expanded-{red,green}.log`.

The complete repository run passes **2,048 tests / 8,967 assertions**, both **25-project** typecheck lanes, package policy, eleven adapters, forty-two catalog entries and the unchanged **4,041-byte** signal-only core. The accepted immutable `25102730` compiler still passes the complete **844-module / 838 emitted TS** source gate, including browser, fresh SSR, declarations and ESM cycles. Scoped formatting passes; lint has zero errors and existing warnings. The full test run uses the established thirty-second per-test verification window. Evidence: `/tmp/moonshine-retired-range-fix/{tests.log,typecheck.log,typecheck-native.log,common-source.log}`.

A separate immutable compiler prototype, `194c4d91`, also corrects local snippet ownership by hoisting creation of the existing lazy once-accessor outside a directive range's repeated read root. It captures the authored owner once while keeping initialization lazy. This fixes the subsequent scheduler feedback loop without changing scheduler limits or cleanup rules. With the range correction and the five frozen experimental const overlays, the unchanged typed App/Child graph and a separately authored hide/remount/update graph each emit eight modules passing both strict lanes. All four original and six remount browser phases match pinned Svelte exactly, with zero page errors; four fresh SSR records match HTML after removing only reference hydration comments and match complete traces. Repeated equal writes preserve action counts, remount creates a new node, and later updates retain that node. Evidence: `/tmp/moonshine-once-hoist-replays/{HANDOFF.md,results.json}`.

These sixteen experimental modules do not extend the accepted 844-module compiler checkpoint: their compiler retains the older STORE lineage and still needs clean source integration and complete Rust verification. The separate three-component context fixture still exposes DOM/SSR construction-order differences. Full JavaScript SFC delivery, hydration, general async SSR and the remaining framework coverage are unfinished.

On the same authored mount workload, the range correction changes the native bundle from **40,267 / 14,562 / 13,246** to **40,312 raw / 14,580 gzip9 / 13,194 Brotli11 bytes**: **+45 / +18 / −52 bytes**. The comparison changes only the DOM source file; source and bundle hashes are retained in `/tmp/moonshine-retired-range-fix/mount-size.json`. No timing or general performance ranking is established.

A further unchanged pinned-reference calibration records three browser phases and two fresh SSR requests for attributes, text, child setup, refs/actions and nested SVG/foreignObject elements. DOM sets up both inside and following outside sibling components before the parent's attribute/text reads; update actions observe the old text before those reads. SSR instead evaluates attributes, text and child setup in source order, without ref/action/mount callbacks. Both targets therefore need their own consumption schedule while sharing source-fragment provenance. Raw records, source hashes and compiler warnings are preserved in `/tmp/moonshine-template-ordering-reference/`; this is reference evidence, not an implemented native ordering fix.

## 2026-10-17 — experimental JavaScript SFC delivery

Immutable prototype `f86aa257` emits all twenty-six original const-corpus modules with explicit source-language delivery: pure JavaScript components become real `.js` modules, while typed and mixed-script components retain the existing typed path. Original JavaScript scripts are parsed and semantically validated before lowering; erased output is validated again. Both complete checker graphs pass with `allowJs` and `checkJs:false` for JavaScript bodies while TypeScript and public callers remain strict. This is not a claim that JavaScript bodies are checked as TypeScript.

Actual generated JSDoc component callers pass both strict lanes on DOM and SSR, including required and incorrectly typed props, optional initial values, exported method arguments/returns, and non-any props/export metadata. An earlier candidate lost SSR metadata through an untyped compiler-owned fragment helper; its exact failure is retained. The correction documents that existing helper's SSRChild contract. Reachable `.tsx` and `.d.ts` companions now pass actual generated-graph caller checks on both targets; existing-output declaration shadows reject while preserving both the declaration and facade bytes. The allocator protects TypeScript's `.ts`, `.tsx` and `.d.ts` substitution family at the preferred and suffixed component paths. Evidence: `/tmp/moonshine-js-sfc-source-prototype/corrected/{run,public,allocator,declarations}.log`.

The same immutable candidate now matches all 6 / 13 / 4 / 2 original App/Nested/Receiver/Types production-browser observations with zero page errors, using the five frozen const runtime overlays and current DOM range correction. Eight fresh SSR records match parsed tags, attributes, text, counts and complete traces. The inherited raw `<input>` versus `<input/>` comparison remains a recorded failure. Ten negative publication cases preserve existing facade bytes; typed negative consumers retain exact TS2322/TS2339 diagnostics in eight checker lanes. Separate actual Generic/Defaults source callers verify generic correlation, mutable payloads and default widening on both targets and both strict checkers. Evidence: `/tmp/moonshine-js-sfc-source-prototype/FINAL-HANDOFF.md`.

This candidate remains isolated on the older experimental compiler lineage. Full Rust verification and clean integration with the accepted compiler remain required; these twenty-six modules do not extend the accepted 844-module checkpoint. Authored JSDoc import types and selected aggregate forms explicitly reject; arbitrary mixed-script typing is unfinished. No host runtime or runtime parser is introduced.

Pinned mixed-script calibration covers forty-two exact sources on both targets: 56 compilations succeed and 28 reject, with no `mixed_language` diagnostic. Svelte 5.57.1 selects one component-wide parser mode from the first explicit language attribute. TS-plus-unmarked scripts work in either direction. The frozen native candidate matches 80 of 84 acceptance outcomes; four explicit-JS-first conflicting-language cases remain native extensions. Four representative two-instance class/component probes and eight fresh SSR records match the reference; explicitly typed public props/methods pass both strict lanes. Plain JSDoc props on the native global-TS delivery path retain an `any` observation, without an official language-tool checker comparison. Evidence: `/tmp/moonshine-mixed-script-reference/HANDOFF.md`.

A separate twenty-four-record grammar calibration proves that the tested await/each TypeScript assertions and binding annotations reject without TypeScript mode and compile with it. The earlier native candidate incorrectly accepts three JavaScript forms. Valid JavaScript computed-member cases also expose missing source-policy forwarding through raw HTML and each-header checks; the corresponding TypeScript duplicate-member policy remains a separate diagnostic difference. Typed each-binding annotations are still a coverage gap. Exact source bytes, reference/native diagnostics and hashes: `/tmp/moonshine-svelte-header-grammar-reference/HANDOFF.md`.

A new combined source candidate starts from a fresh 476-file snapshot of current Crepuscularity. It composes the held Svelte const/constructor/intrinsic and JavaScript changes while preserving current await scheduling, call/tag/type-query handling, mount declarations, effect-name hygiene and unrelated framework files. It now passes **64 focused native tests and four CLI allocator/publication tests**, with immutable combined CLI `82f6dba1` frozen against a verified 626-file build-source inventory. Original JavaScript header grammar and raw-HTML/each policy regressions pass. A strengthened const/action/await fixture exposed a callback-placement failure; the narrow correction preserves exact const-body provenance, component child arrays and the actual fresh block alias. The combined source patch applies with exact hash parity across all thirty-six changed or added paths, while the original 476-file LIVE baseline remains unchanged.

Generated-source admission is still pending: the same combined CLI must retain the accepted 844-module baseline, actual JavaScript public contracts, production-browser behavior and fresh SSR results. Full Rust workspace checks remain pending. The separate template-ordering prototype and Astro prototype are not included. Evidence: `/tmp/moonshine-combined-source-candidate/{HANDOFF.md,VALIDATION.md,validated-patch-verification.json}`. This focused checkpoint does not extend the accepted 844-module coverage or establish full SFC/rune/component support.

## 2026-10-17 — combined source-language compiler gate

Immutable combined compiler `82f6dba1` now passes **850 generated modules**: all original 844 modules retain their census and behavior checks, with six additional DOM/SSR JavaScript public-type modules. The unchanged 670-module base graph now contains **638 strict TypeScript and 32 actual JavaScript modules**; the previous 838-TS label does not describe this compiler. Original JS remains compiler syntax/scope validated and import checked with explicit `allowJs` / `checkJs:false`; all TypeScript and public callers remain strict in both installed lanes. The new source-hashed JSDoc fixture verifies required/optional props, method parameters/returns and non-any public fields on both targets.

The complete gate retains production Chromium, fresh SSR, 64 await modules, 46 mount modules, both declaration-emission/consumer lanes and actual Bun/Node22 ESM cycles. Evidence: `/tmp/moonshine-combined-source-admission/{common-source.log,checkpoint.json}`. The separate 26-module const corpus also passes both complete checker graphs and the original 25 browser observations/eight parsed SSR records using the five frozen experimental runtime overlays. Those overlays remain unadmitted; raw void-element HTML syntax still differs from the reference. Full Rust workspace verification, authored ordering, typed each bindings, hydration, general async SSR and full remaining framework coverage are still pending. No performance ranking is established.

The same final source now also passes **all 657 native library tests**, with no ignored or filtered tests and verified unchanged source/compiler hashes. This supplements the thirty-four focused integration and four CLI tests; it does not establish a full Rust workspace/Clippy pass. Evidence: `/tmp/moonshine-combined-source-candidate/{all-native-lib.log,all-native-lib-run.json}`.

## 2026-10-17 — const runtime integrated without overlays

The opt-in Svelte `/const` entry now owns lazy per-evaluation cleanup through the existing derived/history machinery. It obtains the consuming component from the existing rune scheduler carrier; ordinary reads create an evaluation owner, while historical cleanup reads retain the original cleanup owner and scoped context capability. Nested restoration, exceptions and disposal keep the no-new-owned-work guard active until the synchronous boundary exits. The signal-only core and independent renderers remain unchanged; no host runtime dependency was added.

All **19 lifecycle regressions / 194 assertions**, **2,075 repository tests / 9,180 assertions**, both **25-project** typecheck lanes, package/adapter/catalog/size gates and scoped formatting/lint pass. The four new regression files also pass a separate strict TypeScript check; stale unused frame arguments from the old scratch tests were removed without changing their runtime expectations. Independent review found no new issue. The full **850-module** source gate passes again against the integrated runtime. Evidence: `/tmp/moonshine-const-runtime-integration/`.

A separate exact-source replay now uses actual Moonshine package bytes with **zero runtime overlays**: the complete 26-module const graph, strict public/generic/default/shadow-publication checks, 25 browser observations and eight parsed SSR records pass. A valid JavaScript const/action/await composition additionally passes three browser phases and two fresh SSR records. The original deliberately colliding class fixture remains a compile-only language-policy regression. Evidence and package/source hashes: `/tmp/moonshine-combined-js-main-admission/HANDOFF.md`. Raw void-element syntax still differs from pinned Svelte.

A matched inactive-feature microbundle comparison measures **+70 gzip bytes** for DOM, **+70** for SSR and **+109** for the Svelte counter. The isolated signal example remains byte-identical at 612 raw / 383 gzip bytes; the repository default core check remains 4,041 raw bytes. These are size costs, not timing or universal performance claims. Full authored construction-order parity remains incomplete: the unchanged three-component fixture still differs in all seven DOM phases and both SSR records on the combined compiler. Those ordering failures, typed each bindings, hydration and general async SSR remain open.

## 2026-10-17 — typed each and SSR ownership investigation

An isolated typed-each candidate reuses the existing opaque header metadata rather than adding a core IR field. Original JavaScript annotations reject; typed scalar and existing static-object patterns retain exact type spans, accessor types for DOM readers and value types for key/server snapshots. Boundary recognition now distinguishes complete legal syntax from unsupported array/default/rest lowering, including inline optional object types. The first candidate passes **662 native library tests**. Focused integration found a real scalar-row member-binding gap: the existing accessor rewrite produced a call-rooted target rejected by the binding guard. The positive test remains unchanged. A staged correction reuses lexical getter views and precomputes binding symbols once; it has not yet been rerun through Rust or an immutable CLI. Evidence: `/tmp/moonshine-typed-each-source-prototype/HANDOFF.md` and retained failing integration log. None of this extends accepted source coverage yet.

The unchanged SSR context failure also needs a corrected diagnosis. Raw records show the const write occurs **before** the following sibling read, yet that sibling still sees the original context. A separate exact API reduction proves that passing a compiler control through generic `h` creates a private component frame; invoking that control transparently preserves the authored context. Actual authored child components must retain their own frames. This is distinct from deferred text serialization, which must preserve the consumer through complete serialization rather than only factory invocation. The isolated optional-consumer `defer` prerequisite passes **63 tests / 296 assertions** and both strict lanes; compiler integration and source parity remain pending. Evidence: `/tmp/moonshine-ordering-combined-audit/PRIMARY-SSR-CORRECTION.md`, `/tmp/moonshine-ssr-control-frame-proof/` and `/tmp/moonshine-ssr-consumer-prototype/`.

## 2026-10-17 — typed each regression gates and remaining source gaps

The scalar member-binding correction now passes **665 native library tests**, **20 focused integration tests**, native all-targets Clippy and **four CLI allocator tests**. Immutable compiler `57b9b27d` also passes the complete **850-module** acceptance gate and the 26-module JavaScript/const replay against current Moonshine packages with **zero runtime overlays**. Original source and package hashes are retained in `/tmp/moonshine-typed-each-source-prototype/`, `/tmp/moonshine-typed-each-common-admission/common-source.log` and `/tmp/moonshine-typed-each-js-replay/HANDOFF.md`.

New source admission remains incomplete. The original 25-form matrix produces 50 DOM/server records: 28 accepted and 22 rejected. Seven legal array/default/rest forms remain unsupported. Its complete generated type graph retains a literal `typeof` annotation error. The unchanged fixture passes official svelte-check 4.7.6 with Svelte 5.57.1 and TypeScript 5.9.3, but inspecting that checker output shows the annotation is dropped: its loop checks `item` as `number`, not the authored literal type. That pass therefore does not establish the intended annotation contract. Contextual typing and invalid-collection controls remain under investigation. A separate named-row application passes both strict checker lanes, 16 publication guards and two fresh SSR requests. Its browser comparison exposes four extra method calls on index-only keyed reversal; rendered values, bindings, focus, node identity and disposal otherwise match. Server output also erases key/setter expressions needed for complete authored type validation. These failures remain recorded in `/tmp/moonshine-typed-each-source-admission/HANDOFF.md`; passing the earlier corpus does not waive them.

The transparent SSR helper correction, composed onto the typed candidate, now passes **669 native library tests**, the same **20 focused integrations** and native all-targets Clippy with all 627 source hashes unchanged. Evidence: `/tmp/moonshine-ssr-transparent-typed-prototype/`. Four CLI allocator tests also pass. Executable build/freeze and the unchanged authored context fixture remain pending disk headroom; no new SSR runtime API has been integrated. Array/default/rest lowering, construction ordering, hydration, general async SSR and full framework coverage remain open.

## 2026-10-17 — SSR context and destruction ownership

Compiler `4e12d3db` was frozen from the executable actually built and exercised by the passing CLI integration tests; no redundant separate build is claimed. It passes the complete **850-module** source gate with zero runtime overlays. Replaying the unchanged three-component context fixture now produces exact SSR HTML and context reads, exposing a separate destruction-order difference: public hooks registered inside synthetic memos were attached to those memos instead of the authored component.

Moonshine's Svelte `onDestroy` now registers SSR hooks on the active consumer component owner. It captures the transient render attempt before switching registration owner, preserving discard suppression; raw-snippet registrar precedence and browser cleanup behavior remain unchanged. The regression fails on the original runtime and passes after the fix. The unchanged context fixture now matches both fresh SSR requests, including the complete destruction trace, against current package bytes with zero overlays. Its ten generated modules pass both strict checkers. That earlier build still differed in seven browser ordering phases; the final combined compiler replay below supersedes this failure.

Verification: **32 focused tests / 226 assertions**, **2,068 repository tests / 9,167 assertions / 1,108 files**, both **25-project** checker lanes, package/adapter/catalog/size gates and scoped lint/format pass. A matched example importing `onDestroy` adds **38 raw / 19 gzip bytes** in each DOM and SSR bundle; this is a size cost, not a timing claim. The core gate remains **4,041 raw bytes**. Evidence, before/after regression, portable patch and package lineage: `/tmp/moonshine-ssr-transparent-context-admission/`. The full **850-module** source gate also passes against the integrated lifecycle fix, with all 136 inventoried package files unchanged and zero overlays; evidence: `/tmp/moonshine-ssr-owner-main-admission/result.json`.

The independently composed ordered-DOM compiler candidate passes **670 native library tests**, **26 focused integration tests** and native all-targets Clippy with all 633 source hashes unchanged. Its new ordering/namespace fixtures still require executable/browser admission. Explicit each-annotation contextual typing is also still experimental; no claim of complete SFC, rune, hydration or framework coverage is made.

Actual ordered-source admission with frozen compiler `6cb84954` exposes two failures hidden by those emitter tests. The unchanged context graph has two undefined generated `__crepusOnce0` references: ordered intrinsic-child callbacks need the existing helper even when the earlier inspection recorded no once span. A narrow helper-emission correction and regression are staged. The unchanged action/namespace fixture also rejects intrinsic `bind:this` in both targets, an existing parser limitation. Pinned Svelte passes that original fixture's six browser phases, namespaces and two fresh SSR requests; native admission remains RED rather than removing its binding. Evidence: `/tmp/moonshine-ordered-dom-source-admission/` and `/tmp/moonshine-ordered-dom-once-fix/`.

## 2026-10-17 — Compiler integration and preserved live behavior

The compiler changes are now applied to the live Crepuscularity checkout as an 88-file patch, after verification in a source snapshot that preserves concurrent work. This is local integration, not a compiler commit or release. The combined candidate retains the live native codegen, input/default validation, Solid/Vue textarea SSR fixes, atomic IR mutations, owned IR encoding, path-aware hot reload, public diagnostics, parser validation and CLI source collection guards.

Frozen CLI `2d336f64c55f691f1a8df3d464c99f346287a41cefcd0ddbea4c026c8965a82b` passes 823 native tests, the complete default-feature core test command (662 tests), 48 source-emission CLI tests and the 850-case Moonshine application gate. Optional watch tests were not enabled. All 67 changed Rust files pass scoped rustfmt checks. Source and output inventories, command logs, original-file backups and the applied patch are under `/Users/undivisible/.cache/moonshine-live-merged-integration/`. The broad core/native/CLI all-targets Clippy command currently fails on the unchanged CLI `src/preview.rs` test-module ordering; it is not a passing release gate.

Authored `globalThis` bindings use the opt-in Moonshine DOM `/platform` entry for compiler-owned realm and type access. The generated descriptor helper also qualifies the built-in `NoInfer` type, preserving authored types with that name. Generic calls and tagged templates through destructured each fields retain an unbound receiver; four minified browser mounts and eight fresh minified SSR renders pass on the earlier isolated integration build. The final combined frozen binary now passes the unchanged two-case replay: four minified browser mounts, eight fresh minified SSR renders and clean disposal, with no host runtime or parser in the bundles. Its copied runtime files match current package sources; evidence is in `each-instantiation-final/result.json` and `runtime-source-inventory.json` under the combined integration directory.

Function and class names are preserved in the separate-module compiler tests. The minified bundled name test remains unsupported by the observed Bun 1.4.0 behavior: an ordinary function/class/arrow example with no Moonshine or Crepuscularity input also changes observable names despite `bun build --minify --keep-names`. The standalone reproduction is `/Users/undivisible/.cache/moonshine-bun-name-calibration/`. This does not establish name preservation after minification or universal bundler compatibility. Complete SFC/rune coverage, hydration and general async SSR remain unproven; no new broad performance claim is made by this integration.

Core/native all-targets Clippy and CLI binary Clippy now pass with warnings denied. The broad CLI test-target lint failure above remains open. The combined parser also builds for `wasm32-unknown-unknown`; freshly generated wasm-bindgen 0.2.126 bindings pass all 65 unchanged npm wrapper tests (255 assertions). This is a debug WASM build and public-wrapper test, not a release-optimized artifact or publication.

## 2026-10-17 — combined integration completion and portable runtime entry

The combined compiler snapshot now passes all 171 native integration targets (751 tests) and all 29 CLI integration targets (170 tests). The latter includes the complete 29-test web CLI suite and eight Tauri tests after correcting the isolated test environment's target lookup and using the installed Rust toolchain for nested WASM builds. These counts overlap earlier focused suites and must not be added to them. Test-only follow-through corrected a stale generated type qualifier and the pure-JavaScript module output extension; the frozen executable's production source did not change. Evidence is retained in `native-all/result.json`, `cli-all-admission.json` and `merged-web-cli-complete-result.json` under the combined integration directory above. The unrelated broad CLI test-target Clippy failure remains open.

Moonshine commit `8572930` prepares SDK 0.4.6, including the independently committed Node portability fix. The opt-in DOM `/platform` entry ships JavaScript plus adjacent declarations: actual packed-package imports pass in Node 22 and Bun, and the packed type fixture passes TypeScript 5.9, TypeScript 7 and tsgo. SDK validation passes 2,100 tests, both 25-project checker lanes, package-policy checks and the unchanged 4,041-byte complete signal-only entry gate. This records a different measurement from earlier selected-consumer sizes. No npm publication, complete SFC coverage, hydration, general async SSR or performance superiority is implied.

The final combined frozen compiler `2d336f64` now matches the unchanged context fixture reference across all seven browser phases and both fresh SSR requests, including context reads and destruction traces. All ten generated modules pass both strict checker lanes. Source hashes match the earlier three-component fixture, runtime copies match current source, and no overlays were used. Evidence: `context-order-final-result.json` in the combined integration directory and its recorded artifact path. This closes this fixture’s construction-order failure; it does not establish general lifecycle or full SFC parity.

## 2026-10-17 — final combined typed-each matrix

The unchanged original 25-form typed-each matrix now produces 42 accepted DOM/SSR builds and eight rejected builds with frozen combined compiler `2d336f64`. All seven formerly unsupported legal forms compile: array patterns, defaults, holes, object defaults, rest, readonly arrays and tuples. Both strict checker lanes pass the entire 88-module generated graph, including the earlier literal `typeof` failure. The four rejected forms remain `bothAnnotation`, `indexAnnotation`, `patternWholeDefault` and `wholeDefault`; this replay does not reclassify the reference language behavior. Original source hashes match the prior matrix. Evidence: `typed-each-final/result.json`, compile records and checker logs under the combined integration directory. Browser semantics for the seven newly accepted forms and the separate SSR negative-type controls remain unverified by this matrix.

The final combined compiler negative-type replay retains four unexpected checker passes out of 24 records: SSR readonly-member binding and wrong-key argument, each under tsc and tsgo. The other twenty records fail with their expected diagnostic codes. SSR key non-evaluation is an explicit existing compiler test contract; fixing validation must preserve it. Evidence: `typed-each-final/negative-summary.json`, original diagnostics and unchanged negative fixture generator. Positive matrix checker success does not close these two authored-type gaps.

## 2026-10-17 — SSR authored key and setter validation

The two-file Crepuscularity fix is now applied to live source after 720 native library tests, native library Clippy with warnings denied and the complete 850-case Moonshine application gate passed. Compiler `8034d33e` retains authored key and setter checks in statically unreachable branches: all 24 original negative records now fail with their expected diagnostics, while the unchanged 88-module positive matrix passes both checker lanes. Forty fresh prototype SSR renders match baseline across throwing key functions/getters and input, checkbox and textarea setters, in minified and unminified builds. None of the five selected minified fixture bundles adds raw bytes; unminified fixtures add eleven bytes. These are fixture measurements, not a universal size claim.

The first comma-based setter prototype failed the full gate with TS2695; the accepted conditional form fixes that regression. Decoded authored names are reserved for setter parameters in both DOM and SSR. Explicit index-identity key optimization still erases type wrappers and remains a separate validation gap. The broader unrelated CLI test-target lint failure remains open. Evidence, exact source hashes and before-file backups are retained in `ssr-validation-live-applied.json`, `ssr-type-validation-prototype.patch`, `ssr-key-validation/` and `ssr-validation-application-conditional/value850/` under the combined integration directory. This compiler patch has not been committed or published.

## 2026-10-17 — authored index-key type wrappers

Index-identity keys now retain authored type validation in both DOM and SSR while continuing to use the index renderer without a runtime key property. The one-file Crepuscularity patch passes 721 native library tests, native library Clippy with warnings denied and the complete 850-case application gate. All 32 negative checker records reject with expected diagnostics, including missing wrapper types and invalid `satisfies` clauses. Both strict checker lanes pass the 28-module positive wrapper graph. Seven minified Chromium phases match the prior integrated compiler for destructuring-default counts, input identity, replacement/reversal, hide/show, disposal and stopped writes. The original source frontend already rejects angle-bracket assertion keys; that boundary is unchanged.

The single reviewed file is applied live with baseline/hash guards and a before-file backup. Evidence: `index-key-validation/live-applied.json`, `candidate.patch`, wrapper/type/browser records, and `index-key-application/value850/` under the combined integration directory. This closes the recorded index-key wrapper erasure gap, not full TypeScript or SFC coverage. No compiler commit or publication has occurred.

## 2026-10-17 — grouped text call memoization

A four-file compiler-only fix is now applied to live Crepuscularity. Ordinary DOM text calls are classified before generated row/index accessor calls appear, using existing authored-expression metadata and the existing independent derived-value API. Plain property/getter readers stay live. Memoized call values are snapshotted before ordinary group readers, preserving Svelte’s call-before-getter order even when a getter changes a later call dependency. No runtime API, dependency or signal-kernel change was added.

Frozen compiler `2399199b` passes the unchanged original typed-each application across all eight browser phases: reversal now retains eight method calls instead of twelve, while key/getter counts, receiver behavior, text, bindings, focus, retained input identity and cleanup match pinned Svelte 5.57.1. Two separate authored order/mutation cohorts also match across eight phases each. The normal/throw/dispose callback guards match the prior native compiler. Verification passes 726 native library tests, forty focused integration tests, native library Clippy with warnings denied, both strict lanes for twelve emitted cohort modules, and the complete 850-case application gate with zero runtime overlays. The focused integrations ran serially after a disk guard stopped the first batch during compilation; closed task-owned artifacts were reclaimed without changing source or frozen executables.

Scope remains bounded: textarea-specific call-reader caching is unchanged, SSR lowering is unchanged, and full SFC/rune parity is not claimed. Exact hashes, the reviewed patch, before-file backups and proofs are retained in `text-call-live-applied.json`, `text-call-candidate.patch`, `text-call-browser-admission.json`, `text-call-error-guards/`, `text-call-serial-integrations-result.json` and `text-call-application/value850/` under the combined integration directory. The compiler changes remain uncommitted and unpublished.

The follow-through text emitter specialization is also applied live: call-snapshot support is emitted only when the module’s owned text markers require it. The ordinary two-component counter now reproduces its pre-memo-fix browser bundle byte-for-byte (39,750 raw bytes), removing the temporary +117 raw / +44 gzip cost measured with the same compressor. All DOM and SSR files in the three call-bearing cohorts remain byte-identical to the already validated fix. The specialized compiler passes 726 library tests, Clippy and the complete 850-case gate. Evidence: `text-call-size-live-applied.json`, `text-call-size-code-equivalence.json`, `counter-bundle-audit/size-cost.json` and `text-call-size-application/value850/` under the combined integration directory. This is a bounded bundle-size result, not a speed claim.

## 2026-10-17 — head metadata reference contract

Component `<svelte:head>` remains explicitly unsupported by both native targets; it is distinct from the existing server-route title/description/lang metadata API. A pinned Svelte 5.57.1 reference now records seven Chromium phases and two fresh SSR renders from identical parent/child components. Ordinary meta tags remain duplicated across components; child meta/link nodes are removed on branch teardown, while the last document title survives child removal and full unmount. A later parent title update wins even with the child present. SSR emits head separately, retains both meta declarations and selects the later/deeper child title with escaping. Generic meta deduplication or automatic restoration of the parent title would therefore be a mismatch at the Svelte component layer.

Reference source, generated outputs, browser/SSR records and current explicit native rejections are in `head-reference/` under the combined integration directory. Official syntax/SSR separation reference: https://svelte.dev/docs/svelte/svelte-head . No head runtime or parser feature is admitted by this reference-only checkpoint.

### Isolated component head admission — 2026-10-18

The isolated Crepus/Moonshine head prototype now compiles the unchanged parent/child Svelte reference into both native targets. Seven Chromium phases match Svelte 5.57.1 exactly, including body whitespace, reactive title precedence, child head cleanup, and retained title after unmount. Two fresh SSR requests match separate head/body output on both Bun and Node 22.23.1 (comparison removes only Svelte hydration comments and known void-tag slash spelling). The browser graph contains no host framework runtime, parser WASM, or SSR serializer. Both project TypeScript checkers accept both emitted module graphs. All 34 target/syntax combinations match the pinned compiler's acceptance or rejection.

The first compiled comparison exposed extra body whitespace around the head marker. The compiler text pass now ignores compiler-owned head/title markers when determining body whitespace edges, consistent with the installed Svelte compiler's hoisted-node handling. A regression test covers DOM and SSR. Core library tests (445), native library tests (736), and core/native library Clippy passed before formatting; final repository integration and wider regression gates remain pending. Runtime head/framework tests pass (28 tests, 110 assertions).

Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/head-source-admission/verified-progress.json`, `head-source-admission/comparison.log`, `head-constraint-admission/result.json`, `head-whitespace-library-run.json`, and `head-whitespace-clippy-run.json`. Changes remain isolated prototypes; the live/released compiler does not yet accept component head syntax. This evidence does not establish hydration, async SSR, arbitrary head scripts/styles, or complete Svelte compatibility.

The expanded head SSR edge matrix exposed two further differences after the initial admission: static/dynamic title whitespace must remain verbatim, and multiple titles in one head follow first-title precedence after direct title nodes are hoisted before branch content. The Sonnet source review independently identified whitespace cleanup as incorrect. Prototype fixes now preserve title parts and track first accepted titles per head scope; direct title markers are hoisted within their declaring JSX fragment. Runtime regressions pass (29 tests, 112 assertions); all 736 native library tests also pass. Expanded compiled edge comparison and final integration remain pending. Evidence: `head-source-admission/edge-ssr/result.json` (red comparison), `head-title-review-worker.log`, `head-title-hoist-library-run.json`.

The expanded compiled SSR comparison now passes all 14 cases: whitespace-only/newline titles, dynamic spaces, repeated titles, titles before/after conditional branches, two title branches, empty title, entities, plain head text, SVG titles, ordinary body titles and head between body siblings. Direct title calls are hoisted within their declaring fragment (without crossing branch boundaries); the first accepted title in each head wins, while later component head scopes can override it. Evidence: `head-source-admission/edge-ssr/result.json` and `head-title-hoist-cli-run.json`. Previous red results are retained in `head-source-admission/edge-ssr/before-title-hoist.json`. This remains isolated work; the compiled browser suite must be rerun after the latest hoisting change before integration.

### Head support applied to local repositories — 2026-10-18

Head runtime, opt-in exports, framework document collection, tests and package documentation are now applied to Moonshine. Authored source parsing, title/head lowering, whitespace and title-hoisting changes are applied to Crepuscularity, after verifying all affected live compiler files matched the tested source baseline. Original files and hashes are backed up under `head-live-backup` / `head-live-applied.json`. Unrelated changes were preserved.

The latest compiled browser comparison passes all seven phases after title hoisting. The live Moonshine suite passes 2,118 tests / 9,347 assertions; both TypeScript checkers pass all 25 projects; package policy, 11 adapters, 42 catalog IDs and the 4,041-byte signal kernel gate pass. Scoped new head code lint passes; existing SSR lint warnings remain unchanged. Live Crepuscularity core/native library tests pass 445/746 tests, and library Clippy passes. Diff whitespace checks pass. No commit or publication has been made for head support. A fresh live compiler executable and wider compiler integration targets remain to be checked before release; prototype emission evidence alone is not a release claim.

### Live compiler and SSR isolation review — 2026-10-18

The live CLI now builds and is frozen in `head-compiler-live-frozen` / `head-live-cli-freeze.json`. A changed dependency feature graph required rebuilding the resolved offline dependency chain; disk guards remained active. Three checked-in authored head integration tests pass, along with six broader Svelte integration targets (33 tests). The live executable compiles both parent/child targets, whose seven browser phases and two Bun/Node SSR requests match the pinned reference; all 14 SSR edge comparisons also pass.

An independent Sonnet runtime review produced four verified failing SSR head isolation cases: nested collectors under pending boundaries, leaked head from lexically owned children in discarded buffers, retained declarations after caught head setup failures, and nested plain SSR roots publishing to an outer collector. Scoped fixes add a synchronous render token, active-buffer publication capture and transactional entry rollback. All four regressions now pass. The first full-suite rerun identified two raw-snippet cleanup regressions; preserving lexical lifecycle capture separately from active head-publication capture fixes both. The affected five suites pass 34 tests / 80 assertions. A fresh full Moonshine suite and both typecheck gates are running; do not treat the earlier all-green suite as validation of this latest isolation change. Evidence: `head-isolation-red.log`, `head-isolation-moonshine-test.log`, `head-isolation-fixed-moonshine-test.log`, `head-runtime-final-review.log`, `head-live-serial-integrations-result.json`.

The nested lifecycle audit also reproduced skipped destruction hooks in an independent `renderToString` called while an outer boundary was pending. A new request now removes the inherited lexical attempt, while preserving other component context. The regression lives in `packages/adapter-svelte/test/raw-ssr-no-outer.test.ts`. All five affected suites pass (35 tests / 80 assertions), both 25-project typecheck gates pass, scoped lint/diff checks pass and the signal-only kernel remains 4,041 bytes. The latest compiled browser and 14 SSR-edge comparisons pass against the fresh live compiler and current runtime, including fresh Node requests. Full-suite validation is running in `head-nested-cleanup-moonshine-test.log`; the obsolete earlier run was explicitly cancelled after the new source change. No publish has occurred.

### Head runtime committed — 2026-10-18

Moonshine head runtime and isolation fixes are committed in `747673c` (`feat(dom): add owned document head rendering`), with 14 scoped files and unrelated work left untouched. Latest full suite: 2,122 passes / one failure in the unchanged Cloudflare CSS fixture's `/var` vs `/private/var` entry-point comparison. The isolated Cloudflare/workerd rerun passes both tests / 12 assertions. This is scoped green rerun evidence, not an all-green single full-suite run. Both 25-project typecheck gates, scoped lint/diff checks, package/adapters checks, compiled browser/SSR comparisons and unchanged 4,041-byte signal kernel are verified. Crepuscularity source lowering remains uncommitted/unpublished; no npm publication or head release tag has occurred yet.

### Moonshine 0.4.7 release candidate — 2026-10-18

Release commit `1009b38` is pushed after the scoped head commit. The detached release tree's tracked files match that commit exactly and pass 2,121 tests / 9,279 assertions (253 files), both 25-project typecheck lanes, complete format/lint, package policy, adapters, catalog and unchanged 4,041-byte signal kernel checks. All 26 public tarballs contain valid 0.4.7 manifests and matching internal ranges. A consumer extracted from the actual core/DOM/framework tarballs passes strict TS/tsgo and fresh Bun/Node bundled SSR request checks, including title precedence and discarded head suppression. The live worktree's earlier CSS-path failure does not occur in the detached release run. CI run `39037728362` is in progress; tag and GitHub release wait for its outcome. No npm publish was invoked.

Moonshine 0.4.7 is now tagged and released on GitHub at `https://github.com/tschk/moonshine/releases/tag/v0.4.7`. The remote tag resolves to `1009b3844b7111eba9138147b82590fa6d889496`; CI run `39037728362` succeeds for Linux JS, macOS JS and Dart. No npm publish was invoked. Crepuscularity source support remains unpublished. A Sonnet read-only investigation into native `<svelte:element>` is running in `dynamic-element-investigation.log` (session 69907); architecture and implementation decisions remain with the primary agent.

### Head release SSR cost comparison — 2026-10-18

A three-fixture run of the existing 100-row exact-HTML SSR workload compared 0.4.7, frozen 0.4.6 and Solid1.9.14 in the same process with alternating fixture order (25 measured batches of500 renders,5 warmups,7 fresh-process samples). Ordinary SSR bundle: 0.4.7 =10,951 raw /4,364 Bun-gzip bytes;0.4.6 =10,687 /4,268 bytes (+264 raw,+96 gzip). This is the shared request/attempt isolation cost even when no head API is retained; the default signal kernel remains unchanged. The optional collector itself is not in this workload.

Batch medians:0.4.7=46.30ms,0.4.6=49.11ms,Solid=13.85ms. Fresh process/import/render medians:20.61ms,19.45ms,21.20ms respectively. Shared host load and run variance prevent a stable relative speed claim. Moonshine remains slower than the Solid server-call fixture in this scoped workload despite its smaller bundle. Evidence and full source hashes: `head-ssr-benchmark.json`; reproducible benchmark source preserved in `head-release-benchmark.ts` under the integration cache. Temporary executable source was removed after process completion.

### Dynamic element reference admission — 2026-10-18

Pinned Svelte5.57.1 references now cover18 authored `<svelte:element>` forms on both compiler targets,16 accepted forms through fresh synchronous SSR, and10 Chromium mount/update/teardown phases. The current live native compiler rejects all18 forms explicitly; no dynamic-element implementation is claimed. Missing `this` and `bind:value` reject in Svelte; falsy tags suppress output, while numeric truthy tags throw during SSR. Duplicate `this` attributes are accepted: the first selects the tag and the next becomes an ordinary `this` attribute. Void SSR tags omit children. SVG namespace, explicit xmlns, custom tags, raw-text children, spreads and bind:this all need explicit coverage.

The browser fixture proves stable node/child identity across text updates, events and same-tag writes; a tag change creates the new child before destroying the previous child. Null/empty tags remove content and clear the reference. Restoring the tag creates a fresh child; unmount destroys it. No browser errors occurred. Fixtures include keyboard semantics/ARIA rather than accepting accessibility warnings. Evidence: `dynamic-element-reference/constraints.json`, `dynamic-element-reference/ssr-result.json`, `dynamic-element-reference/result.json` and their executable scripts under the integration cache. A read-only Sonnet investigation remains live (session69907); its design report is not yet available.

### Dynamic element runtime reuse proof — 2026-10-18

A host-free imperative native fixture now matches all ten Chromium reference phases exactly using only the existing `mapArray` (identity scheduler) and native `h`/signal/cleanup APIs. Node identity, reactive text/attributes, click events, reference clearing and create-before-destroy replacement ordering match; bundle inputs contain no Svelte/Solid/React runtime or parser WASM. No runtime code or export was added. This proves the ordinary HTML ownership path can be reused; it does not yet prove compiled source, namespaces, spreads, actions, void elements or type diagnostics. Evidence: `dynamic-element-reference/native-runtime-result.json`, `native-runtime.ts`, `check-native-runtime.ts`.

The Sonnet investigation finished (`dynamic-element-investigation.log`). Its proposed new factory pair is not adopted yet because the reuse proof supports trying compiler-only lowering first. Its suggested unsupported bindings/directives/spreads must not remove existing native source capabilities; implementation must reuse existing intrinsic handling and track any real gap explicitly. A second Sonnet worker owns only core `parser/svelte/authored.rs` in the 1,920-file source-only `dynamic-element-compiler-prototype` (session32585); primary retains native lowering and integration. The baseline hashes are in `dynamic-element-compiler-baseline.json`; the live compiler and released runtime are unchanged by this experiment.

### Dynamic element compiler prototype — 2026-10-18

Both Sonnet workers are terminal. Core parsing reuses intrinsic handling and adds private element/selector metadata; native lowering uses existing mapArray and intrinsic emission. The primary added a compiler-only tag witness to ordinary intrinsic emission, validating local selectors and stripping metadata in either property order, and preserving the ordinary attribute/event path. The pre-wiring library check passes459 core /747 native tests. After wiring the lowering module,459 core tests and754 native tests pass, with one expected import-order snapshot failure; that snapshot was corrected but the full library run has not been repeated. A fresh guarded CLI build succeeds and emits both targets for unchanged App/Child source.

The first compiled Chromium differential is RED (no page errors): `bind:this` is unset and a tag change tears down before replacement creation. Emitted source shows the mapArray constructor inside a producer reader, and a prepared reference attribute survives into the raw DOM factory. The imperative no-extra-runtime proof remains green; its ownership setup is not yet correctly represented by the compiler pipeline. Next work must register the generated map as an eager per-block helper and process its mapper fragment through ordinary directive/reference lowering. No source was changed in the live repositories by this prototype. Exact file hashes, remaining limits and next integration points are in `dynamic-element-integration-status.json`; red output is retained under `dynamic-element-source-admission/`.

### Dynamic plan ownership fixed in compiler prototype — 2026-10-18

The generated mapArray plan is now constructed once per template block; its mapper fragment is processed through existing directive/reference lowering, with compiler tag metadata forwarded as metadata rather than an ordinary reactive attribute. No new runtime API or host dependency was added. All459 core /755 native library tests pass; a fresh guarded CLI emits both targets. The unchanged authored fixture now matches all10 Chromium phases exactly, including reference publication, clicks, retained node identity and create-before-destroy replacement. Two fresh Bun SSR requests match Svelte HTML (hydration comments normalized) and create/destroy traces; Node produces the same two results.

Strict checking of the emitted graphs is RED on two DOM diagnostics: implicit-any keyboard callback and Element versus HTMLElement for bind:this. The fixture has not been weakened. Official source type-checker validation is running separately (session51011), so do not claim full typed dynamic-element support. Namespace references now cover25 real Chromium/SSR cases. The worker's prose summary contains errors: raw JSON proves runtime `this=svg` creates an SVG root with HTML children, while static SVG xmlns gives SVG children. Use `dynamic-element-namespace-reference/result.json` and generated source, not that prose, for implementation decisions. The prototype still rejects xmlns/style cases and remains outside live repositories. Evidence: `dynamic-element-producer-library-run.json`, `dynamic-element-producer-cli-run.json`, `dynamic-element-source-admission/producer-browser-comparison.log`, `ssr-result.json`, and `dynamic-element-integration-status.json`.

### Dynamic element type parity admission — 2026-10-18

Official svelte-check4.7.7 /svelte2tsx0.7.62, Svelte5.57.1 and TypeScript5.9.3 accept the unchanged App/Child fixture with zero diagnostics; independent deliberate-error controls confirm checker activity. Unknown string tags produce an open element reference type and keyboard events retain KeyboardEvent context. A further official literal-button/div-binding probe correctly rejects the incompatible reference, so blanket any-typing would be wrong. The prototype now preserves tag literals with a type-only tuple assertion and emits a local conditional-infer element lookup, with an open fallback only for unknown names. Typed dynamic callbacks use a type-only event context; no runtime helper is added.

The unchanged emitted DOM/SSR graphs pass both TS7 checkers. Seven independent admission cases pass: invalid keyboard member, invalid string-to-number keyboard use, shadowed globalThis, pure JavaScript output, incompatible literal-tag ref, invalid literal currentTarget property, and a valid literal button ref. The first attempted inline indexed lookups failed; a standalone reproduction isolated conditional value-query indexing, and a generic/inferred type lookup fixes it without weakening the fixture. All10 browser phases and fresh Bun/Node SSR comparisons remain green. Evidence: `dynamic-element-type-reference/results.json`, `literal-check.log`, `dynamic-element-type-admission/inferred-result.json`, `type-repro.ts`, `dynamic-element-source-admission/inferred-browser-comparison.log` and `inferred-ssr-comparison.log`. The compiler remains isolated/unpublished; xmlns/style coverage and wider verification remain unfinished.

### Dynamic scoped CSS selector integration — 2026-10-18

The isolated CSS collector now treats dynamic markers as optional unknown-tag elements, keeps static/dynamic class/id matching, tracks their parent relationships and scans adjacent siblings through optional nodes until a definite sibling. CSS analysis now runs before dynamic lowering, and the blanket dynamic/style parser gate is removed only for the style-aware parser entry; extraction-only entry points still reject styles. Core459/native761 library tests pass after repairing one static graph stress-test initializer for the new fields. The fresh CLI builds.

A new unchanged styled reference fixture records12 Chromium phases with computed color/background, normalized scope-class tokens, dynamic class toggles, identity and lifecycle checks. Native admission is RED before browser execution because `class:active` is unsupported even on ordinary intrinsics. The fixture was not weakened. Two Sonnet workers now own separate isolated changes: runtime `classDirectives(value,hash,flags)` on the existing opt-in class module (session74859) and core parsing to a private helper call `(base,null,flags)` (session98706). Scope hash must be applied before flags, including false overrides and whitespace/order behavior; primary retains native bridge, scoped-class integration and verification. Physical CSS fixture packages were copied so extending its class helper cannot mutate the already-verified0.4.7 base fixture. No live repository code changed. Evidence: `dynamic-element-css-fixed-library-run.json`, `dynamic-element-css-cli-run.json`, `dynamic-element-css-reference/result.json`, `dynamic-element-css-admission/css-compile-result.json`, and `dynamic-element-integration-status.json`.

### Class directive runtime reference validation

The isolated host-free class directive helper passes 17 portable unit tests (50 assertions) and 10,000 deterministic comparisons against Svelte 5.57.1 `to_class`, covering delimiter removal, duplicate tokens, scope hash precedence, truthiness, and dangerous own property names. The reference dependency remains only in a cached differential harness; portable unit tests use pinned expected vectors. The helper was copied only into the private dynamic scoped CSS admission runtime, not live packages. Compiler bridging and unchanged-source browser/SSR validation remain pending. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/class-directives-runtime-proof.json`.

### Compiled dynamic scoped CSS and class directives: isolated admission

The unchanged official fixture now compiles for DOM and SSR through the isolated Crepuscularity prototype. Its 12 Chromium phases match Svelte exactly for node identity, namespace, text, bindings, lifecycle, normalized class tokens, and computed foreground/background colors. Two renders each in Bun and Node match official SSR body and lifecycle after only hydration-comment and hash-name normalization. Strict tsc and tsgo checks pass. The compiler library suite passes 466 core / 764 native tests and Clippy with warnings denied; the earlier commentary count of 467 core was incorrect. Eight ordinary CSS DOM/SSR controls are byte-identical before and after dynamic-selector support.

Class directives use the existing opt-in `/class` runtime. Crepus appends a hygienic helper import and inserts the CSS hash before flags, allowing false flags to remove matching tokens. No runtime host dependency is included. Broader selector coverage, authored call evaluation/memoization, entity decoding limits, namespace handling, live integration, and release checks remain open; this is not full SFC coverage. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/dynamic-element-css-admission/classes-admission-proof.json`.

### Class expression evaluation regression (release gate)

A second unchanged-source probe uses side-effectful `base()` and `flag()` class inputs on the dynamic element. Official Svelte executes both before child creation, then reruns only the input whose dependencies changed. The isolated compiler currently creates the child first and reruns both inputs when either changes. All 12 trace snapshots differ, despite the earlier simple-value fixture matching. This is a verified release blocker for the new class-directive feature, not an acceptable compatibility claim. The cause is the single combined attribute reader installed after child construction. The next fix belongs in Crepus template-group lowering: separate per-input memoization and initialize reads before children within the owning block. Sources, official/native compiled output, browser snapshots, and structured evidence are retained in `/Users/undivisible/.cache/moonshine-live-merged-integration/class-evaluation-admission/regression-proof.json`. No live code or release was changed.

### Class evaluation and authored attribute position repaired (isolated)

Template-group lowering now creates independent render memos for class base and each flag, then initializes their reads before child creation within the owning group. The unchanged side-effectful fixture matches all 12 official browser snapshots exactly, including initial call ordering, independent updates, replacement, disappearance, restoration, and cleanup. The parser retains an authored class base at its original attribute position; its SSR string and lifecycle match after only hydration-comment/hash normalization in Bun and Node. The original simple-value styled fixture also retains all 12 matching phases and SSR parity. Both fixtures pass strict tsc and tsgo checks. Library verification: 467 core and 765 native tests. The earlier failing proof remains retained; these changes supersede that specific regression, but broader class expressions, entities, selectors, namespaces, and live/release validation remain open. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/class-evaluation-admission/class-position-proof.json`.

### Shared source entity decoding (isolated admission)

Crepus core now owns the existing Svelte entity decoder and its original tables/license; native imports it through the parser export. The restricted core interpolated-attribute decoder was deleted, with all four call sites reusing the shared decoder. No dependency or second entity table was added. Twelve parser vectors cover named/numeric/semicolonless references, attribute-boundary rules, unknown/zero/surrogate values, Windows-1252 mapping, and single-pass decoding in static and interpolated class bases. The unchanged reactive entity fixture matches 12 Chromium phases and Bun/Node SSR output/lifecycle after only hydration-comment/hash normalization. Strict tsc/tsgo pass; the library suite has 471 core and 762 native passing tests (three decoder tests moved into core). These changes remain isolated; broader selectors/namespaces and live/release checks are still pending. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/class-entity-admission/shared-entities-proof.json`.

### Global sibling-prefix selector retention repaired (isolated)

Reference probes exposed an existing non-dynamic pruning difference: Svelte conservatively retains `:global(.outside) + b` and `~ b` for root `b` elements even when earlier static siblings are known. Native analysis required an empty predecessor chain and incorrectly erased these rules. Both sibling combinators now permit an external global prefix at the component root, preserving the nested-parent boundary. Twenty-four DOM/SSR compilation comparisons across absent/static/optional predecessor chains and nested controls match Svelte CSS exactly after only hash normalization and removal of Svelte unused-rule comments. The library suite passes 471 core / 763 native tests. This proves selector retention, not browser style application; the larger selector/participation matrix is still running in an authorized Sonnet worker. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/dynamic-global-adjacent-probe/fixed-result.json`.

### Dynamic selector matrix differences repaired (isolated)

An authorized Sonnet worker exercised 68 selector cases on the pre-fix frozen compiler: 59 accepted / 9 explicit unsupported cases. Its DOM checks use happy-dom and initial-render scope participation, not computed browser styles. The baseline exposed three retention differences and seven participation differences, all involving global sibling prefixes. In addition to root retention, owned matching global-prefix elements now receive scope marks while the global selector itself remains unmodified. A pure-global selector still scopes no elements.

The primary reran the complete unchanged 68-case matrix using the corrected frozen compiler: all 59 accepted cases match Svelte for rule retention, selector text, DOM/SSR execution, and rendered scope participation (118 target comparisons). The nine unsupported cases remain explicit: branch/combinator relations, `:not`, and intrinsic spreads. Separately, a real Chromium fixture with an action adding the global class and a dynamic sibling appearing/disappearing matches Svelte for four computed-style, normalized-DOM, and action-lifecycle phases. Library: 471 core / 764 native passing; Clippy passes. Baseline artifacts are preserved separately. No live source or release was changed. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/dynamic-css-selector-matrix-fixed/summary-proof.json`.

### Live source integration and runtime feature commit

The verified dynamic-element/class/scoped-selector/entity compiler changes are now applied to the live Crepuscularity checkout. Preflight hashes matched every affected source except parser exports; that file was merged by inserting only the entity export and preserving its concurrent `literal_class_token` helper. Original affected files are backed up and every applied hash is recorded. Live core/native library tests pass (471/764), as does warnings-denied Clippy. The Moonshine class helper, portable tests, and adapter documentation are committed as `e78a888`; unrelated dirty files remain untouched. Full Moonshine checks pass: 2140 tests / 9401 assertions, both 25-project typecheck suites, package policy, 11 adapters, 42 catalog entries, changed-file formatting/lint, and unchanged 4041-byte signal core. Live compiler CLI/consumer admission and versioned release preparation remain outstanding; no npm or compiler publication occurred. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/dynamic-live-integration-proof.json`.

### Runtime 0.4.8 GitHub release and packaged consumer proof

Runtime commit `e78a888` and version preparation `11318a2` are pushed. GitHub release/tag `v0.4.8` targets `11318a284b561b1bf55aec56683f8f19d3980722`; CI run 39044708772 passed. A clean detached release checkout passes 2138 tests / 9329 assertions across 254 files, both 25-project typechecks, full formatting/lint, manifest policy, 11 adapters and 42 catalog checks. All 26 tarballs have version/ranges 0.4.8. An actual extracted-package consumer runs the unchanged entity/dynamic/class fixture through 12 Chromium phases, two SSR requests each in Bun and Node, and strict tsc/tsgo. The integrated live Crepus CLI emits six consumer graphs byte-identical to the previously verified graphs.

The signal core remains 4041 bytes. A reproducible browser helper workload measures existing classValue at 420 raw / 264 gzip in both 0.4.7 and 0.4.8, and classDirectives at 1009 raw / 581 gzip; these are helper bundle sizes, not framework speed claims. No npm publish was run. Crepus compiler changes remain local and unpublished; namespace work, other SFC gaps, hydration and async SSR remain open. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/class-release-proof.json`.

### Dynamic namespace identity contract investigation

Inspection of Svelte 5.57.1 `svelte-element.js` shows namespace evaluation precedes the null-tag early return and branch identity is only the tag. Namespace-only updates must not recreate a mounted element; the latest namespace is used on the next tag-created branch, separately from reactive xmlns attribute updates. `operations.js` maps nullish/HTML to createElement and other values to createElementNS. This is source evidence; an authorized Sonnet worker is collecting real Chromium update-time traces before compiler implementation. A second authorized Sonnet worker owns only an isolated explicit hNS namespace-factory prototype, including boundary/type tests for MathML/custom URI strings. Live code remains unchanged from the 0.4.8 integration. Contract artifact: `/Users/undivisible/.cache/moonshine-live-merged-integration/dynamic-namespace-contract-observations.json`.

### Explicit namespace factory extension integrated

The hNS factory now accepts namespace URI strings, retaining concrete HTML/SVG overloads and adding MathML element typing; custom URI strings return Element. Non-string inputs still reject explicitly, while URI/tag validity uses createElementNS. Ten real Chromium cases verify HTML/SVG/MathML/custom/empty namespace creation, child namespace, authored xmlns separation, non-string errors and platform NamespaceError. Live DOM tests pass (408 tests / 2213 assertions / 33 files), both DOM-project typechecks and changed-file formatting pass, and lint exits 0 with three preexisting warnings reproduced on unchanged 0.4.8 source. Feature commit: `0346fc4`. This API change is not in the 0.4.8 tag.

The separate official Svelte reference worker completed 144 client scenarios and 157 SSR renders, retaining raw results including Symbol/invalid-namespace errors. Reports are advisory; raw fixtures and results define the compiler contract. Namespace-only changes retain node identity; namespace selection and attribute reads have distinct evaluation counts, and SSR does not perform DOM namespace selection. Compiler xmlns/MathML source support remains pending. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-factory-live-proof.json`.

### Dynamic xmlns compiler prototype library gate

Two authorized Sonnet workers implemented separate parser metadata and dynamic-element lowering in a new isolated compiler snapshot; the primary integrated namespace metadata validation/erasure, creation-time namespace normalization, and pre-child xmlns input memoization. A per-invocation map wrapper captures the latest namespace independently from tag-only identity. DOM keeps the authored namespace-creation read separate from the ordinary xmlns attribute read; SSR erases creation metadata without evaluating it. Existing no-namespace lowering remains on the direct mapArray path. Static SVG declarations supply lexical SVG witnesses; non-SVG static declarations reset lexical context according to official compiler output. Bare xmlns initially exposed the ordinary empty-attribute conversion; it is now preserved as boolean true, matching Svelte. The isolated library gate passes 477 core / 771 native tests. CLI build, real browser/update trace admission, strict typing/JS output, and static/inherited MathML behavior are still pending. No namespace compiler edits are applied live. Status: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-prototype-status.json`.

### Namespace browser admission: 128/140 matching, 12 failure cases open

The isolated CLI compiles four unchanged reference fixtures for DOM and SSR (eight graphs). Real Chromium executes 140 source scenarios. Four main update sequences match Svelte for namespace and tag changes, node retention/replacement, null/if hiding, MathML creation, authored call order and action cleanup. Across the full comparison, 128 match and 12 fail. Comparison removes internal HTML comments, renumbers numeric IDs per scenario while preserving identity, and excludes raw comment-node counts; raw results remain intact.

All failures involve invalid namespace creation or Symbol values. Attribute input initialization happens before namespace creation fails, adding an authored read. Symbol creation conversion differs in error text. Symbol xmlns updates incorrectly stringify and mutate instead of raising the browser attribute error. These are real parity failures, not accepted coverage. The next fix must order physical element creation before attribute input initialization and preserve browser WebIDL conversion for compiler-created namespace/attribute values separately from ordinary factory semantics. Static/inherited MathML support and SSR/strict-type admission also remain pending; no namespace compiler changes were applied live. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-source-admission/browser-first-proof.json`.

### Namespace creation/coercion regressions repaired in isolated browser admission

The unchanged 140-scenario Chromium comparison now matches Svelte completely, including the prior twelve failure cases. Namespace-sensitive elements are physically created before attribute input memos initialize; creation errors therefore happen before the second authored namespace read. A compiler-only hSourceNS prototype delegates unknown runtime namespace values directly to browser WebIDL conversion, while ordinary h retains its existing explicit String conversion and hNS keeps the public string guard. Source xmlns updates use raw setAttribute/removeAttribute, preserving Symbol errors and the previous attribute value. No extra probe-node allocation or browser-error imitation is used. The compiler library gate passes 477 core / 772 native tests. The runtime-focused ten tests and both DOM-project typechecks pass; the broader prototype DOM suite needed missing workspace aliases and is being rerun. SSR, typed graph admission, static/inherited MathML and live/release integration remain open. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-source-admission/creation-order-browser-proof.json`.

The reconstructed prototype workspace resolves its real local package aliases; the complete DOM suite now passes 411 tests / 2220 assertions across 33 files. Warnings-denied Clippy also passes. All retained authored Svelte fixture bytes were compared with the official reference copies and are unchanged.

### Namespace SSR and typed-source admission

The same four unchanged JS SFC fixtures now pass 141 SSR cases each in Bun and Node, with identical native results across runtimes and exact official body/call comparisons after only hydration-comment removal. Cases include Symbol namespaces as serializable attributes, invalid URI strings, hidden conditions and null tags without namespace reads. A separate typed source fixture with unknown namespace values, tag updates and keyboard events compiles for DOM/SSR and passes strict tsc and tsgo; both checkers reject an invalid keyboard event property. The original JS graphs execute without TypeScript syntax. All five changed compiler files still match their live pre-change hashes, so integration can preserve concurrent work. Static/inherited MathML, remaining static namespace fixtures, and live/release gates remain outstanding. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-source-admission/namespace-admission-proof.json`.

### Dynamic namespace live integration and validation correction

Five namespace compiler files were integrated only after each live hash matched its baseline, with backups retained. The hSourceNS runtime, tests and documentation are committed as `b6f7d07`. The actual live compiler emits 24 files byte-identical to the verified prototype graphs; rerunning those live graphs with the integrated runtime matches all 140 Chromium scenarios and 141 SSR cases each in Bun and Node. Both 25-project typecheck suites, changed-file formatting, package policy, 11 adapters and 4041-byte signal-core check pass. Full JS run: 2143 pass / one five-second timeout in the unchanged standalone kernel bundling test; isolated rerun passes in 1751 ms (14 assertions). This full run is not reported all-green.

Validation correction: the earlier library runner watched live files but retained a prototype manifest in its Cargo command, so earlier Rust library claims proved prototype coverage only. The manifest path is now corrected and explicitly inspected. Actual live checks pass: 477 core / 776 native tests and warnings-denied Clippy. Raw output names the live project paths. No compiler publication or new runtime tag occurred. Static/inherited MathML remains open; its official reference records upstream namespace/child-loss bugs rather than treating those as correct platform behavior. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-live-integration-proof.json`.

### Runtime 0.4.9 release validation

GitHub tag/release `v0.4.9` targets pushed commit `7507a193a6a174d093d90e094c7d11967f33cd1e`. Clean detached release validation passes 2142 tests / 9344 assertions across 254 files; both 25-project typecheck suites, full formatting/lint, package policy, 11 adapters, catalog and size checks pass. All 26 versioned tarballs are verified. A fresh extracted-package consumer matches all 140 Chromium namespace scenarios and 141 SSR cases each in Bun and Node, with strict DOM/SSR typed graphs passing both checkers. CI run 39047460581 passes Linux JS, macOS JS and Dart. Core remains 4041 bytes. This clean result is distinct from the earlier dirty-tree run with a five-second timeout and its passing focused rerun.

No npm publication was run; compiler changes remain local and unpublished. Static/inherited MathML source and the remaining SFC/hydration/async SSR scope are still open. Separate Sonnet workers own MathML parser witnesses and namespace-preservation changes only in an isolated prototype. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/namespace-release-proof.json`.

### Isolated MathML source compiler library gate

Separate Sonnet workers extended the authored parser with MathML witnesses/integration points and preserved those witnesses through physical fragment relocation. The primary connected native validation/emission and dynamic MathMLElementTagNameMap typing. Initial tests caught annotation-xml being rejected by the general identifier-only tag check; that standard hyphenated tag is now admitted. The primary also corrected inherited SVG-looking names: g/foreignObject do not force SVG under MathML/text integration points, and math does not force MathML under SVG. The isolated gate passes 481 core / 777 native tests. Children are retained, including annotation-xml children that upstream Svelte drops; dynamic MathML does not deliberately reproduce upstream SVG namespace bugs. Actual CLI/browser/SSR and typed source admission are still pending, as is dynamic annotation encoding. No MathML compiler source was applied live. Status: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-prototype-status.json`.

### MathML source admission and typed event gate (prototype only)

The revised isolated compiler passes 482 core / 777 native library tests and warnings-denied Clippy. All 50 target graphs compile from 27 byte-identical reference SFC fixtures. Chromium 151 runs 95 initial-render cases without runtime or unmount errors: 39 match Svelte 5.57.1 exactly; 56 differ from upstream namespace/child-loss behavior. Independent assertions check namespace and serialized child trees for 58 cases (including two exact matches), rather than admitting differences automatically. All 95 SSR bodies match the reference after comment removal in both Bun and Node, whose native records are identical. Dynamic tags retain lexical MathML namespace, including a dynamic tag named svg; static svg establishes SVG separately.

A typed MathML source fixture with bind:this and keyboard currentTarget passes strict tsc and tsgo for the generated DOM/SSR graphs. Both checkers reject an invalid keyboard property and report currentTarget as MathMLElement. This proves contextual typing rather than an any fallback. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-source-admission/assertion-proof.json` and `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-typed-admission/checks.json`. MathML edits remain isolated and unreleased. Reactive namespace/tag update admission, dynamic annotation-xml encoding, hydration, full SFC coverage and live compiler integration remain outstanding.

### MathML live source integration

Primary review covered all five changed compiler files. Each live file matched its recorded baseline before copying; backups and before/after hashes are retained in `mathml-live-before-apply` and `mathml-live-applied.json`. Live library tests pass 482 core / 781 native tests, preserving the additional concurrent native tests. Rustfmt was then applied to the new tests and checked successfully; live warnings-denied Clippy is running. Crepuscularity's current source instructions and frontend guide now distinguish local MathML support from unpublished compiler availability.

A read-only Sonnet audit identifies next fixtures for imported components through blocks, cross-namespace snippets and reactive tags. Its proposed namespace-only recreation expectation is rejected: the established and verified contract retains the node and changes only the xmlns attribute until tag replacement. No MathML commit, tag or publication has occurred. Live CLI output equivalence and reactive update admission remain outstanding.

Live MathML integration gates now pass: warnings-denied Clippy and actual live CLI build; all 50 generated graphs / 160 files are byte-identical to the admitted prototype. A fresh run of those live graphs passes the same 95 Chromium namespace/tree cases and 95 reference SSR bodies in each of Bun and Node. No browser page errors occurred. Consolidated evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-live-integration-proof.json`. This closes live initial-render integration, not reactive updates, snippet namespace inference, hydration or published compiler availability.

### MathML logical-root regression found

A Sonnet-owned compile investigation admits all 11 identical boundary fixtures for upstream client/server and native DOM/SSR. Generated output establishes a concrete mismatch: root mi inside if/each/snippet compiles with upstream from_mathml but native XHTML hNS, including when those components are imported under math. Ordinary imported Child through blocks remains correct. Primary inspection traces this to testing parser recursion depth rather than element ancestry. An isolated follow-up tracks element ancestry and adds if/each/snippet/key/fragment regressions with HTML-parent negative controls. Its library rerun is in progress; the follow-up has not been applied live. The first test run had a test-observation bug for separately stored snippet bodies; that assertion is corrected. Evidence: `mathml-boundary-admission/report-compile.json`, `mathml-boundary-parser.diff` under the existing integration evidence directory. Generated output inspection alone does not prove browser behavior.

The logical-root fix now passes isolated library tests (483 core / 777 native), warnings-denied Clippy and a fresh CLI build. All 10 boundary entry fixtures match upstream in real Chromium (namespace, constructor and comment-stripped tree), with no runtime/page/unmount errors; all 10 SSR bodies match upstream in both Bun and Node. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-boundary-runtime/assertion-proof.json`. Primary then applied the single parser file only after exact comparison to its live pre-fix bytes, keeping a backup. Live library rerun is active. This does not establish mixed-root or cross-site snippet inference, reactive updates, or hydration.

The live logical-root library rerun also passes: 483 core / 777 native tests; source hashes remained stable throughout the run. The native count differs from the earlier 781-test live run; investigate that scope difference before claiming preservation of all concurrent tests.

### Shared Cargo artifact provenance correction

The four absent tests remained present in live source. The 777-test logical-root run reused prototype artifacts in the shared target directory without compiling live crates; its manifest path alone did not prove live binaries. A forced rebuild (mtime-only touches to live core/native lib.rs; content hashes unchanged) explicitly compiled both actual live crate paths and passed 483 core / 781 native tests, including all four live-only callback-instantiation tests. Source hashes stayed stable. An assert-based verifier requires those live compile paths, the four named tests and the new regression test, so this condition cannot be hidden by aggregate counts. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-live-library-provenance-proof.json`. A fresh live CLI rebuild is active; earlier prototype browser results remain valid, but fresh live output equivalence is pending. Avoid switching copied source roots in the shared target without invalidating and checking workspace-crate artifacts.

### Fresh live boundary and reactive admission

After the provenance-corrected live rebuild, 20 boundary graphs match the admitted prototype byte for byte. The actual frozen live compiler's graphs pass all 10 upstream Chromium namespace/constructor/tree comparisons and 10 SSR bodies per Bun and Node. A new compiled source fixture additionally passes 15 assert-based Chromium checks covering inherited/static/dynamic MathML namespaces across unchanged-tag retention, xmlns-only attribute updates, tag replacement consuming the latest namespace, lexical child namespaces, null removal, restoration and unmount. Production bundle inputs contain no host framework or parser WASM. Evidence: `mathml-boundary-live-runtime/assertion-proof.json` and `mathml-reactive-admission/proof.json` under the integration evidence directory. This establishes the exercised reactive namespace contract; imported reactive children, mixed-root inference, broader snippet cases and hydration are not proved. Final live Clippy after the logical-root fix is running.

### Imported reactive component namespace and ownership admission

Final warnings-denied live Clippy passes after the logical-root fix, naming the actual live core/native paths. Eleven additional Chromium assertions exercise the frozen live compiler with imported Child components under both math and svg. Independent child-root dynamic tags stay lexical HTML (mi/circle), explicitly select SVG for svg, retain identity for unchanged tags, replace identity on tag change, remove on null and restore correctly. Parent callbacks cross the child boundary; detached prior nodes no longer invoke listeners, replacement listeners work, and unmount removes all elements. No host runtime or parser WASM enters the production bundle. Proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-import-reactive-admission/proof.json`. This closes these specific imported reactive cases, not arbitrary component/snippet namespace inference or hydration.

A separate Sonnet mixed-root compile audit accepts five identical fixtures on both compilers and both targets, with no warnings/rejections. It finds two unclosed namespace mismatches in generated client code: mixed direct mi/div roots (both orders) use upstream from_html for mi while native assigns MathML; a snippet declared inside div but rendered under math uses upstream from_mathml while native assigns XHTML. If-wrapped mi beside div and root text beside mi match by generated factory inspection. Browser/SSR execution is still required before treating those code differences as runtime failures. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-mixed-admission/REPORT.md`. These are outstanding compatibility work, not covered by the passing logical-root and imported-reactive assertions.

### Mixed-root runtime confirmation and snippet correction

Real Chromium confirms two mixed direct-root namespace failures: mi/div and div/mi produce native MathML mi while upstream produces XHTML mi. If-wrapped mi beside div and root text beside mi match. The proposed snippetDivRenderMath fixture cannot establish a successful browser namespace case: both clients throw `s is not defined` because the snippet is referenced outside its declaration's element scope. Native SSR also throws; upstream SSR emits markup, so that server/client scope discrepancy is separately observed rather than called namespace parity. No fixture was silently dropped. Native Bun/Node records match. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-mixed-runtime/comparison.json`. Next work is mixed direct-root physical fragment inference and valid in-scope snippet controls, preserving the admitted MathML integration points and logical-root cases.

### Valid nested-snippet browser regression

Four in-scope snippet fixtures compile and run on both compilers without page/runtime errors. Real Chromium confirms nestedRenderHtml and nestedRenderMath use native XHTML mi where upstream uses MathML. The controls mathDeclaredRenderMath and rootRenderHtml match. All four SSR bodies match the reference after comments in Bun and Node. Primary isolated parser changes reset element ancestry while parsing snippet bodies and restore it afterward; a regression also checks that the following ordinary mi child of div stays HTML. This fix is not yet built or applied live. A separate Sonnet worker owns only the isolated physical fragment namespace pass for mixed direct roots. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-snippet-runtime/comparison.json`.

### Mixed-root/snippet follow-up under verification

Sonnet supplied an isolated physical-fragment change that downgrades direct bare MathML roots beside HTML roots and their inherited descendants, preserves explicit math entries, and excludes opaque/control branches from the direct-root trigger. Primary retained ownership of parser snippet ancestry reset. Library rerun is active after correcting a test-observation mistake: snippets declared inside elements are inline template bodies, not module.snippets entries. New reference controls explicitly establish nested math preservation and downgraded mrow descendants. They also expose further order-sensitive SVG/MathML behavior: mi then svg makes upstream svg/circle MathML, while svg then mi makes upstream mi SVG. Those cases are recorded outstanding rather than folded into this narrower patch without runtime verification. Reference controls: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-mixed-controls-reference/result.json`. No follow-up changes applied live yet.

### Mixed direct roots and valid nested snippets admitted

The combined isolated fix passes 484 core / 780 native tests, warnings-denied Clippy and CLI build. Fresh graphs pass all four valid snippet cases and all four valid mixed-root cases against upstream in Chromium and SSR Bun/Node. Five additional controls pass namespace/constructor/tree assertions: ifMiDiv, mathDiv, mrowDiv, mtextDiv, nestedMathDiv. All seven control SSR strings match; the two SVG/MathML sibling-order browser mismatches remain explicitly tracked. The prior 95-case MathML matrix also passes unchanged after recompiling all 50 graphs. The invalid out-of-scope snippet remains an observed client error on both sides and a separate SSR divergence; it was not counted as a passing supported case.

Primary reviewed the physical-pass diff and applied only authored.rs and svelte_intrinsics.rs after baseline checks, retaining backups/hashes in `mathml-mixed-snippet-live-applied.json`. Live core/native lib timestamps were advanced without content changes to force correct source-root compilation; live library rerun is active. Evidence: `mathml-followup-assertion-proof.json`, `mathml-followup-controls/assertion-proof.json`, `mathml-followup-base/assertion-proof.json` under the integration directory. No compiler release or npm publication occurred.

### Fresh live follow-up gates complete

Forced live library validation passes 484 core / 784 native tests, including all four live-only callback tests. Warnings-denied live Clippy and live CLI build pass with stable source hashes. Recompiled actual-live graphs rerun the 95-case base matrix plus four valid snippet and four valid mixed-root browser/SSR comparisons successfully; invalid out-of-scope snippet behavior remains recorded separately. Consolidated commands, hashes and proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/mathml-mixed-snippet-final-live-proof.json`. No runtime package changes were required, and no npm/compiler publication was run.

### Dynamic annotation encoding reference boundary

A bounded official Svelte 5.57.1 experiment compiles five fixtures, runs 20 Chromium client scenarios and renders eight SSR cases without runtime/page errors. Asserted observations: every compiled client annotation-xml has zero children for static and dynamic encoding; every SSR body retains authored div, mi, svg and circle children. Compiled templates omit encoding before parsing MathML and assign it afterward, reproducing the previously observed child-loss bug. Thus empty node-identity arrays cannot establish child retention/recreation or child namespaces under updates. Hydration was not tested; no hydration result is claimed from this mismatch. Moonshine keeps the child-preserving static behavior already admitted, and dynamic encoding remains an explicit diagnostic pending an independently defined, child-preserving creation contract. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/annotation-encoding-reference/assertion-proof.json`. No parser checks were weakened to match upstream child loss.

### Fixed date/time/color source binding follow-up

Existing independent runtime bindValue already supports fixed date, datetime-local, month, week, time and color controls with browser-specific sanitization/reset tests. The authored parser/native binding whitelists still rejected those types. An isolated follow-up admits those six fixed types through the existing owned binding helper and preserves rejection of file/checkbox/dynamic type controls. No runtime code or dependencies were added. Library tests pass after correcting a test-only enum comparison to matches!. A real six-control source fixture is prepared for compile/browser/SSR admission; CLI build is active. Source support is not yet claimed or integrated live. A read-only Sonnet audit is identifying the separate raw-option and SSR requirements for select lowering.

### Fixed date/time/color compiled-source browser and SSR admission

The isolated compiler emits the real six-control authored fixture successfully for DOM and SSR. Chromium traces for all six types match Svelte 5.57.1 exactly in five phases: initial, valid programmatic writes, invalid programmatic writes/browser sanitization, dispatched user input and form reset. A sixth disposal phase verifies native detached input listeners no longer mutate state and unmount removes all elements; upstream retained detached inputs still mutate state in this fixture, an explicit cleanup divergence rather than an ignored mismatch. SSR bodies match in Bun and Node after removing hydration comments and normalizing only input void-element slash spelling. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/date-source-native/browser-proof.json` and `ssr-proof.json`. No runtime additions/dependencies were needed. Clippy is running; integration and fresh live verification remain pending.

### Fixed-type input live integration

The isolated date/time/color source change passes warnings-denied Clippy. Primary inspected the exact two-file diff and applied it only after both live files matched their baselines, retaining backups and hashes in date-source-live-applied.json. The live diagnostic now describes all supported static types accurately; frontend docs and repository guidance list the admitted six additions. Forced live tests pass 484 core / 785 native, including all four concurrent live-only tests. Fresh live Clippy/CLI gates are active. The six-control reference browser and SSR evidence remains scoped as recorded above; fresh live graph equivalence is still pending.

The read-only select audit confirms the existing runtime is ready but compiler plumbing must additionally preserve raw option identity, SSR boxed values across child-owned options, and change-listener ordering. Audit suggestions are unimplemented and require primary verification; in particular ordinary unbound selects must remain accepted and unchanged, rather than following the audit's contradictory suggestion to reject selects without markers. No source select support is claimed.

### Fixed input source fresh live gates complete

The actual live CLI emits DOM/SSR graphs byte-identical to the admitted prototype. Their fresh Chromium run matches all six control traces in the five supported phases and passes native cleanup; live SSR also matches reference and prototype in Bun and Node with the same explicit comment/input-slash normalization. Live warnings-denied Clippy and CLI build pass with stable hashes. Consolidated proof: `/Users/undivisible/.cache/moonshine-live-merged-integration/date-source-live/final-proof.json`. No runtime changes or new dependencies were introduced.

Primary source inspection corrects the select audit's listener-order proposal: packages/dom/test/binding.test.ts explicitly requires user listeners to observe the prior model before the select binding change write. This differs from the admitted input binding order and must be preserved rather than blindly reusing the input wrapper. Raw DOM option values also need setOptionValue wiring; SSR symbols alone do not solve source select lowering. Select remains unsupported until these complete paths are implemented and exercised.

### Select source implementation started (isolated, incomplete)

A Sonnet-owned change adds Select to the existing binding transformer, reusing bindSelectValue, owned helpers and cleanup; primary wires the existing value marker through a separate select pass before the input pass. Both passes now leave the other control's marker untouched, allowing mixed forms. Select ordinary change listeners are installed before the binding's model-write listener, matching the runtime's tested contract. Dynamic multiple and spreads remain explicit errors. Primary also routes authored option expression values through existing setOptionValue metadata so numeric/object identity is not reduced to strings; static string options keep their existing path. Focused tests and isolated library build are active. Typed SSR select lowering is deliberately still rejected; none of these select edits are live, released, or claimed as complete source support.

### Select end-to-end admission exposed two integration corrections

The first real mixed select/input fixture rejects bare multiple. Primary source inspection shows authored bare attributes normalize to an empty-string expression, while the isolated select pass originally accepted only absent/direct string attributes. Boolean-literal acceptance alone is insufficient; normalized string literals also need admission while dynamic multiple remains rejected. The current rebuild includes the separate source-listener correction; the normalized-string correction is pending until that build finishes to avoid mutating active build inputs.

A pinned official compiled SFC reference now runs eight browser phases with object, function and numeric option values, multiple selection and an ordinary bound input. It proves source onchange handlers see the newly written model, although listeners manually registered before native bindSelectValue see the previous model. Primary therefore restores generated ordinary handler registration after binding (capture handlers before); the plain runtime remains unchanged. Earlier statements applying the direct native listener test to generated SFC handler order are superseded by this stronger source evidence. No full select admission or source support is claimed. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/select-source-reference/reference-result.json` and `select-source-admission/before-order-compile.json`.

### Select DOM compiled-source browser admission

After admitting parser-normalized empty-string multiple literals (in addition to boolean/direct string literals), the real SFC fixture compiles and runs. Seven Chromium phases match pinned Svelte 5.57.1 exactly: initial typed selection, user object selection, programmatic function selection, user selection afterward, numeric multiple changes, programmatic multiple changes, and a bound input in the same form. Function-valued options are never invoked. An eighth disposal phase independently asserts native state remains unchanged after dispatch on the detached select and all elements are removed; upstream state changes through its retained binding listener. The source-handler order correction is now confirmed by browser traces. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/select-source-admission/assertion-proof.json`.

This remains isolated DOM support, not complete select source admission: typed SSR is still rejected, dynamic multiple remains unsupported, and child-component option/conditional/reset/cancellation coverage is pending. A Sonnet candidate investigation is checking how existing SSR hSource plus boxed selectBinding/optionBinding can preserve raw values across independently compiled child options without adding runtime context or dependencies.

### Select DOM imported-option lifecycle admission

The frozen isolated compiler now compiles a parent select with imported Child options produced by a keyed each. Ten Chromium phases exactly match pinned Svelte: initial typed selection, reordering, retained option-node identity, insertion, selection of the inserted object, removal of another option, user selection, canceled reset, reset, and unmount. Both pages report no errors. The prior seven-phase typed/function/numeric/mixed-input fixture remains green, with native-only cleanup asserted separately. Production bundle input checks explicitly exclude host Svelte/Solid/React runtimes in both fixtures. Isolated warnings-denied Clippy passes. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/select-lifecycle-admission/assertion-proof.json` and each fixture's bundle-inputs.json. These additions remain isolated; typed SSR source lowering and dynamic multiple are still incomplete.

### Bound select multiple is a source validation rule

An assert-based pinned compiler matrix proves Svelte 5.57.1 rejects expression-valued multiple on a bound select, including both a prop reference and literal true, for client and SSR with attribute_invalid_multiple. Bare multiple and multiple="" bound controls compile; dynamic unbound multiple compiles. Therefore rejecting dynamic multiple with bind:value is required source validation, not missing Svelte parity. Earlier blanket lists of dynamic multiple as an outstanding compatibility capability are superseded. The isolated native pass temporarily admits static boolean expressions as an internal producer form; authored parser provenance needs to retain Svelte's stricter source check before full select admission. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/select-source-reference/multiple-contract.json` (10 compile cases). The SSR candidate worker is still active; typed SSR remains the main unfinished select path.

### Authored multiple validation implemented

The isolated parser now checks the original authored multiple attribute before normalization whenever select has bind:value. Bare and literal strings are accepted; expressions (including true), shorthand and quoted interpolation fail with a specific static-multiple diagnostic. Unbound dynamic multiple remains accepted. Positive/negative parser tests and the full isolated core/native library suites pass. This closes the source-validation mismatch found by the ten-case reference matrix; the internal binding pass can still admit its normalized literal producer forms. The select changes remain isolated and typed SSR is still incomplete.

Closed task-owned compiler snapshots were losslessly archived after lsof confirmed no open handles, with decompressed SHA-256 verification before removing the uncompressed copies. Eight snapshots reclaimed 510 MiB; source, proof and installed tool runtimes were untouched. Restore paths, hashes and executable modes are recorded in `/Users/undivisible/.cache/moonshine-live-merged-integration/archived-select-predecessor-compilers/manifest.json`. Current select admission binary remains available; older scripts referring to archived executable paths require restoration first. A fresh select CLI build is active after the authored validation change.

### Fresh authored select validation and SSR option transform

The fresh isolated CLI verifies five authored multiple cases against the reference boundary (expression and literal-true rejection; bare/string bound acceptance; dynamic unbound acceptance). Its valid mixed-form graph is byte-identical to the previously admitted DOM graph. Evidence: select-source-admission/authored-multiple-proof.json.

Primary added a target-only SSR option transform in the existing binding module: independently compiled authored options with explicit values become a generated source factory using existing hSource and boxed optionBinding metadata. Raw function values are read as literals, never invoked; options without values retain their existing text fallback. The pass runs for every SSR source module, even when that module contains no bound select. The added transform/parser tests and full isolated library suites pass. This is an unadmitted implementation step: end-to-end SSR factory behavior, attribute read ordering, and bound-select metadata still require verification. Select SSR remains explicitly rejected until the complete path is ready. No new runtime context, dependency, or shared renderer was added.

### Typed select SSR implementation connected (isolated)

Primary connected bound select metadata to the existing hSource/selectBinding server protocol and paired it with independent option boxing. Boxes are authored at the original attribute position rather than wrapping a value getter in a new helper, so raw function/object values remain data and parent attribute reads retain source order. Both generated factory names are registered as static and SSR-transparent helpers, preserving the consumer context for lazy children. The full isolated library suites pass; CLI build is active for end-to-end Bun/Node checks. No runtime context, dependency or renderer was added.

The delayed Sonnet draft is now available in select-ssr-candidate. It independently flags serialization attribute placement, source read order, unbound option behavior and externally produced options as risks. Its standalone Rust draft was not integrated. Primary's implementation uses the already edited binding pass and boxes values eagerly at original positions; actual compiler output is still required to verify those assumptions. Select SSR support is not yet admitted or live.

### SSR selection factory namespace metadata correction

The first actual SSR graph attempts for both select fixtures failed with invalid compiler-owned intrinsic namespace metadata. The cause was converting select/option intrinsic tag names into generated source factories while leaving their private intrinsic witness on the new component. Primary added a scoped erasure pass that consumes witnesses only on known generated SSR selection factory names and retains child/unrelated witnesses; its regression and full isolated library suites pass (485 core / 789 native). The pass is skipped when no SSR selection helpers were generated. Fresh CLI build is active. This repairs the producer boundary; successful SSR graph execution and selection semantics still require verification. No live/compiler release has occurred.

### First compiled typed-select SSR execution

Both real select fixtures now compile for SSR with the scoped witness fix. The main object/function/numeric-multiple/mixed-input fixture matches pinned Svelte in Bun and Node after explicit hydration-anchor/input-slash normalization; function-valued options are retained as literal values without invocation. The imported keyed-option fixture executes on both runtimes but differs in authored selected handling: upstream preserves the first option's authored selected flag as well as the second option's binding match, while native typed selection currently overrides authored selected. Source inspection confirms this is the existing runtime contract, not lost object identity. Its existing tests explicitly require override behavior, so do not change it globally; compiled source needs an explicit policy that preserves the upstream default-selection behavior. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/select-ssr-selection-comparison.json`. This is partial SSR admission only; no full select support or live integration is claimed.

### Authored selected policy implemented (unreleased ABI)

Moonshine's SSR select metadata now accepts an optional own boolean data field preserveSelected. When explicitly true, a binding match is combined with authored selected flags; the default remains the existing native override contract. Accessor/nonboolean policy payloads reject without invoking their getters. Sixty-one focused SSR tests pass (258 assertions), including the unchanged default behavior; the native 25-project checker passes and changed-file formatting/diff checks pass. The isolated compiler now emits preserveSelected:true for source selects, with a unit assertion. A separate copied runtime consumer contains this unreleased source change, leaving prior extracted-package proof consumers untouched. Isolated Rust library/CLI gates are active before fresh Bun/Node admission.

Four more closed task compiler snapshots were losslessly archived with verified decompression hashes and restore metadata, reclaiming 255 MiB. Installed runtimes and user projects were untouched. Manifest: `/Users/undivisible/.cache/moonshine-live-merged-integration/archived-mathml-predecessor-compilers/manifest.json`.

### Authored selection policy end-to-end SSR admission

Fresh isolated graphs with preserveSelected:true and a separate runtime consumer containing the unreleased SSR policy now match both main and imported-option fixtures in Bun and Node, after the recorded hydration/input-slash normalization. A new trace fixture additionally proves eight model/attribute/coercion/child evaluations occur exactly once in the same order as Svelte on both runtimes. Parsing the output confirms identical semantic element attributes and trace text; native quote entities are equivalent text. The trace exposes one remaining serialization-order difference: typed option value moves after later source attributes. This is tracked explicitly for correction rather than accepted as exact string parity. Evidence: select-ssr-policy-results.json and select-ssr-order-proof.json under the integration directory. No select changes have been applied live or published.

### Typed option value slot and fresh SSR parity

The source SSR serializer now preserves an existing typed-option value slot without reading its ordinary override getter, while typed options without a slot retain the prior fallback. Generated option factories map their private box key back to that value slot using the supplied realm's Object APIs and a null-prototype attribute record. Generated select/option factories skip children while copying props, so children are read once. Tests cover ignored throwing getters and value/coercion placement. No dependency or shared vnode was added.

Fresh isolated CLI graphs for main, imported lifecycle and read-order fixtures pass all six Bun/Node comparisons against Svelte. Both basic bodies match after documented anchor/void normalization; the trace case has identical ordered element attributes and eight identical once-only evaluations, with equivalent parsed text despite quote entity spelling. All native records agree across runtimes. The full DOM suite passes 413 tests / 2226 assertions across 33 files; standard tsc passes 25 projects. Isolated Rust library passes 485 core / 789 native tests and CLI build passes. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/select-value-slot-proof.json`. Warnings-denied compiler Clippy and the full unfiltered svelte_module_emit_cli integration suite are active before live integration. Earlier CLI helper runners filtered javascript cases; the new runner explicitly removes that filter for this gate.

### Select compiler local integration

Warnings-denied isolated Clippy and the full unfiltered 17-test source CLI integration suite pass. Primary reviewed all four compiler diffs, removed redundant branches, and added an explicit option-value edit-overlap error before any replacements apply. The review follow-up passes 485 core / 790 native tests and Clippy. All four live file hashes still matched their baselines before integration; backups/hashes are retained in select-live-applied.json. Forced actual-live library tests pass 485 core / 794 native, including all four concurrent live-only tests. Current source docs distinguish admitted local behavior from the unreleased SSR runtime ABI and the native undefined-multiple array contract. Fresh live Clippy, CLI build and all 17 CLI tests are active. Fresh live graph/browser/SSR and package release gates remain pending; no full SFC/hydration coverage or npm publication is claimed.

### Fresh actual-live select gates complete

Actual-live Clippy and CLI build pass, as do all 17 unfiltered source CLI integration tests. Five fresh DOM/SSR graphs are byte-identical to their admitted prototypes. Fresh live browser runs match 17 supported reference phases plus native-only disposal checks; all six SSR comparisons pass in Bun and Node with ordered attributes and the eight-evaluation trace. Commands, hashes, runtime identity and stable-source checks are consolidated in `/Users/undivisible/.cache/moonshine-live-merged-integration/select-live-admission/final-proof.json`.

A detached clean Moonshine runtime validation worktree has been prepared at moonshine-sdk-release-0.4.10 with only the SSR implementation/tests/README change copied. Frozen installation passes; full clean test validation is active. This does not publish the compiler or npm packages, and hydration/full SFC coverage remain incomplete.

### Runtime release preparation

Clean detached validation passes 2147 tests / 9356 assertions across 257 files, both 25-project checkers, formatting/lint (existing warnings only), package policy, 11 adapters, 42 catalog entries and the unchanged 4041-byte signal core. The exact SSR implementation, tests and README are committed on main as 53208f5, with concurrent edits preserved. All 26 public packages are prepared at 0.4.10 in the detached validation tree; metadata/policy/format/size gates pass and versioned tarball verification is running. No new push, tag, GitHub release or npm publication has occurred yet.

### Runtime 0.4.10 pushed and released; typed source correction

Runtime feature commit 53208f5 and release commit b5ed185 are pushed to main. Annotated tag/GitHub release v0.4.10 is created at the release commit. All 26 tarballs are version-verified, and a fresh physical four-package consumer passes both browser fixtures and all six SSR comparisons. Strict generated select SFC checking then found lost HTMLSelectElement currentTarget precision and an SSR implicit-any handler. The isolated binding transform now applies an explicit contextual satisfies type to source select callbacks and erases client event attributes only from known generated SSR intrinsic factories. Both strict checkers pass the real typed graphs and reject an invalid event property; generated internal glue may use any, but authored callback checking is preserved. The fix is integrated locally after baseline checks, with forced live library/Clippy/CLI gates active. It also prevents client handler lookup side effects on SSR. No compiler or npm publication was run. Hydration/full SFC compatibility remain incomplete.

### Release CI retry and fresh live typed source

Remote v0.4.10 is verified to resolve to b5ed185bcb035a8bdd0decd5190412fb6f4001db, and the detached validated tree matches that exact commit. The first CI run 39054274803 failed only in the unchanged derived-only standalone bundling test: Bun reported EISDIR for core/src/index.ts and tracking.ts. Dart passed; macOS was canceled by fail-fast. Failed jobs were rerun at the same SHA to distinguish transient runner behavior before changing tested code; CI is not yet claimed green.

The typed select correction's forced actual-live gates pass: 487 core / 795 native tests, warnings-denied Clippy and CLI build, preserving the additional concurrent tests. A fresh packed 0.4.10 consumer compiles real typed DOM/SSR graphs with the actual live compiler; both strict checkers pass positive callbacks and reject the invalid event property. Evidence: select-release-consumer/typed-live-proof.json. Compiler changes remain local/unpublished, and npm publication has not been run.

### Runtime release CI green; SSR handler lookup correction

CI retry 39054274803 attempt 2 passes Linux JS, macOS JS and Dart at exact release commit b5ed185bcb035a8bdd0decd5190412fb6f4001db. The first EISDIR failure is retained in the release proof; the successful retry resolves the release CI gate without changing code or rewriting tags. No npm publication occurred.

A stronger compiled-source SSR probe contradicts the earlier handler-erasure assumption: Svelte's special select/option server factories evaluate handler lookup expressions (two calls) but never invoke the returned handlers. Native erasure produced zero lookups, changing supported source behavior. The isolated follow-up therefore preserves handler attributes and adds precise contextual event types before factory conversion, retaining typed callback checking without dropping lookups. This supersedes earlier statements that SSR lookup erasure was correct. The new library run was stopped before launch by the disk guard (615 MiB free); closed task-owned compiler snapshots are being losslessly archived to recover build space. The follow-up is not yet validated or applied live.

### SSR lookup-preserving typed factory follow-up

The isolated follow-up now retains generated factory handler attributes and applies precise contextual event types before conversion for typed select/option callbacks. The witness erasure consumes only namespace metadata again. Its complete library suites pass; fresh CLI build is active. This is not yet live or admitted by the lookup probe. Eight additional closed task compiler snapshots were losslessly archived with verified hashes/restore metadata, reclaiming 509 MiB after the disk preflight stop; current compiler tools and source remain available. Manifest: archived-closed-framework-compilers/manifest.json under the integration directory.

### Lookup preservation verified and broader static callback gap found

The isolated rebuilt compiler matches Svelte's exact handler trace in Bun and Node: handler lookup|handler lookup, with no handler run entries. Both strict checkers still pass typed select callbacks and reject the invalid event property. Clippy passes after removing 75 MiB of closed task-only link intermediates to clear the disk preflight threshold. The lookup-preserving fix is integrated after checking both live baselines, with backups/hashes in select-handler-lookup-live-applied.json; forced live tests are active.

A stronger typed fixture adds an option onclick callback. Its SSR graph typechecks, but the DOM graph loses contextual callback typing (TS7006 on event) in both checkers. This is an outstanding general static-intrinsic event typing gap, separate from the now-precise bound select callback. It must be fixed in the shared event lowering rather than suppressing noImplicitAny or omitting the DOM check. Evidence: select-release-consumer/typed-option-handler/checks.json and select-handler-preserved-trace-proof.json. Runtime 0.4.10 CI remains green; compiler publication and full source coverage remain incomplete.

Forced live-source validation of the lookup-preserving select/option SSR correction passed 487 core and 795 native library tests. Compile paths and four live-only callback tests establish source provenance; this does not establish CLI, packed-consumer or publication coverage. Static option DOM callback contextual typing remains under investigation in the isolated compiler. Evidence: `select-handler-lookup-live-library-proof.json` in the integration cache.

Isolated static-intrinsic callback contextual typing correction passed 485 core and 793 native library tests, then rebuilt the CLI. The original packed four-package option callback fixture now passes strict tsc and tsgo for DOM plus SSR; a fresh invalid-event-property variant is rejected by both checkers without implicit-any diagnostics. These are isolated-compiler results, not live integration. Namespace typing and broader runtime semantics remain to verify before copying the shared event pass. Evidence: `select-release-consumer/typed-option-context-fixed/checks.json` and `typed-option-context-negative/checks.json`.

Static intrinsic event typing: packed strict DOM/SSR fixtures accept HTML button callback `this` and precise currentTarget types for SVG a/circle and MathML mi. Both tsc and tsgo reject HTML-only disabled on all three non-HTML targets, ruling out permissive-any false positives. Bun type erasure of the original option fixture is byte-identical before/after (15,297 bytes). Reviewed shared event-pass change copied into live Crepuscularity with before-image and SHA records; forced live library validation is running, not yet claimed passed. Evidence: `typed-event-namespaces*/checks.json`, `typed-option-context-fixed/runtime-equivalence.json` under the packed release consumer; `static-option-events-live-applied.json` in integration cache.

Integrated static event context passed forced live-source library validation: 487 core / 797 native tests, including both new static event tests. Source-root compile paths are recorded in `static-option-events-forced-live.log`; its runner exited zero. No compiler publication was performed.

Live CLI validation now rebuilds eight typed DOM/SSR graphs across option and HTML/SVG/MathML fixtures, with eight tsc/tsgo outcomes (positive success and expected negative diagnostics). Evidence: `static-option-events-live-consumer-proof.json`; reproduction: `validate-static-events-live.py`. Full unfiltered CLI tests did not start because the guarded runner observed 545 MiB free; this is missing verification, not a test failure. Closed historical compiler snapshots are being archived losslessly to recover build space.

Existing unfiltered CLI harness passed all 17 tests against the rebuilt live CLI without a new Rust build; harness/compiler SHA values and scope are in `static-option-events-existing-cli-harness-proof.json`. This is execution of the existing harness, not a fresh cargo test compilation. A new unchanged bound input/textarea/checkbox fixture exposes three TS2322 currentTarget narrowing failures in each strict checker; source and diagnostics are in `select-release-consumer/typed-bound-control-audit`. The optional Sonnet audit runner exited with missing Anthropic API key, so this reproduction was investigated locally. Shared binding-lowering correction remains pending.

Bound input/textarea typing correction is drafted only in the isolated compiler: check authored handlers with precise element/currentTarget using the existing satisfies helper, then adapt to the private EventListener boundary. Both grouped and wrapper paths are covered in lowering; a focused input/textarea parser test was added. This draft is unbuilt and unverified because available disk remains below the guarded Rust-build threshold. Live binding lowering remains unchanged.

Bound-control callback candidate passed isolated compiler libraries: 485 core / 794 native, including a precise input/textarea context parser regression. Existing checked listener-order/object-handler tests remain green. The candidate checks inline callbacks before adapting to the unchanged private EventListener boundary; no live binding copy yet. The matching CLI build and fresh strict positive/negative consumers remain pending at this checkpoint.

First strict bound-control consumer run caught TS2352 at the generated listener adaptation despite correct authored context. The isolated draft now uses an explicit unknown bridge only after the authored satisfies check, matching the existing runtime-validated EventListener boundary. This revised candidate is not yet rebuilt; negative consumer proof is still required before acceptance.

The revised bound-control candidate (explicit listener adaptation after authored satisfies validation) passes 485 core and 794 native library tests. This supersedes only the isolated library result; packed strict consumers and live integration remain pending until the rebuilt CLI is checked.

Rebuilt isolated CLI passes strict tsc/tsgo bound input/textarea/checkbox callbacks, and both reject invalid event properties before listener adaptation. Generated DOM (9,099 bytes) and SSR (1,764 bytes) JavaScript is byte-identical after type erasure to the failing-type baseline. Reviewed binding-pass correction copied to live Crepuscularity only after exact baseline match; before-image/hashes saved. Forced live validation is pending. Evidence: `bound-events-consumer-proof.json`, `typed-bound-controls-fixed/runtime-equivalence.json`, `bound-events-live-applied.json`.

Integrated bound-control callback fix passed forced live-source libraries (487 core / 798 native) and live Clippy. Relevant compiler diffs pass whitespace validation. Matching live CLI rebuild is running; isolated consumer/type-erasure results remain separate until that binary is checked. No runtime package changes or publication are part of this fix.

Bound-control typing integration checkpoint: forced live-source 487 core / 798 native tests, Clippy, CLI rebuild, all 17 freshly run CLI integration tests, and fresh positive/negative packed consumer checks with both tsc/tsgo pass. Consolidated evidence: `bound-events-final-proof.json`; reproduction: `validate-bound-events-live.py`. Source compiler changes remain local/unpublished; broad SFC, hydration and async SSR coverage remain unfinished.

Follow-up typed handler-object audit reproduces TS2353 for capture/once on bound input/textarea/checkbox objects in both strict checkers. The generated helper already consumes these options at runtime; its private property type omitted AddEventListenerOptions. Isolated draft now includes the standard option intersection and strengthens the existing object-handler test; no runtime logic changes. Evidence: `select-release-consumer/typed-bound-handler-object/checks.json`.

Handler-option prototype passes 485 core / 794 native tests, rebuilds its CLI, and passes both strict checkers for bound and select object handlers in DOM/SSR. Negative fixtures reject string capture and unknown event properties without implicit-any diagnostics. All four positive graphs produce byte-identical JavaScript after type erasure. Evidence: `handler-options-consumer-proof.json`, `select-release-consumer/handler-options-runtime-equivalence.json`; reproducible with `validate-handler-options.py`. This small compiler type-only correction is still isolated, not integrated or published.

Handler-option type correction is integrated after baseline/hash checks and passes forced live 487 core / 798 native library tests plus Clippy. Live CLI rebuild and fresh positive/negative option-object consumers remain separate pending gates. Existing group-reference source and native createInputGroup/setInputValue helpers confirm source bind:group lowering is the next substantive application gap; no additional runtime group controller is needed.

Live handler-option consumer validation passes both strict checkers for bound/select objects and rejects invalid option/event properties. The next source group baseline is now current: unchanged `group-reference.svelte` fails both targets with explicit unsupported directive errors (`group-source-admission/before.json`). A lowering contract inventories parser/module/retention/SSR changes and component/iteration partition requirements without adding a runtime controller (`group-source-admission/lowering-contract.md`).

Source-group compiler research now has a reproducible six-case Svelte 5.57.1 reference contract (`group-source-admission/reference-groups.ts`, `reference-group-contract.json`). It verifies symbol/path grouping, distinct computed aliases and zero/one/two loop-index partitions, including transitive collection dependencies. Native source lowering remains unimplemented; existing runtime group tests do not prove this source contract.

Isolated group parser contract now preserves bind:group targets with a collision-free marker and validates static radio/checkbox inputs, duplicates and directive value shape. New tests cover target/shorthand preservation, marker hygiene and invalid input forms. Native compilation has an explicit preflight diagnostic until complete component/iteration lowering exists, preventing private markers from leaking. Reference probes corrected the plan: checked/bind:checked/bind:value coexistence is accepted upstream. Tests are running; no live parser copy or source-support claim.

Group parser draft first failed Rust E0505 because new type validation extended the borrowed attribute list into its consuming loop. Static radio/checkbox classification now occurs before that loop, matching the existing checkbox pattern. Corrected library validation is running. Oxc dependency scope APIs and module each-before-binding ordering were inspected for the forthcoming controller-allocation pass; lexical row allocation is not yet proven equivalent to reference index partitions.

Isolated group parser contract is verified: 487 core / 794 native tests and CLI build pass. The unchanged authored group reference reaches the explicit missing scope-partition diagnostic on DOM/SSR; both fail before output and preserve preexisting artifact sentinels. Evidence: `group-parser-contract-fixed.log`, `group-source-admission/parser-contract-cli-proof.json`. Native group lowering remains unfinished; no live parser integration or publication.

Isolated native group scope planner drafted as test-only work: Oxc resolves group-target symbols and normalizes expression structure; equal targets share a planned controller only in the same allocation scope. Tests cover sibling whitespace normalization, distinct computed aliases, component-wide loop-independent targets, nested row-dependent scopes and invalid/undeclared/constant targets. This does not yet emit controllers or source DOM/SSR support. Library tests are running (`group-scope-planner.log`).

Isolated scope planner passed 487 core / 798 native tests, including all four group-planning regressions. A test-only controller-slot insertion prototype now rewrites expression-bodied row callbacks and inserts component-level slots; its parser regression is running. This is allocation scaffolding only: hygienic names, multiple slots in one callback, raw input values, change-handler order, actual controller initialization and SSR must be completed before source support can be claimed. No production/native call site was enabled.

Controller-slot prototype passed its first parser regression (487 core / 799 native suite). Follow-up allocation now merges declarations per lexical scope before wrapping expression-bodied callbacks, avoiding invalid repeated wrappers when two group targets share a row. Generated names reserve decoded Oxc binding/reference names, including Unicode-escaped authored identifiers. A new parser+semantic regression covers both cases; tests are running. This remains isolated test-only scaffolding, not emitted native source support.

Allocation hygiene regression passes with the isolated suite: 487 core / 800 native tests. Group controller initialization, binding installation and SSR emission remain unimplemented; the guarded source rejection stays in place.

Test-only group emitter now initializes existing createInputGroup controllers and rewrites private target attributes into member-binding callbacks; radio/checkbox kind is validated from native IR. Initializer/parser regressions pass with 487 core / 800 native tests. A follow-up fix reserves generated setter and input parameter names against decoded authored identifiers; its regression is running. This prototype is not connected to source compilation: raw value installation, ordinary/capture change order, mixed-kind reference semantics, type namespace hygiene and SSR remain required before integration.

Group initializer name hygiene passes (487 core / 801 native isolated tests). The isolated compiler now calls the emitter for DOM after retained each lowering and carries group markers through binding retention/directive hints. Binder element types use the existing source-global namespace. SSR still has an explicit missing-lowering error. Wired library tests are running; no real source-browser compatibility proof or live compiler copy yet.

First unchanged source-group browser comparison runs successfully on native and Svelte 5.57.1, exposing raw object identity loss in native checkbox/radio values while string checkboxes/instance isolation work. Full phase records are retained in `group-source-admission/{native,reference}/browser-result.json`, with native pre-fix snapshot separately preserved. Isolated directives now route static checkbox/radio expression values through existing setInputValue instead of attribute string coercion. Validation is pending; no runtime dependency/controller was added.

First native source-group DOM acceptance: original group-reference.svelte unchanged, two component instances, seven Chromium 151 phases exactly equal Svelte 5.57.1 with no normalization or page errors. Raw object checkbox/radio values now retain identity using existing setInputValue; string membership ordering, conditional removal, independent instances and unmount match. Both strict tsc/tsgo checks pass generated source modules. Evidence: `group-source-admission/browser-proof.json`, `{native,reference}/browser-result.json`, `raw-values-typechecks.json`; reproducible browser assert: `validate-browser.py`. This is isolated compiler acceptance only. Loop-dependent/keyed partitions, dynamic values, change-handler order, reset/cancellation, mixed-kind groups, SSR and live compiler integration remain required. Bundle output sizes here are unminified fixture artifacts, not a performance comparison.

Source-group loop acceptance adds nine exact Chromium phases against unchanged Svelte 5.57.1 source: shared component targets across rows, row-dependent targets inside nested choice loops, keyed reorder, replacement with same keys, node retention, post-replacement writes, removal and unmount. Both strict checkers pass (`group-source-admission/loops/{browser-proof,typechecks}.json`). A separate unchanged event/reset source fixture proves ordinary onchange currently sees the old native model; reference sees the new model. Reset cancellation and final reset model/checked state match; only the retained event trace differs. Evidence: `group-source-admission/events/{native,reference}/browser-result.json`, `diagnosis.json`. Fix source listener order before claiming group compatibility.

Isolated group event-order correction passes 487 core / 802 native tests. Group allocation now runs after existing source-event lookup/context lowering; it removes the authored onChange attribute, validates its existing expression contract and installs ordinary listeners after group.bind, with capture ordering and disposal cleanup matching the shared binding pattern. Uses existing SourceGlobals and native onCleanup; no runtime package changes. Browser event/reset revalidation and previous source fixtures are still pending a rebuilt CLI.

Group listener-order correction now passes exact source differential browser checks: 7 basic + 9 keyed/nested-loop + 4 event/reset phases, no normalization or page errors. Ordinary onchange observes the new group model; reset cancellation and final reset state still match. All three regenerated TypeScript graphs pass tsc and tsgo (six strict outcomes). Evidence: `group-source-admission/event-order-browser-proof.json`, `event-order-typechecks.json`; reproduction: `validate-event-order.py`. Earlier graphs/results are preserved under each before-event-order directory. This is isolated DOM compiler acceptance; SSR, dynamic value changes, mixed-kind grouping, broader diagnostic cases and live integration remain incomplete.

Group SSR reference contract now runs unchanged main/loop/event fixtures plus a raw/missing/nullish/order probe under Bun and Node: all four pairs agree. Svelte serializes value, computes group checked immediately after it, and may evaluate a value expression twice; trace is attr,value,model,value,attr. Missing value differs from explicit null/undefined. Authored checked may remain alongside a second generated checked attribute. Evidence: `group-source-admission/reference-ssr-contract.json`; probes in `probe-ssr-values.ts` and `reference-ssr.ts`. A native SSR implementation must retain ordered lazy attribute entries rather than flattening these semantics into an eager property record. Source group SSR remains explicitly rejected.

Moonshine SSR adds an opt-in hSourceEntries factory using the existing intrinsic serializer: ordered name/value entries retain duplicate authored attributes and lazy read/coercion order. Focused tests cover duplicate checked, escaping, client-only suppression, rejected names/raw HTML and failure short-circuiting. All 415 DOM tests / 2,233 assertions and both 25-project typecheck lanes pass. Default signal exports and dependency manifests are untouched. Full repository tests are running; group SSR compiler emission is still pending.

Ordered-entry runtime gate: current whole-tree Bun suite passes 2,156 tests / 9,446 assertions; package policy and both typecheck lanes pass, scoped lint has only existing warnings. Isolated group SSR draft passes 487 core / 804 native tests, rebuilds its CLI and runs four source fixtures in both Bun/Node using a freshly packed, unpublished local DOM artifact (`ssr-native/artifact.json`). Raw/nullish/value-order behavior executes correctly, including the expected repeated value lookup trace. First comparisons exposed synthetic defaultValue/defaultChecked duplication in source IR; the draft now suppresses defaults when a live property exists, matching the existing serializer precedence, with a new regression running. No parity claim yet. Text quote escaping in the trace is an existing native serialization spelling difference and will be checked as parsed JSON text, separately from ordered attributes.

Native group SSR acceptance now passes eight differential runs: main, nested/keyed loop, event/reset and raw/missing/nullish/evaluation-order fixtures under Bun and Node. Main/loop/event bodies match after only hydration anchors and input void-slash normalization; raw-value probe compares ordered attribute tuples (including duplicate checked) and parsed JSON trace text to account for quote entity spelling. Value reads occur twice in the same attr,value,model,value,attr order. Fresh physical consumer uses the unpublished packed local DOM serializer plus three release packages; both strict checkers pass all generated typed SSR modules. Evidence: `group-source-admission/ssr-native/{parity-proof,typechecks,artifact}.json`; reproduction: build.py, bundle.ts and validate.py. This is isolated compiler acceptance, not live integration/publication. Combined binding directives, mixed-kind groups, reactive value changes, broader diagnostic cases and regressions still require coverage.

Combined source binding audit found a real SSR leak: bind:group + bind:checked compiled successfully but retained the private checked marker in ordered attributes (`group-source-admission/combined/compile-before.json`). Installed Svelte emits group-derived and independently bound checked entries. Group SSR emission now runs after the existing checked/value binding pass; a full compiler regression verifies the marker is absent and both checked entries remain. Isolated suite passes 487 core / 806 native tests; CLI rebuild and combined DOM/SSR differential checks remain pending.

Combined bind:group + bind:checked now matches Svelte across six Chromium phases (initial precedence, click, independent checked/group writes, second click and unmount), two Bun/Node SSR comparisons and both strict checkers in separate DOM/SSR consumers. Private checked markers no longer reach output. The previous 20 DOM phases and eight SSR comparisons were rebuilt and rerun successfully after the pass-order correction. Evidence: `group-source-admission/combined/{browser-proof,ssr-proof,typechecks}.json`, `event-order-browser-proof.json` and `ssr-native/parity-proof.json`. A combined checker project initially unified released and unpublished DOM artifacts sharing version 0.4.10; checks now use distinct consumer projects, and the unpublished tarball remains explicitly labeled. This is 26 bounded browser phases / 10 SSR comparisons, not full group compatibility or live compiler integration.

Ordered-entry runtime committed and pushed on main as b316fa0 (three owned DOM files only); no version bump/tag/npm publication yet. Runtime gates include 2,156 full-tree tests, both 25-project typecheck lanes, package policy, 11 adapters and 42 catalog exports. Source-group reactive object-value fixture adds eight exact Chromium phases and both strict checkers: changing a checkbox/radio raw value refreshes checked state without replacing its node, writes preserve identity, and unmount matches. Evidence: `group-source-admission/dynamic/{browser-proof,typechecks}.json`. Isolated compiler source-group acceptance now totals 34 browser phases plus 10 SSR comparisons; broader diagnostics/mixed-kind coverage, final compiler gates and live integration are still pending.

Current group diagnostic matrix compares eight sources against installed Svelte and both native targets. Seven target/type cases agree (constant/member, undeclared/call/optional targets, literal-expression/dynamic type); store-backed groups expose a source import gap: svelte/store was rejected despite independent stores and auto-subscription lowering. Isolated named-import bridge now admits actual native writable/readable/derived/get exports and supported store types, preserving aliases/type-only syntax and rejecting unavailable exports/namespace/default forms. Two regressions are running. Evidence: `group-source-admission/diagnostics/results.json`, `check-diagnostics.ts`. No host dependency or new store runtime was added; store-backed group execution remains to verify.

Store import bridge rebuilt CLI now reaches group lowering, exposing phase errors: DOM group targets had become store read calls and SSR lost the declared $store target. Group controller/setter emission is now before store/rune lowering, while authored event installation remains after existing source-event lowering. Planner resolves unsubscribed $store targets to their declared store symbols without treating immutable store references as immutable values. A full DOM/SSR compiler regression checks reuse of setStoreValue; corrected tests are running after fixing a generated-format brace error. Three closed predecessor CLI binaries were losslessly archived with hashes/restore paths to recover build space; the current executable is preserved. No store-backed runtime acceptance claim yet.

Store-backed source groups now execute unchanged imports from svelte/store through native writable/get. Six exact Chromium phases match Svelte, including external store writes, checkbox writes, one start/stop pair, disposal and no post-disposal resubscription. Bun and Node SSR snapshots match with exactly one start and stop per render. Separate DOM/SSR generated graphs pass both strict checkers. Evidence: `group-source-admission/store/{browser-proof,ssr-proof,typechecks}.json`. Previous group fixtures are being rerun because setter generation moved before store/rune lowering; no live integration claim yet.

Final isolated Clippy first found one redundant replacements binding; removing it yields a clean Clippy run. Fresh Cargo CLI tests did not start when disk fell to 172 MiB, but the existing 17-test harness passes against the current isolated binary (`group-existing-cli-harness-proof.json`, explicitly scoped). New mixed radio/checkbox source fixture exposes valid array-model divergence: Svelte shares group membership and preserves the checked radio array payload in the next checkbox write, while separate native kind controllers drop it. Both browsers have no errors and earlier phases agree. Evidence: `group-source-admission/mixed/{native,reference}/browser-result.json`, `diagnosis.json`. Same-target mixed kinds need shared membership and per-input selection semantics before live integration.

Mixed-kind correction uses existing createInputGroup with explicit mixed mode: shared membership, fixed per-member radio/checkbox selection, checkbox collection includes all checked payloads, and existing raw identity/cleanup paths are retained. Svelte binding bridge accepts that mode without a host dependency. Regression reproducing the lost checked-radio array payload passes with all 41 binding tests. Isolated compiler planner now merges same-target kinds into a single mixed controller; SSR derives comparisons from each actual input type. Compiler regression and DOM/Svelte runtime/typecheck gates are running. Browser proof with freshly staged runtime artifacts remains pending.

Mixed-kind source correction is now browser-verified using freshly packed unpublished DOM/Svelte artifacts with SHA records (`mixed/runtime/artifacts.json`). All three exact Chromium phases match Svelte and preserve the selected radio payload. Bun/Node SSR comparisons and both strict checkers pass generated DOM/SSR graphs (`mixed/{browser-proof,ssr-proof,typechecks}.json`). Runtime DOM+Svelte suite passes 817 tests / 4,008 assertions and both 25-project typecheck lanes; isolated compiler 487 core / 810 native tests and Clippy pass. Full Moonshine suite completed; fresh CLI tests are running. Native source baselines for authored parser, module orchestration and directive lowering still match the live compiler, so later scoped integration can preserve concurrent work. No new publication.

Live compiler integration applied six scoped files only after exact source baselines/one-line visibility checks, with before-images and SHA records (`group-live-applied.json`, `group-live-before/`). Native lib wiring preserves concurrent modules and gates svelte_groups behind web-modules; this missing guard was caught during actual diff review. Authored parser metadata, group allocation/SSR/event/store passes and typed raw input values are now local-live, but forced live library validation is still running. Existing Moonshine runtime mixed-mode changes remain uncommitted; full current suite passes 2,157 tests / 9,453 assertions and fresh isolated CLI tests pass. No native compiler release or npm publication is implied.

Live integration passes forced 489 core / 814 native tests, no-default/no-web Cargo check, live Clippy and forced actual-source CLI build. Runtime mixed membership commit 70d685d is pushed after 2,157 current-tree tests / 9,453 assertions and both type lanes; only four owned runtime files were committed. SDK 0.4.11 candidate is staged in a fresh detached validation worktree with 26 public manifests/changelog, frozen install and passing package/adapter/catalog checks. Clean candidate tests/types/format and live CLI tests are running. Existing 0.4.10 validation worktree was left intact after checkout refusal; no branch or unrelated user files were reset. No tag/release/npm publication yet.

SDK 0.4.11 release candidate is committed/pushed as 6976e9c97c7e52380e48aea28b3be65d0ceda183. Its isolated candidate passes 2,150 tests / 9,370 assertions, both 25-project typecheck lanes, corrected formatting and package/adapter/catalog checks. All 26 tarballs verify 0.4.11/ranges. Fresh four-package consumer with forced live compiler passes 43 minified browser phases, 16 SSR comparisons and both strict checkers; native bundle inputs contain no host frameworks/parser WASM and default core measures 4,041 bytes. CI 39061588054 is running; tag/release/npm publication have not occurred. Consolidated proof: `ordered-group-release-proof.json`; consumer `group-source-admission/release-0.4.11/acceptance-proof.json`.

### 0.4.11 release verification

Tag `v0.4.11` and the GitHub release now point to `6976e9c97c7e52380e48aea28b3be65d0ceda183`. CI run `39061588054` completed successfully. The isolated release candidate passed 2,150 tests / 9,370 assertions, both 25-project typecheck lanes, package/adapter/catalog checks, formatting and size checks. The signal-only bundle measured 4,041 minified bytes. A physical release-tarball consumer passed 43 browser phases and 16 SSR comparisons against the reference compiler. npm publication was not run. Crepuscularity source changes remain local and unpublished; full SFC coverage, hydration and async SSR remain incomplete. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/ordered-group-release-proof.json`.

### 0.4.11 SSR performance follow-up

Reproduction: `bun scripts/benchmark-ssr.ts` on Bun 1.4.0, darwin arm64, compared with Solid 1.9.14. Exact escaped HTML was asserted for a heading, input and 100 list rows. Across 25 alternating batches of 500 renders, Moonshine median was 46.98 ms versus Solid 13.03 ms (3.60x longer). Minified server bundles were 11,390 versus 42,018 bytes; gzip 4,491 versus 13,196. Seven fresh-process samples measured medians 20.96 versus 23.83 ms; these include process startup, import, render, exit and OS cache effects. This compares Moonshine factories with equivalent hand-written Solid compiled server calls, excludes routing/hydration/async data, and is not an end-to-end source compiler benchmark. No universal speed claim follows. Next performance investigation: attribute validation/allocation and per-node factory serialization overhead, preserving getter ordering and escaping. Raw result and source hashes: `/Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.11-ssr-benchmark.json`.

### Readonly store source integration

The local live Crepus compiler now admits named/aliased `readonly` imports from `svelte/store`, targeting Moonshine’s independent store module. A fresh source graph passes both strict TS checkers, six exact Chromium interaction/disposal phases against Svelte and Bun/Node SSR comparisons. Native production inputs exclude host frameworks and parser WASM. Live library gates passed 492 core and 814 native tests; Clippy and touched-file Rust formatting pass. Moonshine runtime commit `434daf2` passed CI run `39062157710`. Compiler edits remain uncommitted/unpublished alongside concurrent Crepus work. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/group-source-admission/readonly/acceptance-proof.json`.

### Named store barrel exports

Local Crepus now rewrites named `svelte/store` re-exports using the same allowlist as imports, preserving aliases and effective type-only forms. Unsupported exports still diagnose. A real CLI source graph through an ordinary TS barrel passed strict tsc/tsgo, six exact reference Chromium phases and Bun/Node SSR, with no host frameworks or parser WASM in native bundles. Live gates: 492 core, 815 native, 17 CLI tests; Clippy and touched Rust formatting pass. Compiler changes remain local/unpublished alongside concurrent work. Source hashes and acceptance: `/Users/undivisible/.cache/moonshine-live-merged-integration/group-source-admission/store-barrel/`. Scoped patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/store-reexports-scoped.patch`.

### Combined live compiler source gate: 856 modules

The actual current live compiler passed the complete native SFC gate: 676 baseline modules (original 670 plus six dynamic-element scoped-CSS artifacts), 40 SSR prop-order, 18 Vue defaults, six Solid, 64 Svelte await, 46 mount and six JS public-type modules. This includes strict emitted/caller type lanes, minified browser interactions, fresh SSR, declaration consumers and actual Bun/Node22 ESM cycles. The gate had a stale negative for now-supported scoped dynamic elements; it now requires successful DOM/SSR compilation and separately counts all six artifacts, retaining the original 670-module assertion and nine unsupported CSS boundaries. No compatibility claim beyond the tested source slice. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/current-live-full-sfc-proof.json` and full log. The gate remains an existing untracked integration script; its scoped diff is saved without staging unrelated work.

### Opt-in response context transport

Commit `dca24f9` adds a third optional response Headers argument to RequestScope and `getResponseHeaders()` on the existing server-only request subpath. The pipeline creates one sink per scoped request and reuses final response merging across normal, redirect, error, boundary, not-found and HEAD responses. Response ordinary headers retain precedence and cookies remain separate fields. 2,166 tests / 9,508 assertions and both 25-project TS lanes pass, including actual Bun/Node deployment bundles and deterministic concurrent isolation. Default core remains 4,041 bytes. Next-style cookie mutation is still pending; this supplies shared transport. Evidence `/Users/undivisible/.cache/moonshine-live-merged-integration/response-headers-proof.json`.

### Independent Next cookie writes

Commit `b248ebf` adds set/object-set/delete and filtered reads to the existing independent server-only headers entry. A shared request-local jar reflects writes; response fields flow through the opt-in response scope. Serialization encodes values and rejects invalid names/options before mutating headers or reads. Chromium verified real browser storage, Unicode, HttpOnly, redirects, deletion and context isolation. Actual Bun/Node deployment artifacts use the copied public adapter package and pass isolated concurrent cookies. Full checks: 2,201 tests / 9,623 assertions, both 25-project typecheck lanes, policy/catalog/adapter/size and touched formatting/lint. Signal core remains 4,041 bytes. Streaming Server Actions, signing, prefix/domain policy and Next cache/phase restrictions remain outside this API. Evidence `/Users/undivisible/.cache/moonshine-live-merged-integration/cookie-mutation-proof.json`.

### 0.4.12 request-context overhead

Extracted release archives were measured in a reproducible three-lane in-process pipeline: no request scope, empty request scope and one cookie write. Each lane checks body/cookie output and consumes response text. After five warmup batches, 25 alternating-order batches of 500 sequential requests measured median Bun 1.4.0 times of 1.86 / 2.88 / 3.62 ms; Node 22.23.1 times were 10.74 / 12.79 / 13.76 ms. The fixture reuses one Request and excludes network, request construction, compilation, hydration and startup; this is one loaded-host run, not a universal performance comparison. Scope overhead is opt-in and the signal bundle stays 4,041 bytes. Raw samples, source/bundle hashes and package provenance: `/Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.12-consumer/benchmark-provenance.json` and adjacent benchmark JSON.

### 0.4.12 release verification

The annotated remote tag and published GitHub release `v0.4.12` point to `e909c46aa1cbd2bedf3aea537343c50468524c06`. CI run `39063638941` succeeded on Linux, macOS and Dart. The matching isolated candidate passed 2,194 tests / 9,540 assertions, both strict 25-project typecheck lanes, formatting, lint without errors, package/adapter/catalog/size checks, all 26 archive versions/ranges and extracted-package Bun/Node/browser acceptance. npm publication was not run. The local Crepus store and grouped-binding compiler changes remain separate and unpublished; full compatibility and hydration remain incomplete. Evidence: `/Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.12-proof.json`.

### Native file binding runtime

Commit `f214d60` adds opt-in native bindFiles and a Svelte binding re-export. It reuses owned change/reset listeners, preserves nullish models without adopting or clearing selected files, and applies FileLists synchronously. Eight real Chromium phases match Svelte 5.57.1, including programmatic clearing and cancelled reset. Native disposal removes the retained input listener; the reference still mutates via that detached input, an explicit difference. 2,204 tests / 9,642 assertions, both 25-project typecheck lanes, copied host-free package checks, touched lint/format and package/adapter/catalog/size checks pass. Signal core stays 4,041 bytes. Authored bind:files lowering is still pending in Crepus; no source or hydration support claimed yet. Evidence `/Users/undivisible/.cache/moonshine-live-merged-integration/files-runtime-proof.json` and `group-source-admission/files/runtime-browser-proof.json`.

### Authored file-input source integration

The local live Crepus compiler now accepts literal type=file intrinsic inputs with bind:files identifier/member targets. The parser retains a collision-free marker; native lowering reuses the independent runtime helper and existing retained/directive scopes. SSR emits no file value, reads no bound getter and calls no handler factory, while unreachable typed checks retain model assignments and change-event validation. Typed and plain-JS browser fixtures plus keyed-row reorder/replacement/removal provide 32 matching phases; three disposal probes explicitly differ because native cleanup removes saved detached listeners. Eight Bun/Node SSR comparisons pass. Both strict lanes accept the typed graphs; 16 wrong-model/event/factory/readonly negatives and 14 source rejection checks pass. JS bodies remain JavaScript. Actual live gates: 494 core, 818 native and 17 CLI tests, Clippy, no-web check, Rust formatting and combined 856-module source acceptance. Source compiler remains local/unpublished; it requires runtime commit f214d60 (not in runtime release 0.4.12). Dynamic input types/elements, spreads, function bindings and hydration remain unsupported. Proof and isolated patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/files-source-proof.json` and `files-source-with-docs.patch`; source/browser/type artifacts live under `group-source-admission/files/`.

### Parallel compiled-framework audit follow-up

Read-only OMP Sonnet 5.5 audits inspected actual Astro, Angular and Solid source paths. Astro still needs a frontmatter/imported-component/slot compiler contract; Angular needs a standalone class/template/props and lifecycle contract before host entries can be replaced honestly. Worker proposals are not verified implementation plans. The smaller next candidate is explicit authored Solid createResource admission: the independent native runtime already exists, but the compiler allowlist rejects it. Primary verified this boundary in moonshine_module.rs and adapter-solid/solid.ts. Initial scope should admit DOM source and precise type mapping, keeping unsupported SSR explicit rather than silently starting async server fetches. Source lowering remains Crepus-owned, runtime/resources remain Moonshine-owned. Reports: `/Users/undivisible/.cache/moonshine-live-merged-integration/{astro-gap,angular-gap,solid-gap}-worker.log`.

### 0.4.13 release verification

Annotated remote tag and GitHub release v0.4.13 target `0ce75accceef50e192ff893af2636cd68cb364b7`; CI run `39065886582` succeeded on Linux, macOS and Dart. The matching isolated checkout passed 2,197 tests / 9,559 assertions, both 25-project type lanes, formatting/lint and package/adapter/catalog/size checks. All 26 archives have correct versions/internal ranges. Physical extracted packages passed 32 browser phases and eight SSR comparisons, with three explicit retained-listener cleanup differences; source graph inputs remain inside the extracted consumer and exclude host frameworks/parser WASM. Core remains 4,041 minified bytes. npm publication was not run; matching Crepus source changes are still local/unpublished. Evidence `/Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.13-proof.json`.

### Local Solid client resource source admission

Explicit per-file Solid pragmas now admit DOM createResource/Resource imports, aliases, reexports and type queries. SSR forms reject. Compiler remains local/unpublished; SDK 0.4.13 provides the independent runtime. Six integration tests, native library Clippy, targeted test Clippy, 494 core/818 native tests, 17 CLI tests, 856 source modules, both strict positive lanes and six strict negatives pass. Thirteen browser phases match pinned Solid 1.9.14. Whole acceptance bundle is 22,259/8,484 gzip bytes versus Solid 19,826/7,636; no speed claim. Scoped patch and hash proof: /Users/undivisible/.cache/moonshine-live-merged-integration/solid-resource-source-scoped.patch and /Users/undivisible/.cache/moonshine-live-merged-integration/solid-resource-source-proof.json. Hydration, async SSR and full resource options remain unsupported.

### Imported Solid component gap audit

Eight live CLI probes confirm local children compile in DOM/SSR while relative default/named (including local aliases) and external components reject; six failures preserve existing facade output. The missing contract is export-level provenance across the relative module graph, not a missing runtime wrapper. Resolver-backed admission and reference-browser acceptance are specified in /Users/undivisible/.cache/moonshine-live-merged-integration/solid-imported-components-audit/next-contract.md. Read-only OMP Sonnet 5.5 review completed; alias and blanket cycle restrictions were not adopted without evidence. No imported-component implementation or parity claim yet.

### Local relative Solid component graph admission

Resolver-aware native compiler entries and CLI now prove relative default/named imports, local aliases and named/default reexport chains, with an explicit Solid pragma on every hop and a stable synchronous function at the ultimate export. Standalone compilation remains fail-closed. External/foreign, namespace/member/dynamic and export-star component lookup remain unsupported. No Moonshine runtime or dependency changes.

Verified: 494 core / 826 native library tests, 23 Solid regression tests, 22 CLI graph tests, native Clippy, no-web check, full 856-module source gate, strict DOM/SSR graph checks in tsc/tsgo. Thirteen exact pinned Solid browser phases include imported child setup/mount, live props, connected cleanup, focus/selection/identity, resources and disposal. Four fresh Bun/Node SSR requests have identical parsed attributes/text, with explicitly different raw escaping. Whole browser fixture 23,012 raw / 8,680 gzip versus Solid 21,202 / 8,101; no speed claim. Existing lib.rs baseline formatting differences were observed; no broad formatting rewrite.

Compiler remains local/unpublished; physical SDK 0.4.13 provides independent runtime. Manual bootstrap required; no hydration or async SSR. Scoped source patch: /Users/undivisible/.cache/moonshine-live-merged-integration/solid-components-source-scoped.patch. Hashes and checks: /Users/undivisible/.cache/moonshine-live-merged-integration/solid-components-source-proof.json. Review completed through OMP Sonnet 5.5 with no concrete admission bypass reported; report is read-only evidence, tests are separate.

### Independent Solid SSR lists / source typing boundary

SDK increment 0.4.14 adds synchronous For/Index on the opt-in native SSR facade, matching pinned server list length snapshots, callback shapes, captured Index values and fallback access order. DOM/SSR fallback types are independent; explicit For<T,U>/Index<T,U> calls retain their prior fallback contract. Six runtime tests and strict public type fixtures cover behavior, row errors, fresh request context and cleanup. Isolated SDK: 2,203 tests /9,588 assertions /262 files, 25 projects each tsc/tsgo, full format/lint and package/catalog/adapter checks; core 4,041 bytes. Twenty-six physical archives verified; extracted consumer passes ten Bun/Node fresh SSR requests, strict types and host/parser-WASM bundle exclusion.

Authored JSX list controls remain rejected. A concrete six-result tsc/tsgo probe proves callback getter and generic h lowering lose contextual types; direct callback-valued For calls pass. Next compiler contract: /Users/undivisible/.cache/moonshine-live-merged-integration/solid-list-source-next-contract.md. Source parsing stays in Crepus. No hydration, async SSR, smallest/fastest or cleanup timing parity claim. Release proof: /Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.14-proof.json; npm publication not run.

### Authored Solid lists / SDK 0.4.15 candidate

Crepus now locally lowers pragma-selected named For/Index imports, aliases and nested list expressions through typed lazy factories. Callback contextual inference, imported children, explicit self-closing children and lazy fallback ownership are covered. Source lowering remains local and unpublished; no component parser was added to Moonshine. Expression props only: spreads, namespace/member tags, mutable aliases, JSX type arguments and extra callback children reject. Bare intrinsic data attributes retain empty values; broader intrinsic attribute parity remains incomplete.

Moonshine runtime f4757fb preserves unbound callback capture, DOM For arity, duplicate prefix/suffix identity, notified same-array changes, retained Index values and cleanup before replacement setup. Fallback branches are owned and recreated on notified empty values. Default native mapper scheduling remains unchanged. Failed cleanup drains rather than claiming exact Solid failure timing. Release preparation ce59f20 versions 26 archives as 0.4.15; npm publication was not run.

Evidence: 24 exact pinned-reference browser phases with focus/caret/local-state retention, 10 fresh Bun/Node SSR comparisons, 16 strict emitted-graph negative checks and positive tsc/tsgo lanes from physical 0.4.15 archives without runtime overlays. Full SDK 2,227 tests; native SFC gate 856 modules; CLI 41 tests; native library 839 tests. Core 4,041 minified bytes. Full application list fixture: native 27,406 raw /9,591 gzip bytes; Solid 24,613 /8,703, so no size improvement or speed claim. Hydration, async SSR and compiled Solid ABI remain unsupported. Proof: /Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.15-proof.json. Scoped compiler patch: solid-lists-source-scoped.patch in the same directory.

### Rendered route data / SDK 0.4.16

Native server loaders/actions now unwrap the framework RouteData contract produced by the independent React Router data helper, preserving payload identity and rendering status/headers. Route-order loader metadata and explicit action precedence, separate cookies, bodyless statuses, after middleware and invalid-metadata stream cleanup are verified. Direct/thrown Response values bypass data metadata; thrown wrappers and client data-router hooks remain unsupported. No parser or host runtime added. Full SDK: 2,236 tests; both 25-project typecheck lanes; fresh physical-archive GET/POST/HEAD consumers on Bun/Node and strict tsc/tsgo; core 4,041 bytes. Proof: /Users/undivisible/.cache/moonshine-live-merged-integration/release-0.4.16-proof.json. npm publication not run.

Next ownership audit found that native runWithOwner preserves ambient dependency collection whereas pinned Solid clears it. Direct re-export is unsafe; reproducible memo run counts are native 2 versus Solid 1. Contract/probe: owner-api-next-contract.md and owner-api-reference-probe.ts in the same proof directory.

### Captured native Solid owners / runtime f0b3685

Independent getOwner/runWithOwner/Owner exports on /solid and /ssr restore captured contexts for synchronous callbacks after awaits. Callback reads are untracked; newly registered effects start after setup; error owners handle synchronous failures and root disposal stops attached work. The generic DOM runWithOwner remains an owner swap, with the separate runWithOwnerCallback boundary used by the adapter. Marked source imports/aliases/type Owner are locally admitted in Crepus; unmarked bridges still reject them. Compiler changes remain local and unpublished.

Verified 2,242 SDK tests, both 25-project strict lanes, 856 SFC modules, 29 native integration tests, 41 CLI tests, 839 native library tests and clippy. Four minified browser phases match Solid 1.9.14 for mount/async resume/signal update/disposal. Fresh Bun/Node SSR ownership/cleanup pass. Sixteen emitted-graph type negatives reject invalid owner, callback, result and nullability. Core remains 4,041 bytes. Fixture native 17,794 raw /6,862 gzip bytes versus Solid 16,364 /6,307; no size or speed improvement claim.

Limits: existing effects retain native update timing and can rerun within owner callbacks; callback failure cleanup/error timing remains native. Owner handles are native and opaque to host compiler code; disposed owners reject new owned work; callback awaits do not retain the owner across suspension. Transition/Suspense scheduling remains unsupported. Proof: /Users/undivisible/.cache/moonshine-live-merged-integration/owner-api-proof.json; scoped compiler patch owner-source-scoped.patch in the same directory. npm publication not run.

### SDK 0.4.17 release and follow-up audit

Release preparation 3159423 and tag v0.4.17 passed exact Linux/macOS/Dart CI. All 26 physical archives checked; owner fixture passes four matching browser phases, 16 strict negative checks, both positive type lanes and fresh Bun/Node SSR ownership/cleanup without runtime overlays. Source compiler changes remain local and unpublished; npm publication not run. The sideEffects:false experiment saved only 36 raw/16 gzip bytes and was fully restored; no source manifest flags changed. The proposed Astro compiled-page loader duplicates existing framework-source/native rendering and its standalone tests; real source lowering/island hydration remain gaps. Evidence: next-audit-verified-decisions.md and owner-side-effects-cost.json in /Users/undivisible/.cache/moonshine-live-merged-integration.

### Compiled framework source audit / documentation 7dbe2b3

Actual CLI probes show Astro fenced constants, Astro.props and top-level await compile with exit 0 but native output has empty interpolations on fresh Bun and Node. Core Astro parsing is template-only; the missing lane is authored module execution/lowering. The next contract is astro-authored-module-next-contract.md in /Users/undivisible/.cache/moonshine-live-merged-integration; no new runtime wrapper is needed.

Angular template bindings are already live through explicit scope/handlers. An actual .component.html fixture verifies click, keyed string reorder with node identity, removal, append and disposal in Chromium; Bun/Node SSR preserve escaped loop values. No Angular/React/parser WASM in the browser bundle. This corrects the read-only worker's unverified inference that Angular loops were frozen. Class/decorator/DI integration remains unsupported. Adapter READMEs now document the observed paths and limitations. Proof: compiled-framework-source-audit/audit-summary.json in the same cache directory. No compiler/runtime behavior changed in this documentation increment.

### Astro source span foundation / local compiler increment

Core now re-exports split_astro_source, AstroSource and AstroFrontmatter. Borrowed script contents and original UTF-8 byte ranges are preserved, with an exact template start offset. Both the legacy template blanking path and public splitter share the same fence scanner. Tests cover UTF-8, CRLF, whitespace, empty/absent fences, close-at-EOF and malformed fences; the existing legacy template AST test remains authoritative.

Passed 501 core library tests, 839 native library tests, 41 CLI tests and core/native web-modules clippy. A rebuilt compiler emits byte-identical TypeScript for all four previous Astro probes. Script execution is still absent; this is the parser contract for subsequent authored-module lowering, not Astro replacement. Fence matching remains the shared template frontend's line-based matching; JS lexical fence handling needs review in the authored compiler.

No Moonshine runtime, dependency or default export changed. Compiler edits remain local/unpublished and preserve the large concurrent Crepus worktree. Exact increment patch/proof: /Users/undivisible/.cache/moonshine-live-merged-integration/astro-frontmatter-spans-scoped.patch and astro-frontmatter-spans-proof.json.

### Authored synchronous Astro server modules / SDK 0.4.18 candidate

Moonshine feature c0ee780 adds independent @tschk/moonshine-astro/ssr factories, class:list/style normalization, component prop snapshots and explicit attribute serialization. The default kernel is unchanged (4,041 bytes). Local Crepuscularity now splits/lowers fenced frontmatter into per-render factories, hoists static imports/types, types Astro.props using Props, compiles imported .astro children and simple maps/conditionals. Scriptless entry templates retain scope-based legacy emission; scriptless imported children use the authored graph. DOM, top-level await, dynamic imports and unsupported Astro globals reject before graph writes. Source parsing remains in Crepus.

Literal and braced attribute origins stay distinct through source-preserving core parsing and native JSX emission; literal entities decode once, expression strings retain their own values, text quotes/backslashes survive. hAttributes avoids property aliases/selection inference and omits nullish values. Async source children reject synchronously while handling rejected promises. Two independent reviews were reconciled against code, executed probes and the saved official Astro reference; Fragment already lowers structurally in core, and ordinary booleans/class:list semantics must not be changed based on worker recollection.

Final local compiler: core 505, native library 839, authored Astro+Solid integration 44, CLI graph 44, clippy pass. Final source acceptance 856. Clean SDK candidate: 2,253 tests, both 25-project typecheck lanes, format/lint/package/adapter/catalog/size checks pass. All 26 package tarballs checked; fresh physical core/dom/Astro archives run compiled parent/child and edge fixtures on Bun and Node; eight bad-prop cases reject in tsc and tsgo. No host runtime, React or parser WASM in these bundles. No performance advantage claimed.

Release commit 51ac0bc is pushed; exact CI run 39080390029 is pending at this entry. Npm publishing not run. Compiler changes remain LOCAL/UNPUBLISHED in the concurrent Crepus checkout; do not stage broad files. Scoped increment: astro-authored-module-scoped.patch (separate from preceding span patch). Proof: release-0.4.18-proof.json, actual fixtures astro-0.4.18-archive-consumer in the integration cache. This handoff file is local, not sent to another chat.

Limits: slots, client directives, script/style blocks, runtime exports, async rendering/children, combined class and class:list, hydration and full host ABI unsupported. Shared fence matching is still line-based; lexical JS fence handling needs follow-up. Full source support and framework replacement remain incomplete.

### 0.4.18 release and subsequent Astro compiler audit

SDK 0.4.18 release 51ac0bc is pushed/tagged; CI 39080390029 passed Linux/macOS/Dart. GitHub release https://github.com/tschk/moonshine/releases/tag/v0.4.18, npm NOT published. Packed consumers and strict negatives pass as recorded in release-0.4.18-proof.json.

Subsequent local compiler audit: native Astro emitter now reconstructs authored logical/map prefixes without added parentheses, preserving falsey zero and || / && precedence and accepting optional maps. Native integration45 +CLI44 +clippy pass. Runtime fixture Logical.astro proves the corrected zero/precedence but FAILS sibling side-effect order: expected <em>1</em>, observed <em>0</em>. Existing generic reactive JSX lowering defers preceding logical evaluation while eager following sibling factories read values. Do not publish compiler or call this fixed. Repro: group-source-admission/astro-authored/{source/Logical.astro,logical.ts,logical-out}. Next: independently synchronous Astro lowering should evaluate expression/attribute values in source order, reusing core AST rather than the reactive JSX choice pipeline. Keep changes in Crepuscularity. Consider emitting direct factory expressions from existing parsed core nodes, capturing dynamic attributes eagerly while retaining literal-origin distinction; do not change generic Svelte/Solid semantics.

Read-only source audit also identified likely whitespace loss (pre/textarea and root/line sibling separators), JSX punctuation in branch text, narrow map callback syntax/spread/namespaced attributes/type limits. Reports are untested except logical runtime repro; independently verify before fixes. Log astro-release-source-audit.log. Compiler patch astro-authored-module-scoped.patch refreshed with current local code; root concurrent Crepus edits still uncommitted/unpublished. SDK .18 release is unchanged by these subsequent compiler edits.

### Astro synchronous evaluation fix / df99ca1 regression

The logical sibling-order failure is now fixed in the LOCAL compiler: Astro emits direct calls to existing independent SSR factories from the existing core parsed AST, avoiding generic reactive JSX choice helpers. Dynamic intrinsic attr expressions are captured before child expressions while retaining their literal/dynamic codec distinction; component props are passed directly and no empty children argument overwrites an explicit children prop. Imported components, conditional side effects, map callbacks, zero/short-circuit/optional-map semantics and per-render isolation pass fresh Bun and minified Node consumers. Explicit authored imports of DOM SSR retain their original module instead of global retargeting. Default SDK/runtime/shared JSX compiler unchanged. Emitter shrank 736 to710lines compared with the pre-fix local version.

Moonshine df99ca1 adds runnable opt-in regression and documents reproduced limits; pushed. Run MOONSHINE_CREPUS_COMPILER=/tmp/moonshine-crepus-store-prototype/target/debug/crepus bun test packages/adapter-astro/test/standalone.test.ts. No env means the compiler case explicitly skips; ordinary runtime cases remain enabled. Regression passes four cases, including ordinary children prop identity and function-valued intrinsic attrs not accidentally invoking callbacks. All13adapter tests with compiler pass, clean full format/lint pass (existing unrelated lint warnings), package tsc pass. Local native integration47/CLI44/clippy and core505/native839/no-web pass; existing856source cases pass. Four compiled archive-consumer fixture graphs plus eight strict negative props cases pass both tsc/tsgo and fresh Bun/Node against physical SDK0.4.18 archives.

Scoped compiler patches refreshed (astro-authored-module-scoped.patch and astro-eager-order-scoped.patch). Proof astro-eager-order-proof.json. Compiler remains uncommitted/unpublished in the concurrent Crepus checkout; never stage broad files. No npm publication. Latest source release stays0.4.18.

NEXT verified core bugs: Whitespace.astro produces <pre>a\n b</pre><textarea>c</textarea><b>x</b><i>y</i>, losing authored indentation/trailing whitespace/root separator. BranchQuote.astro fails unclosed brace for {show && <p>Don't panic</p>}; BranchColon.astro fails expected closing p for {show ? <p>Note: done</p> : null}. Repros are source files under group-source-admission/astro-authored in cache. Fix source parsing in Crepus, preserve legacy template modes, do not introduce a Moonshine parser. Full coverage/saturation remains unproven.

### Astro authored whitespace / SDK 0.4.19 release

Released and verified GitHub v0.4.19 at f10630d (feature9caac2c). Exact CI39081460603 passed Linux/macOS/Dart; annotated tag8e7e2cfe849accb64143dafeea72a0e9de7d48fd peels to f10630d27a7f88a5e43806dfbe18923b9f37f705. Npm NOT published. SDK runtime hAttributes now retains literal HTML initial-newline behavior for textarea; native property factories keep their existing compensation. No new deps/default-kernel change; core4,041bytes.

LOCAL compiler core Astro parsing now threads preserve_whitespace through tags, expression lowering and map branches, activating only for authored pre/textarea and their descendants. Root inline spaces between sibling elements/expressions survive. Legacy template behavior and ordinary formatting-newline stripping are retained. Three parser tests added: core508/native839, nativeintegration47/CLI44/clippy pass;856source acceptance pass. Compiler remains unpublished/uncommitted and broad Crepus changes must never be staged.

Clean SDK:2,255pass +1explicit compiler skip, both25project strict lanes,format/lint/policy/catalog/size passed. Enabled Astro suite14pass against actualcompiler and physically copied packages.26tarballs checked; physical .19 archive consumer runs whitespace on fresh Bun/Node and eight prop-negative cases pass tsc+tsgo. Browser Chromium151.0.7922.34 matches literal HTML pre textContent,textarea value/defaultValue,blank lines and root separator; textarea fill/reset passed; screenshot opened/inspected; no pageerrors. Browser proof astro-whitespace-browser-proof.json, screenshot astro-whitespace-browser.png.

Reference package @astrojs/compiler4.0.0 (MIT) installed only in task cache astro-compiler-4-reference, no Astro runtime installed. Five transform outputs saved reference-whitespace.json prove literal/pre/expression/textarea/root-space template emission. Worker advice to add extra pre LF was not applied: browser HTML initial-newline behavior is intentional for Astro source; generic property-value factories retain their distinct behavior. Modern Astro formatting docs distinguish same-line spaces from dropped formatting-newline runs; no full version-independent whitespace parity claim.

Scoped patches refreshed: astro-whitespace-scoped.patch for current4core files, astro-authored-module-scoped.patch for whole authored-module increment (preceding span patch separate). Release proof release-0.4.19-proof.json. Handoff is LOCAL only, not sent to another chat.

NEXT: verified branch punctuation bugs remain: source/BranchQuote.astro apostrophe inside markup causes unclosed brace; source/BranchColon.astro text colon inside ternary causes wrong split. Repros under group-source-admission/astro-authored. Fix in core Astro using existing markup parsing/scanning where possible, preserve legacy source frontend behavior and don't add a Moonshine parser. Also RCDATA markup in textarea/title, optional broader source syntax, slots/async/hydration/full compiler ABI remain incomplete. Goal not saturated or complete.

### Astro branch punctuation / local scanner + d6d177f regression

Fixed both BranchQuote.astro and BranchColon.astro LOCAL compiler failures. New core parser/astro/scan.rs walks JS punctuation separately from complete nested markup, using the existing shared attribute/tag-header lexer (tags::read_opening extracted from the actual parser), VOID_TAGS and jsx_close. No full AST is constructed for span discovery; shared generic scanners for other frontends remain unchanged. It skips quoted JS and line/block comments, gates markup discovery after JS operands to retain comparison operators, bounds nesting and uses existing stacker growth. Apostrophes/colons/questions/operator-like text in HTML text, quoted attributes, nested branches and maps are covered. Explicit shortcut: regex literal punctuation and nested template substitutions still need a token-aware scanner before full JS expression coverage.

Core513/native839 tests pass; nativeintegration47 and CLI44 pass; clippy passes. A nesting test originally assumed128 nested logical tags but the existing frontend counts three levels per logical tag. The unchanged guard admits85 and rejects140; 256 flat sibling elements pass. Malformed markup rejects and subsequent parsing recovers. Both legacy template and authored parsing are exercised. Source856acceptance passes.

Actual rebuilt CLI compiles the two old failing probes. Punctuation.astro true/false cases retain text/attrs/map punctuation and one conditional side-effect count; fresh Bun and bundled Node outputs match. Strict tsc+tsgo actual graph checks including existing8negativeprops pass. Existing optional Moonshine regression now builds both source fixtures and runs both in isolated Bun/Node; all14adapter tests with compiler pass. Clean candidate format/lint passes (existing unrelated warnings). SDK/runtime/default kernel unchanged; release stays0.4.19.

Pushed Moonshine test/docs commit d6d177fd4149065c021b6b8395907d334fd8074a; CI39082125979 running at this entry. No npm publish. Compiler changes remain LOCAL/UNCOMMITTED/UNPUBLISHED in the concurrent Crepus checkout. Narrow patch astro-punctuation-scoped.patch and whole authored increment astro-authored-module-scoped.patch refreshed INCLUDING the new scan.rs. Proof astro-punctuation-proof.json. Handoff file local only, not sent to another chat.

NEXT: investigate regex literals and nested template substitutions in this source expression boundary, using the existing native OXC machinery where possible without moving parsing into Moonshine or introducing runtime deps. Existing map index/destructure/block bodies, RCDATA source tags, slots/async/hydration and full host ABI remain gaps. Goal remains active, no saturation/completion evidence.

### Nested Astro template substitutions / 0a171c0 + disk recovery

Fixed LOCAL core Astro scanner nesting for template ${...} substitutions by reusing bounded match_group and quoted_end. Actual NestedTemplate.astro previously failed on literal } inside an inner template; now child and attribute expressions render title/body ab}cvd on isolated Bun and minified Node. Quoted data-literal="{unclosed" remains literal. Malformed and overdeep templates reject without poisoning later scans.

Shared JSX attr parser now has an expression-only boundary entry, with quoted-interpolation policy separate from custom brace boundaries. Existing Svelte public functions retain their interpolation policy. Private boundary accepts a borrowed Fn so Astro captures the current depth rather than resetting/reentering an unbounded callback. Internal ExpressionBoundary type alias satisfies Clippy without suppressing warnings. No new deps/SDK runtime changes.

Final core516/native839 tests, nativeintegration47/CLI44, Clippy pass. Full source856acceptance passes after semantic attr changes. Enabled Astro14tests pass including nested child/attribute template and ordinary literal braces; package tsc and clean format/lint pass. Moonshine regression/docs commit0a171c0ebcb42aa22c4cba7c0b31ea62e42f4488 pushed; CI39083214027 running at this entry. Prior d6d177f CI passed. Latest SDK source release remains0.4.19; npm NOT published; compiler LOCAL/UNCOMMITTED/UNPUBLISHED.

Disk temporarily collapsed from~~1.9GiB to130MiB due external activity. Native test stage passed but CLI guard stopped (exit-2 hardstop disk; no live process). Archived6closed task test executables with gzip+SHA verification (137MiB net) in closed-template-build-archive/manifest.json. Found two unused task Vue prototype target dirs at /tmp/moonshine-vue-{source,props-source}-prototype/target,16GiB logical each. Both lsof checks closed; removed ONLY targets after hashing source/manifest/lock files. Observed physical free-space increase7.26GiB, source hashes verified and kept. Cleanup proof closed-vue-prototype-target-cleanup.json. Current shared target/CLI, project source, locks, global tool runtimes retained. Current free~~7.8GiB. Rebuilt/resumed CLI tests and Clippy successfully.

Regex failures reproduced in source/Regex.astro (a?b:c in regex and /}/). Read-only Sonnet review and an actual cache-only Rust probe tested Oxc0.128 public TokensParserConfig. Correct regexp/division tokens for valid TSX, but ANY fatal Astro void-tag parse returns an empty token stream, even for regex before the error. Raw <img>/<br> cannot be fed wholesale to Oxc; prefix token collection is not a robust contract. Private lexer benchmarking API is unsafe/not used. Probe source/log astro-oxc-token-probe.{rs,log}; no production dependency added.

NEXT regex/parser integration needs an authored grammar callback/core context, preserving HTML-only void markup, prior optional-map support and current logical precedence/evaluation order. Review astro-grammar-reuse-review.log proposes markup masking + AST shape ranges/memoization, but do NOT blindly adopt its wrong optional-map unsupported assumption or arbitrary64-try/1MiB caps. Actual inputs/native current emitter already support optional maps and source logical values. Need robust range mapping/grammar boundary tests rather than more incomplete JS heuristics. Child and attr boundaries must share the contract; literal quoted braces must stay literal.

Scoped patches: astro-nested-template-scoped.patch for current step; astro-authored-module-scoped.patch refreshed INCLUDING core/jsx/attrs.rs and new astro/scan.rs. Proof astro-nested-template-proof.json. Beforeimages astro-before-template-* retained. Local handoff not sent to another chat. Remaining regex/complete JS grammar, slots/async/hydration/full ABI and other source syntax gaps keep goal active.

### 2026-10-18 — local authored details open binding

SDK0.4.25 CI passed; npm publishing was not run. The current local Crepus compiler now lowers static HTML details `bind:open` through the existing independent Moonshine helper. Parser519/native847 library tests,10 new integration tests,17 CLI tests,Clippy and no-web check pass. Both strict checker lanes pass on a real3-file/6-module graph. Production Chromium matches the pinned Svelte5.57.1 reference through12 mounted/removal phases for shorthand, nullish state, members, writable stores, keyed rows, imported children and late handler replacement. Native detached-node events are separately suppressed by owner cleanup; Svelte retains those listeners. Fresh Bun/minifiedNode SSR match exact HTML after only reference comment and boolean-open syntax normalization. Full856-module existing source gate passes. The paired authored browser fixture is native58614raw/19508gzip vs Svelte60521/22677; no timing or universal size claim.

Two older source-module assertions still fail: rejecting supported date inputs and recognizing an older bare-option code shape. All four corresponding DOM/SSR graphs are byte-identical to the pre-change CLI, establishing these as unrelated baseline failures. Function-pair bindings, dynamic/wrong elements, conflicts, hydration and full component ABI remain unsupported. Compiler changes stay LOCAL/UNCOMMITTED/UNPUBLISHED alongside concurrent Crepus work. Scoped6-file patch and proof directory: `/Users/undivisible/.cache/moonshine-live-merged-integration/svelte-open-scoped.patch` and `svelte-open-source/`.

Parallel current-source audits also verified CLI rejection of Vue intrinsic text v-model (even with typed defineProps) and Astro component prop spreads. A props-less Vue script setup hits the separate required-defineProps gate first; investigate that simple component boundary before general form expansion. Raw audit logs and exact repro source live in `source-gap-repros/` under the same cache. The source investigation goal is active; full coverage is not established.

## Local props-less Vue setup checkpoint (2026-10-18)

Resolved the unnecessary typed defineProps gate with an empty props fallback after existing validation. Empty setup, constants, JS/TS counters and imported children compile independently. 2,302 SDK tests, 847 native library tests, 30 Vue integration tests and the 856-module source gate passed. Seven exact browser phases and repeated Bun/Node SSR match Vue 3.5.13 for the three-SFC fixture. Production gzip: native 9,307 bytes; Vue 21,057 bytes with Options API disabled. No speed claim. Compiler remains local/unpublished; attrs fallthrough, forms, Options API, VNode ABI and hydration remain incomplete. Scoped patch and evidence: /Users/undivisible/.cache/moonshine-live-merged-integration/vue-empty-props-proof.json.

## Local native Vue text-model checkpoint (2026-10-18)

Actual authored text/numeric inputs and textarea now lower through independent opt-in DOM and SSR factories. Plain models and lazy/trim/number modifiers preserve composition, focused trimming and numeric empty strings. Writable setup refs and reactive/ref member roots are admitted; readonly/unknown targets, dynamic types, value conflicts and unsupported controls reject. 13 source integration tests, 522 core tests, 847 native library tests, 2,309 SDK tests and 856 source gate modules passed. Actual SFC browser records match Vue3.5.13 in 15 phases; repeated fresh Bun/minified Node SSR is exactly equal. Fixture production gzip is native9,006/Vue21,526 bytes; no speed claim. Compiler remains local/unpublished. Evidence: /Users/undivisible/.cache/moonshine-live-merged-integration/vue-model-proof.json.

## Local Astro component-spread checkpoint (2026-10-18)

Crepus reuses the authored attribute lexer to preserve ordered component spreads without changing legacy/shared frontend admission. Native emission retains JavaScript override/getter order and nullish spreads. Moonshine snapshots now preserve own enumerable symbols and normalize final class:list values before deferred component initialization. Imported Astro.props forwarding and projected slots remain separate from ordinary children/slots props. Exact repeated Bun/minified Node SSR matches Astro7.4.0 with compiler-rs0.5.2, including getter/class-list timing, special keys, escaping and request isolation. The reference harness must supply the production resolvePath hook; omitting it caused the earlier createMetadata import diagnostic. Both source typecheck/declaration/consumer lanes, 523 core tests, 847 native tests, 35 Astro integrations and the 856-module source gate pass. Full SDK rerun passes 2,311 tests after one unchanged five-second CLI subprocess timeout passed in isolation. No performance claim or npm publication. Intrinsic/outlet spreads and async/hydration remain unsupported; compiler local/unpublished. Evidence: /Users/undivisible/.cache/moonshine-live-merged-integration/astro-spread-proof.json.

## 2026-10-18: SDK 0.4.28 native Set and unwrap checkpoint

SDK commits eee1f57 and f620c5f, release 1879ccc. Native Vue Set tracking and DOM/Solid unwrap verified; 2,334 isolated SDK tests, standard feature CI 39100566175, both type lanes, 856-module source gate and all 26 packed manifests/host-free consumer pass. Ten Vue API and ten authored SFC browser phases compare with Vue 3.5.13. Existing counter cost +730 gzip bytes; kernel 4,041 raw bytes. Compiler Set-prop work remains local/unpublished; scoped patch and proof in /Users/undivisible/.cache/moonshine-live-merged-integration/vue-set-{scoped.patch,proof.json}. Checkbox/radio models remain next; npm publication was not run.

## 2026-10-18: native Vue checked models

Feature1172f20 pushed; release0.4.29 prepared in7005077. Eleven direct Chromium records and13 authored SFC phases match Vue3.5.13;20 root/nested SSR calibration cases and repeated fresh Bun/minified Node SSR match every structural/attribute/text record, ignoring only attribute order and checked spelling. Full SDK16,371 test executions/84,609expects/1461files pass with file isolation; both25project type lanes,856sourcegate(before finalfragmentfix),847native tests andClippy pass. Finalfragment/root compiler tests29pass; rebuilt CLI browser/SSR/standalone3tests pass; finalsourcegate61668 andfeatureCI39102185911 pending beforetag. All26packs+host-free isolatedBunNodeconsumer pass. Existingcounter bundle unchanged; kernel4041raw; form9957gzip versusreference21855. Compilerlocal/unpublished patch: /Users/undivisible/.cache/moonshine-live-merged-integration/vue-checked-scoped.patch. npmnotrun; select/componentmodels,checkedmodifiers,dynamictypes,hydrationremainunsupported.

0.4.29 release completion: GitHub https://github.com/tschk/moonshine/releases/tag/v0.4.29 verified public/non-draft; featureCI39102185911 and releaseCI39102249586 success. Final rebuilt compiler sourcegate856 passed. npm not run. Next useful gap: Vue select source models;8realChromium referencecases and Sonnet read-only audit saved under /Users/undivisible/.cache/moonshine-live-merged-integration/vue-select-{reference,next-contract.json,next-audit.md}. No select implementation yet.

## 2026-10-18: native Vue select checkpoint

SDKfeature125f70d and releaseprepb80eab9 pushed. Full SDK16,395passingexecutions/84,739expects/1463files pass; both25project type lanes,856sourcegate(before finalchildguard),847native library+Clippy pass. Final guard compiler/browser/SSR/standalone3tests pass; final856sourcegate70419 andCI39103487720/39103532801 pending beforetag0.4.30. All26packs/extractedhostfreeBunNodeconsumer pass. Eight directChromiumcases,11sourceSSRcases,13SFCbrowserphases, freshrepeatedBun/NodeSSR anddeclarationconsumerspass. Sourcehelperscaptureparentgroupsforcomponentupdate parity. Counterbundleunchanged; kernel4041raw; selectfixture11722gzipversusVue21900,no timingclaim. Compilerlocal/unpublished patch /Users/undivisible/.cache/moonshine-live-merged-integration/vue-select-scoped.patch. Inlineoptions/optgroups only; component-suppliedoptions/othermodifiers/componentmodels/hydrationunsupported. npmnotrun. Nextcomponentmodelaudit OMPsession25880.

SDK0.4.30 completion: https://github.com/tschk/moonshine/releases/tag/v0.4.30 verified public/non-draft; tag atb80eab9. FeatureCI39103487720/releaseCI39103532801 andfinal856sourcegate pass. npmnotrun; compilerlocal/unpublished. Overallframeworkgoal remainsactive. Nextcomponentmodel read-onlyaudit OMPsession25880 at /Users/undivisible/.cache/moonshine-live-merged-integration/vue-component-model-next-audit.md.

## 2026-10-18: SDK0.4.31 component model verification release

Tests/docs69c99e5 and release d933120 pushed; https://github.com/tschk/moonshine/releases/tag/v0.4.31 verified public/non-draft. No SDK runtime code/dependencies added. FeatureCI39105242713/releaseCI39105309162 success. Local fullSDK16395pass/1unchangedkerneldeadline; focusedkernel1466msunder5sdeadlinepass. Finalsourcegate856,core529,native848,focusedcompiler38,Clippy,fulltypes/declarations/packed26consumerpass.13SFCbrowserphases andactiveSSRsetupemitshonorbothorders+once. Compilerlocal/unpublished patches vue-component-model-scoped.patch + vue-component-order-scoped.patch; staleSDKsourcegatenegative one-linepatch vue-component-model-source-gate.patch (do notstagewholeuntrackedscript). npmnotrun. Nextnamed/multiple models:11Chromiumreferencephases inclkebabfirst-name +Sonnetaudit at /Users/undivisible/.cache/moonshine-live-merged-integration/vue-named-model-*. Workerrecommendationrejecthyphensisnotaccepted; testedconcretecasebelongsnextscope.

## 2026-10-19: SDK 0.4.41 completion and native Svelte spread bind:group checkpoint

Tag `v0.4.41` and GitHub release https://github.com/tschk/moonshine/releases/tag/v0.4.41 published on `4fd4ea34e5999d1b66a6be8da7b8b19cdc300780` after release CI `39132977957` passed (`js (macos-latest)`, `js (ubuntu-latest)`, `dart`). npm publication remains manual.

Spread `bind:group` on static `type="checkbox"` and `type="radio"` `<input>` elements is now implemented across Moonshine DOM/Svelte and local Crepuscularity source lowering:

- Direct `setInputValue(input, value, notify = true)` and unbound `installElementSpread` retain eager group-member reconciliation (`notify = true`).
- Bound spread elements (`installBoundElementSpread`) pass `notify = false` so spread-only `value` mutations update `inputValues` and `input.value` without invalidating the group member effect until the group model updates, an authored dynamic `value={expr}` watched via `createInputGroup.bind(input, watch)` changes, the user interacts with a group member, or a connected `<form>` fires `reset`.
- Authored static `value` / `checked` attributes on spread `<input>` elements no longer inject trailing synthetic `defaultValue` / `defaultChecked` layers that would clobber later spread values.
- Spread group members keep `onchange` / `onchangecapture` inside the ordered spread layer dictionary rather than extracting `onChange` into `__installGroupMember`, preserving layer override semantics and capture -> group write -> bubble event order.
- SSR replaces the `bind:group` marker in-place at its authored position with a synthetic `checked` spread layer when an authored `value` attribute is present, and omits derived `checked` (without reading the group model) when `value` is only provided by `{...spread}`.
- Dynamic or spread-only `type` on `bind:group` inputs remains an explicit compile error; native checkbox change collection uses current DOM (`compareDocumentPosition`) order.
- Evidence: 10 Chromium differential phases, 3 multi-input SSR comparisons, and strict `tsc`/`tsgo` checks on generated DOM/SSR modules match Svelte 5.57.1 (`/Users/undivisible/.cache/moonshine-live-merged-integration/svelte-form-contract/group-spread-browser.json`, `group-update-contract-audit.md`, `crepus-group-spread.patch`).

## 2026-10-19: SDK 0.4.43 native Vue defineExpose, template refs and createApp().mount() checkpoint

Native Vue `defineExpose`, static intrinsic/component template refs (`ref="x"` and `:ref="'x'"` targeting a top-level `const` `ref` or `shallowRef` setup binding), and `createApp(component, props).mount(target)` returning the root component's exposed instance (`ComponentExports<typeof component>`) are now implemented across Moonshine (`@tschk/moonshine-vue/expose`, `@tschk/moonshine-vue/app`, `@tschk/moonshine-vue/reactive`) and local Crepuscularity source lowering:

- `@tschk/moonshine-vue/expose` provides `exposeRefs(exposed)` and `ShallowUnwrap<T>`, shallowly unwrapping top-level native refs on property reads and forwarding writes to writable `.value` while preserving getters, descriptors, and prototype semantics. Components that omit `defineExpose` or call `defineExpose()` expose a null-prototype empty object (`exposeRefs({})`) in DOM so component template refs and `createApp().mount()` never leak internal setup bindings.
- `Unwrap<T>` in `@tschk/moonshine-vue/reactive` preserves `Node | Window` as leaf values so `ref<HTMLInputElement | null>(null)` and `ref<ComponentExports<typeof Child> | null>(null)` retain exact DOM and component-export types.
- Local Crepuscularity lowers `defineExpose` and static template refs on intrinsic elements (`bindRef` via `property_keys` marker `"\"ref\""`) and imported PascalCase components (`componentRef` with `cleanup: "commit"`), publishing refs before `onMounted` hooks run and clearing them to `null` on unmount. SSR erases runtime `defineExpose` and template `ref` attributes while preserving `ComponentView<Node, Exports, Props>` return-brand typing.
- Dynamic ref expressions, function refs, `useTemplateRef`, `v-for` ref arrays, and template refs on `v-model` form controls reject with explicit compiler diagnostics.
- Evidence: 15 Crepuscularity Vue test suites, Clippy (`-D warnings`), `packages/adapter-vue` unit/standalone tests, and the full 876-module `scripts/check-native-sfc.ts` acceptance gate (including Chromium multi-instance `vue-expose-reference` verification, SSR forbidden-helper verification, and strict `tsc`/`tsgo` caller checks) pass. Scoped compiler patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/vue-expose-crepus.patch`.

## 2026-10-19: Native SSR allocation and form-spread optimization checkpoint

Measured SSR optimizations across `@tschk/moonshine-dom/ssr`, `@tschk/moonshine-dom/component`, `@tschk/moonshine-svelte/ssr`, and local Crepuscularity SSR emission:

- `@tschk/moonshine-dom/ssr`: direct `validateBindingBox` validation on `hSelectionEntries` without temporary `{ [key]: selection }` symbol wrapper objects; string accumulation for `staticMode` (`explicitAttributes` and `sourceCodec`) attributes and pre-materialized void/text-only static elements (`<input>`, `<textarea>`, `<title>`); low-allocation loops in `resolve`, `text`, and `content`; skipped redundant `runWithOwner` closures when `targetOwner === activeOwner` and skipped `bodyText` whitespace regex normalization on typed `<option>` elements.
- `@tschk/moonshine-dom/component`: `withComponentConsumer` skips redundant `new Map(context)` cloning when the target `ComponentContext` is already the active context on the current owner.
- `@tschk/moonshine-svelte/ssr`: `spreadServerElement` filters `value` and `defaultValue` directly inside `entriesFromMerged(merged, "select")` without cloning `merged`, and fast-paths lowercase `Object.hasOwn(merged, name)` checks on `<input>` defaults.
- Local Crepuscularity SSR emission (`svelte_spreads.rs`, `svelte_bindings.rs`, `moonshine_module.rs`): unwraps zero-arg sync arrow expressions on SSR spread layers instead of emitting IIFEs, skips trailing `Object.assign(Object.create(null), ...)` when no attribute layer follows, returns `read` directly from `__crepusSourceChild` when no component consumer is active, and passes `(box, children)` directly to `__CrepusSourceOption` (`hSelectionEntries`) for single-attribute `<option value={...}>` elements without `Object.create` descriptor maps or static child arrow wrappers.
- Evidence (`scripts/benchmark-svelte-form-ssr.ts` against Svelte 5.57.1): minified Moonshine SSR bundle is `14,632` raw / `5,484` gzip bytes vs Svelte's `26,811` raw / `10,087` gzip bytes (`45.4%` smaller raw, `45.6%` smaller gzip), and 5,000-iteration repeated form SSR median dropped from `189.24ms` (`~5.1x` slower than Svelte) to `33.96ms` at low load (`~1.74x` vs Svelte's `19.47ms`). Full 876-module `check-native-sfc.ts` gate, SDK test suite, `typecheck`, `typecheck:native`, and `lint` pass. Scoped compiler patch and benchmark output: `/Users/undivisible/.cache/moonshine-live-merged-integration/ssr-perf-{crepus.patch,benchmark.json}`.

## 2026-10-19: SDK 0.4.44 native Svelte `toStore` and `fromStore` checkpoint

Native Svelte 5 `toStore` and `fromStore` are now implemented in `@tschk/moonshine-svelte/store` and admitted in local Crepuscularity `svelte/store` imports and re-exports:

- `toStore(get, set?)` eagerly evaluates `get()` on creation, exposes `{ set, update, subscribe }` when `set` is provided or `{ subscribe }` when omitted, captures the enclosing Rune scheduler scope at `toStore(...)` call time, and runs an independent root render effect that preserves Svelte 5.57.1 post-order `push_effect` scheduling across `$effect.pre`, template `createRenderEffect`, and `$effect` while surviving enclosing component disposal while external store subscribers remain active. On SSR, `toStore` wraps `writable(initValue)` without starting reactive effects.
- `fromStore(store)` preserves readable (`{ readonly current: V }`) versus writable (`{ current: V }`) contracts via `'set' in store`, performs one-shot `get(store)` reads outside tracking or on SSR, shares one active store subscription across tracked readers and chained `$derived` computations, records teardown history so cleanup reads re-evaluate against live store state matching Svelte 5.57.1, and releases the store subscription in a microtask when value demand drops to zero while bumping its version signal so reconnecting deriveds recompute.
- Local Crepuscularity (`crates/crepuscularity-native/src/svelte_module.rs`) admits `toStore` and `fromStore` in `svelte/store` named imports and re-exports for DOM and SSR targets.
- Evidence: differential unit tests against Svelte 5.57.1 (`packages/adapter-svelte/test/store-interop.test.ts`), Crepuscularity `store_import_tests` and Clippy (`-D warnings`), and the full 876-module `scripts/check-native-sfc.ts` acceptance gate (exercising `toStore`, `fromStore`, `readonly`, `$store` auto-subscription, and `$derived` in Chromium DOM, Bun SSR, and strict `tsc`/`tsgo`). Scoped compiler patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/store-interop-crepus.patch`.

## 2026-10-19: SDK 0.4.45 native Vue `useTemplateRef` and form-model template refs checkpoint

Native Vue 3.5 `useTemplateRef` and template `ref` bindings on `v-model` form controls (`<input>`, `<textarea>`, `<select>`, and `<option>` inside `v-model` `<select>`) are now implemented across `@tschk/moonshine-vue` and local Crepuscularity source lowering:

- `@tschk/moonshine-vue/reactive` (and re-exported from `@tschk/moonshine-vue/expose`) provides `useTemplateRef<T, K extends string>(key: K): TemplateRef<T>` (`Readonly<Ref<T | null>>`). It validates active component initialization and per-component key uniqueness, returning a readonly native ref initialized to `null` (`r.value = ...` throws `TypeError: Native ref is readonly`) backed by a signal in DOM or `() => null` in SSR, with an internal binding channel for `bindRef` and `bindComponentRef`.
- `@tschk/moonshine-vue/expose` exports `bindComponentRef(binding)` and `TemplateRefBinding<T>`, and extends `bindRef(element, binding)` so both accept `{ get, set }` objects, writable `Ref`s, or readonly `useTemplateRef` instances.
- `@tschk/moonshine-vue/model` (`createTextModel`, `createCheckedModel`) and `@tschk/moonshine-vue/select` (`createSelectModel`, `createModelOption`) exclude `"ref"` from attribute getter forwarding and invoke `props.ref(element)` after binding the model (and after initial `apply()` on `<select>` so `selectRef.value.value` reflects initial selection in `onMounted`).
- Local Crepuscularity (`crates/crepuscularity-native/src/vue_module.rs`) admits `useTemplateRef` (and type-only `Ref`/`TemplateRef`) in `'vue'` named imports, resolves top-level `const x = useTemplateRef("key")` bindings (including hyphenated keys) alongside `ref`/`shallowRef`, rejects duplicate template ref keys across `ref`/`shallowRef`/`useTemplateRef`, and lowers `ref` / `:ref="'key'"` on `v-model` `<input>`, `<textarea>`, `<select>`, and `<option>` elements.
- Evidence: 24 Crepuscularity Vue model/expose/template-ref compiler tests, Clippy (`-D warnings`), `packages/adapter-vue/test/template-ref.test.ts`, and the full 876-module `scripts/check-native-sfc.ts` acceptance gate (exercising `useTemplateRef("root-input")` on `<input ref="root-input" v-model="rootText">` and `useTemplateRef("second-child")` on `<Child :ref="'second-child'">` in Chromium DOM, Bun SSR, and strict `tsc`/`tsgo`). Scoped compiler patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/vue-template-ref-crepus.patch`.

## 2026-10-19: SDK 0.4.46 native Vue reactivity, raw/readonly/shallow proxies, customRef/triggerRef/toValue, and `effectScope` checkpoint

Native Vue 3.5 reactivity inspection, shallow/readonly/raw proxy helpers, ref utilities (`toValue`, `triggerRef`, `customRef`), and `effectScope` ownership primitives are now implemented in `@tschk/moonshine-vue/reactive` and admitted in local Crepuscularity `'vue'` source lowering:

- `@tschk/moonshine-vue/reactive` adds `toValue` (`MaybeRef`, `MaybeRefOrGetter`), `triggerRef`, `customRef` (`CustomRefFactory`), `markRaw`, `toRaw`, `isReadonly`, `isShallow`, `isProxy`, `shallowReactive`, `readonly` (`DeepReadonly`), `shallowReadonly`, `effectScope` (`EffectScope`), `getCurrentScope`, and `onScopeDispose`.
- `triggerRef` and `customRef` `trigger()` increment a per-ref trigger epoch so synchronous `watch(refSource, cb, { flush: "sync" })`, `watchSyncEffect`, and `computed` re-evaluate even when an underlying object reference is mutated in place.
- `shallowReactive` tracks root-level properties, array indices/length/mutation methods, `in`, `Object.keys`, `delete`, and `Set` membership without deep wrapping or ref unwrapping. `readonly` and `shallowReadonly` enforce immutability on plain objects, arrays, `Set`s, reactive proxies, and refs while forwarding reactive tracking from wrapped reactive targets. `markRaw` prevents wrapping at root and nested object/array/`Set` positions, and `toRaw` unwraps native proxies in O(1).
- `effectScope(detached?)`, `getCurrentScope()`, and `onScopeDispose(fn, failSilently?)` manage grouped reactive ownership (`watch`, `watchSyncEffect`, `computed`, nested non-detached `effectScope`s, and disposal callbacks) and bind automatically to the active component scope during native `<script setup>` initialization.
- Local Crepuscularity (`crates/crepuscularity-native/src/vue_module.rs`) admits all new reactivity and scope helpers (plus `hasInjectionContext`, `InjectionKey`, `isRef`, `isReactive`, and `watchSyncEffect`) in `'vue'` imports, and recognizes `customRef` and `shallowReactive` in `defineExpose` and `v-model` target analysis.
- Evidence: `packages/adapter-vue/test/reactivity-extended.test.ts`, `packages/adapter-vue/test/reactivity-extended.types.ts`, Crepuscularity `vue_template_refs` (`vue_extended_reactivity_and_scope_helpers_compile_across_targets`), Clippy (`-D warnings`), and the full 876-module `scripts/check-native-sfc.ts` acceptance gate. Scoped compiler patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/vue-reactivity-ext-crepus.patch`.

## 2026-10-19: SDK 0.4.47 native Vue `watch` reactive sources, `deep`/`once` options, `onWatcherCleanup`, and `WatchHandle` checkpoint

Native Vue 3.5 synchronous watcher capabilities in `@tschk/moonshine-vue/reactive` and local Crepuscularity `'vue'` source lowering now cover:

- `watch` accepts reactive objects (`reactive`, `shallowReactive`, `readonly(reactive(...))`) directly or in source tuples alongside refs and getters, defaulting to deep traversal for `reactive` proxies and depth `1` for `shallowReactive` proxies or `{ deep: false }`.
- `watch` supports `deep` (`boolean` or finite depth `number`, cycle-safe and skipping `markRaw` subtrees while tracking per-source dependency versions so mixed tuples do not falsely fire on unchanged sibling getters) and `once: true` (stopping automatically after the first callback in both lazy and `immediate: true` modes, including when a callback throws).
- `onWatcherCleanup(cleanupFn, failSilently?)` registers cleanup callbacks on the currently executing `watch` callback or `watchSyncEffect` effect with lexical nesting and `withComponentErrorHandler` `"watch cleanup"` phase routing, throwing outside an active watcher execution unless `failSilently` is `true`.
- `watch` and `watchSyncEffect` return a `WatchHandle` (`WatchStopHandle` function with `.stop()`, `.pause()`, and `.resume()`), preserving dependency tracking while paused and flushing synchronously on `resume()` if any tracked dependency changed while paused.
- Local Crepuscularity (`crates/crepuscularity-native/src/vue_module.rs`) admits `onWatcherCleanup` and type-only `WatchCallback`, `WatchStopHandle`, and `WatchHandle` in `'vue'` imports.
- Evidence: `packages/adapter-vue/test/watch-extended.test.ts`, `packages/adapter-vue/test/watch-extended.types.ts`, Crepuscularity `vue_template_refs`, Clippy (`-D warnings`), and the full 876-module `scripts/check-native-sfc.ts` acceptance gate. Scoped compiler patch: `/Users/undivisible/.cache/moonshine-live-merged-integration/vue-watch-ext-crepus.patch`.

## 2026-10-20: SDK 0.4.55 native Astro runtime (`actions`, `context`, `transitions`) and Solid `modifyMutable` / `createDeferred` / `useTransition` checkpoint

- `@tschk/moonshine-astro` adds host-free `/actions` (`defineAction`, `ActionError`, `ActionInputError`, `isActionError`, `isInputError`, `ACTION_ERROR_CODES`, `getActionQueryString`, `actionPathToString`), `/context` (`AstroCookies`, `AstroCookie`, `createAstroGlobal`, `withAstroContext`, `useAstro`), and `/transitions` (`fade`, `slide`, `none`, `createAnimationScope`, `transition`, `supportsViewTransitions`, `isTransitionEnabled`, `swapFunctions`, `navigate`).
- `@tschk/moonshine-solid/solid` and `@tschk/moonshine-solid/ssr` add `createDeferred`, `startTransition`, and `useTransition` (admitted in local Crepuscularity `solid-js` modules with `@jsxImportSource solid-js` provenance), and `@tschk/moonshine-solid/store` (`@tschk/moonshine-dom/store`) adds `modifyMutable(state, modifier)`.

## 2026-10-20: SDK 0.4.56 native Nuxt 3/4 fetch/cookie/request/config/error composables and Angular 17.3–19 signal inputs/models/outputs checkpoint

- `@tschk/moonshine-nuxt` and `@tschk/moonshine-nuxt/composables` add host-free `useFetch`, `useLazyFetch`, `useCookie`, `refreshCookie`, `withNuxtRequest`, `createNuxtRequestEvent`, `useRequestEvent`, `useRequestHeaders`, `useRequestURL`, `useRuntimeConfig`, `useAppConfig`, `updateAppConfig`, `NuxtError`, `createError`, `showError`, `clearError`, `useError`, `isNuxtError`, and `callOnce`.
- `@tschk/moonshine-angular` and `@tschk/moonshine-angular/signals` add host-free Angular 17.3–19 `input`, `input.required`, `applyInputValue`, `model`, `model.required`, `output`, `outputFromObservable`, `outputToObservable`, `OutputEmitterRef`, `DestroyRef`, `createDestroyRef`, `injectDestroyRef`, `takeUntilDestroyed`, `afterNextRender`, and `afterRender`.

## 2026-10-20: SDK 0.4.57 native Nuxt 3/4 routing/navigation/head/SEO composables and Astro Content Collections & schema runtime checkpoint

- `@tschk/moonshine-nuxt` and `@tschk/moonshine-nuxt/composables` add host-free `useRoute`, `useRouter`, `navigateTo`, `abortNavigation`, `onBeforeRouteLeave`, `onBeforeRouteUpdate`, `setResponseStatus`, `setPageLayout`, `useHead`, `useHeadSafe`, `resolveHeadTags`, `useSeoMeta`, `useServerSeoMeta`, `preloadComponents`, `prefetchComponents`, and `preloadRouteComponents`.
- `@tschk/moonshine-astro/content` and `@tschk/moonshine-astro` add host-free `defineCollection`, `getCollection`, `getEntry`, `getEntries`, `getLiveCollection`, `getLiveEntry`, `reference`, `registerCollections`, `seedCollection`, `clearCollections`, `render`, `extractMarkdownHeadings`, and a zero-dependency Zod-compatible `z` schema builder (`ZodType`, `ZodString`, `ZodNumber`, `ZodBoolean`, `ZodDate`, `ZodArray`, `ZodObject`, `ZodError`, `z.coerce`, and `z.infer<T>`, also re-exported from `@tschk/moonshine-astro/actions`).
