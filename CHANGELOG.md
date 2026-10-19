# Moonshine 0.4.57

- Add native host-free Nuxt 3/4 routing, navigation, response status, layout,
  head/SEO, and component preload composables (`useRoute`, `useRouter`,
  `navigateTo`, `abortNavigation`, `onBeforeRouteLeave`, `onBeforeRouteUpdate`,
  `setResponseStatus`, `setPageLayout`, `useHead`, `useHeadSafe`,
  `resolveHeadTags`, `useSeoMeta`, `useServerSeoMeta`, `preloadComponents`,
  `prefetchComponents`, and `preloadRouteComponents`) in
  `@tschk/moonshine-nuxt/composables` and `@tschk/moonshine-nuxt`.
- Add native host-free Astro Content Collections, Live Content Layer, and
  zero-dependency Zod-compatible `z` schema builder (`defineCollection`,
  `getCollection`, `getEntry`, `getEntries`, `getLiveCollection`,
  `getLiveEntry`, `reference`, `registerCollections`, `seedCollection`,
  `clearCollections`, `render`, `extractMarkdownHeadings`, `z`, `ZodType`,
  `ZodString`, `ZodNumber`, `ZodBoolean`, `ZodDate`, `ZodArray`, `ZodObject`,
  and `ZodError`) in `@tschk/moonshine-astro/content`, `@tschk/moonshine-astro`,
  and `@tschk/moonshine-astro/actions`.

# Moonshine 0.4.56

- Add native host-free Nuxt 3/4 fetch, cookie, request context, runtime/app
  config, error, and one-shot composables (`useFetch`, `useLazyFetch`,
  `useCookie`, `refreshCookie`, `withNuxtRequest`, `createNuxtRequestEvent`,
  `useRequestEvent`, `useRequestHeaders`, `useRequestURL`, `useRuntimeConfig`,
  `useAppConfig`, `updateAppConfig`, `NuxtError`, `createError`, `showError`,
  `clearError`, `useError`, `isNuxtError`, and `callOnce`) in
  `@tschk/moonshine-nuxt/composables` and `@tschk/moonshine-nuxt`.
- Add native host-free Angular 17.3–19 signal inputs, two-way model signals,
  outputs, RxJS interop, and render/destroy lifecycle helpers (`input`,
  `input.required`, `applyInputValue`, `model`, `model.required`, `output`,
  `outputFromObservable`, `outputToObservable`, `OutputEmitterRef`,
  `DestroyRef`, `createDestroyRef`, `injectDestroyRef`, `takeUntilDestroyed`,
  `afterNextRender`, and `afterRender`) in `@tschk/moonshine-angular/signals`
  and `@tschk/moonshine-angular`.

# Moonshine 0.4.55

- Add native host-free Astro Actions (`defineAction`, `ActionError`,
  `ActionInputError`, `isActionError`, `isInputError`, `ACTION_ERROR_CODES`,
  `getActionQueryString`, and `actionPathToString` in
  `@tschk/moonshine-astro/actions`), request context and RFC 6265 cookies
  (`AstroCookies`, `AstroCookie`, `createAstroGlobal`, `withAstroContext`, and
  `useAstro` in `@tschk/moonshine-astro/context`), and View Transitions (`fade`,
  `slide`, `none`, `createAnimationScope`, `transition`,
  `supportsViewTransitions`, `isTransitionEnabled`, `swapFunctions`, and
  `navigate` in `@tschk/moonshine-astro/transitions`), also re-exported from
  `@tschk/moonshine-astro`.
- Add native Solid `createDeferred`, `startTransition`, and `useTransition`
  (`DeferredOptions`, `Transition`, plus `mapArray` and `indexArray` re-exports)
  in `@tschk/moonshine-solid/solid` and `@tschk/moonshine-solid/ssr`, paired with
  local unpublished Crepuscularity `solid-js` import and re-export routing under
  `/** @jsxImportSource solid-js */`.
- Add `modifyMutable(state, modifier)` (and export `SetStoreFunction`) in
  `@tschk/moonshine-dom/store` and `@tschk/moonshine-solid/store` to batch
  `produce` and `reconcile` updates on `createMutable` stores.

# Moonshine 0.4.54

- Add native Svelte 5 `getAbortSignal()` in `@tschk/moonshine-svelte/svelte` and
  `@tschk/moonshine-svelte/ssr`, `ReactiveValue<T>` in
  `@tschk/moonshine-svelte/reactivity`, and reactive browser metrics
  (`innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, `screenLeft`,
  `screenTop`, `scrollX`, `scrollY`, `online`, and `devicePixelRatio`) in
  `@tschk/moonshine-svelte/reactivity/window`, paired with local unpublished
  Crepuscularity `'svelte'`, `'svelte/reactivity'`, and
  `'svelte/reactivity/window'` import and re-export routing.
- `getAbortSignal()` returns an `AbortSignal` that aborts when the enclosing
  `$effect`, `$effect.pre`, `onMount`, `{@attach}`, or `$derived` reaction
  re-runs or is disposed, and throws outside active reactions;
  `svelte/reactivity/window` values track browser resize, scroll, online/offline,
  `matchMedia` resolution, and `requestAnimationFrame` updates via
  `ReactiveValue<T>` and evaluate to `undefined` on SSR.
- Add native host-free Angular 19 `resource(options)` (`ResourceRef`,
  `WritableResource`, `Resource`, `ResourceStatus`, `ResourceOptions`,
  `ResourceLoader`, and `ResourceLoaderParams`) and RxJS-compatible
  `toObservable(source)` / `toSignal(source, options?)` (`Subscribable`,
  `InteropObservable`, `Observer`, `Unsubscribable`, and `ToSignalOptions`) in
  `@tschk/moonshine-angular/signals` and `@tschk/moonshine-angular`.

# Moonshine 0.4.53

- Add native Svelte 5 `svelte/reactivity` classes and helpers (`createSubscriber`,
  `MediaQuery`, `SvelteDate`, `SvelteSet`, `SvelteMap`, `SvelteURL`, and
  `SvelteURLSearchParams`) in `@tschk/moonshine-svelte/reactivity`, paired with
  local unpublished Crepuscularity `'svelte/reactivity'` import and re-export
  routing.
- `createSubscriber(start)` activates only during tracked non-SSR reads, shares a
  single subscription across concurrent reactive consumers, and tears down on a
  microtask when value demand drops to zero; `SvelteMap` separates structural
  key-set tracking (`size`, `keys()`) from per-key and value-level updates
  (`get(k)`, `values()`, `entries()`), while `SvelteURL` and
  `SvelteURLSearchParams` synchronize mutations bidirectionally.
- Add native host-free Nuxt 3/4 state, async data, and macro composables
  (`useState`, `clearNuxtState`, `useAsyncData`, `useLazyAsyncData`,
  `useNuxtData`, `refreshNuxtData`, `clearNuxtData`, `definePageMeta`,
  `defineNuxtPlugin`, `defineNuxtRouteMiddleware`, and `isNuxtRef`) in
  `@tschk/moonshine-nuxt/composables` and `@tschk/moonshine-nuxt`, scoped by root
  `Owner` or SSR render pass so concurrent SSR requests and independent trees
  never leak state.

# Moonshine 0.4.52

- Add native host-free Angular 17–19 signal primitives (`signal`, `computed`,
  `linkedSignal`, `effect`, `untracked`, `isSignal`, and `isWritableSignal`,
  plus `Signal`, `WritableSignal`, `ValueEqualityFn`, `CreateSignalOptions`,
  `CreateComputedOptions`, `LinkedSignalOptions`, `EffectRef`,
  `EffectCleanupFn`, `EffectCleanupRegisterFn`, and `CreateEffectOptions` types)
  in `@tschk/moonshine-angular/signals` and re-export them from
  `@tschk/moonshine-angular`.
- `signal()` and `computed()` use `Object.is` equality by default with optional
  custom `equal` comparators, cached `.asReadonly()` views, lazy pull-based
  memoization, and reactive write protection inside `computed()` and
  `linkedSignal()` computations.
- `linkedSignal()` supports both the shorthand `linkedSignal(computation, options?)`
  overload and `linkedSignal({ source, computation, equal? })` with
  `previous?: { source, value }` tracking (preserving manual `.set()` and
  `.update()` overrides until upstream dependencies change), while `effect()`
  supports `onCleanup` registration, owner-scoped or `manualCleanup` lifetime,
  SSR suppression, and `allowSignalWrites` control.

# Moonshine 0.4.51

- Add Svelte 5 `$props.id()` runtime helper (`propsId()` in
  `@tschk/moonshine-svelte/runes` and `@tschk/moonshine-svelte/ssr`) and
  `settled()`, `flushSync(fn?)`, and `untrack(fn)` in
  `@tschk/moonshine-svelte/svelte` and `@tschk/moonshine-svelte/ssr`, plus local
  unpublished Crepuscularity `$props.id()` rune lowering and `'svelte'`
  `settled` import routing.
- `propsId()` generates deterministic tree-scoped IDs (`s-0`, `s-1`, ...) keyed
  by the root `Owner` via `WeakMap<Owner, { next: number }>` so DOM and SSR
  component trees produce identical IDs without leaking state across requests or
  mounted instances, and rejects calls outside active component/root
  initialization or inside cleanup computations.
- `flushSync(fn?)` executes an optional callback and synchronously drains all
  pending native rune work (`drainTickWork()`), while `settled()` awaits queued
  rune flushes in a loop until chained rune effects settle (`hasPendingTickWork()`
  is false).

# Moonshine 0.4.50

- Add native Solid secondary reactive primitives (`createUniqueId`,
  `createSelector`, `createReaction`, `createRenderEffect`, `observable`, and
  `from`, plus `EqualityCheckerFunction`, `Observable`, and `ObservableObserver`
  types) in `@tschk/moonshine-solid/solid` and `@tschk/moonshine-solid/ssr`,
  together with local unpublished Crepuscularity `solid-js` import routing under
  explicit `/** @jsxImportSource solid-js */` provenance.
- `createUniqueId()` generates deterministic tree-scoped IDs (`cl-0`, `cl-1`,
  ...) keyed by the root `Owner` via `WeakMap<Owner, { next: number }>` so DOM
  and SSR renders match without leaking counter state across requests or mounted
  roots.
- `createSelector(source, fn?)` provides $O(2)$ key-targeted subscriptions for
  default strict equality (notifying only the deselected and newly selected key
  computations) and custom comparator support, automatically cleaning up key
  listeners when row scopes dispose.
- `createReaction(onInvalidate)` separates one-shot dependency tracking from
  untracked invalidation (and runs tracking once without subscriptions in SSR),
  while `observable(accessor)` and `from(producer, initialValue?)` bridge Solid
  accessors with TC39 / `Symbol.observable` streams with automatic owner
  unsubscription.

# Moonshine 0.4.49

- Add deterministic tree-scoped `useId()` in `@tschk/moonshine-vue/context`
  (re-exported from `@tschk/moonshine-vue/reactive`) and `onBeforeMount` /
  `onErrorCaptured` (`ErrorCapturedHook`) in `@tschk/moonshine-vue/lifecycle`,
  plus local unpublished Crepuscularity `'vue'` import routing and lifecycle
  argument validation.
- `useId()` generates deterministic sequential IDs (`v-0`, `v-1`, ...) scoped to
  each root component/render/SSR tree via `WeakMap<Owner, { next: number }>` so
  DOM and SSR markup match without leaking state across requests or mounted
  instances.
- `onBeforeMount(fn)` runs synchronously on component setup completion before
  DOM insertion and before `onMounted`, with untracked execution, preserved
  component consumer context (`inject()`), and support for dynamic `onMounted`
  registration.
- `onErrorCaptured(hook)` intercepts descendant watcher errors (`"watch getter"`,
  `"watch callback"`, `"watch effect"`, `"watch cleanup"`) bottom-up across
  ancestor components within each capturing ancestor's component context;
  returning `false` stops propagation before outer `onErrorCaptured` hooks and
  `withComponentErrorHandler`, while secondary throws replace the propagating
  error and unhandled synchronous `watchSyncEffect` errors drain registered
  cleanups.

# Moonshine 0.4.48

- Add Vue 3.5 `useModel`, compiler-facing `createModel`, `ModelRef<T, M, G, S>`,
  and `DefineModelOptions<T, G, S>` in `@tschk/moonshine-vue/reactive` (with
  optional setter type parameter `Ref<T, S = T>`), plus local unpublished
  Crepuscularity `<script setup>` `defineModel` macro lowering.
- `createModel` and `useModel` support default (`modelValue`) and named models,
  `[model, modifiers]` tuple destructuring via `[Symbol.iterator]` with frozen
  reactive modifiers (`modelModifiers`, `modelValueModifiers`,
  `model-valueModifiers`, `<name>Modifiers`, and `<kebab-name>Modifiers`),
  `default` values and cached factories (evaluated inside component context so
  `inject()` works, with `soleFunction` preservation for function-typed models),
  `booleanCast` (`""`, `"true"`, and hyphenated prop-name literals cast to
  `true`; omitted optional boolean models resolve to `false`), and `get`/`set`
  transforms (including force-triggering local readers when `set` normalizes an
  assigned value back to the current local value).
- Controlled parent bindings emit `update:<name>` synchronously on `.value`
  assignment while updating the local fallback ref so synchronous reads observe
  the latest value immediately before the parent flushes; omitted parent
  `v-model` bindings operate as standalone reactive local state, and
  `useModel(props, name)` interoperates with `withDefaults`
  (`createDefaultProps`) when raw parent props transition to `undefined`.
- Local unpublished Crepuscularity lowering lowers `defineModel` in
  `<script setup>` to `createModel(__ms_raw_props, ...)`, synthesizes the model
  prop and `<name>Modifiers` prop metadata alongside `"update:<name>"` event
  declarations, merges cleanly with `defineProps` / `withDefaults` and
  `defineEmits` while rejecting duplicate model names or conflicting prop/emit
  declarations, and treats `defineModel` / `useModel` refs as writable `Ref`
  bindings in templates (`v-model`, auto-unwrap, and `defineExpose`).

# Moonshine 0.4.47

- Extend `@tschk/moonshine-vue/reactive` synchronous `watch` and
  `watchSyncEffect` with Vue 3.5 watcher capabilities: reactive object watch
  sources (`reactive`, `shallowReactive`, `readonly(reactive(...))`), `deep`
  (`boolean` or finite depth `number`), `once`, `onWatcherCleanup`, and
  `WatchHandle` (`WatchStopHandle` function with `.stop()`, `.pause()`, and
  `.resume()`).
- Direct reactive object watch sources default to deep traversal for `reactive`
  proxies and depth `1` for `shallowReactive` proxies or `{ deep: false }`.
  Deep traversal handles cycles, arrays, `Set`s, nested refs, and symbol keys
  while skipping `markRaw` values and tracking per-source dependency versions so
  mixed tuples do not falsely fire on unchanged sibling getters.
- `onWatcherCleanup(cleanupFn, failSilently?)` registers cleanup callbacks on
  the active `watch` callback or `watchSyncEffect` effect with lexical nesting
  and `withComponentErrorHandler` `"watch cleanup"` phase routing.
- `WatchHandle.pause()` suspends watcher reruns while retaining tracked
  dependencies, and `WatchHandle.resume()` synchronously flushes if any tracked
  dependency changed while paused.

# Moonshine 0.4.46

- Add Vue 3.5 reactivity inspection, shallow/readonly/raw proxy helpers, ref
  utilities, and `effectScope` ownership primitives in
  `@tschk/moonshine-vue/reactive`: `toValue` (`MaybeRef`, `MaybeRefOrGetter`),
  `triggerRef`, `customRef` (`CustomRefFactory`), `markRaw`, `toRaw`,
  `isReadonly`, `isShallow`, `isProxy`, `shallowReactive`, `readonly`
  (`DeepReadonly`), `shallowReadonly`, `effectScope` (`EffectScope`),
  `getCurrentScope`, and `onScopeDispose`.
- `triggerRef` and `customRef` `trigger()` increment a per-ref trigger epoch so
  synchronous `watch(refSource, cb, { flush: "sync" })`, `watchSyncEffect`, and
  `computed` re-evaluate even when an underlying object reference is mutated in
  place.
- `shallowReactive` tracks root-level properties, array indices/length/mutation
  methods, `in`, `Object.keys`, `delete`, and `Set` membership without deep
  wrapping or ref unwrapping. `readonly` and `shallowReadonly` enforce
  immutability on plain objects, arrays, `Set`s, reactive proxies, and refs while
  forwarding reactive tracking from wrapped reactive targets. `markRaw` prevents
  wrapping at root and nested object/array/`Set` positions, and `toRaw` unwraps
  native proxies in O(1).
- `effectScope(detached?)`, `getCurrentScope()`, and
  `onScopeDispose(fn, failSilently?)` manage grouped reactive ownership (`watch`,
  `watchSyncEffect`, `computed`, nested non-detached `effectScope`s, and disposal
  callbacks) and bind automatically to the active component scope during native
  `<script setup>` initialization.
- Local unpublished Crepuscularity lowering admits all new reactivity and scope
  helpers (plus `hasInjectionContext`, `InjectionKey`, `isRef`, `isReactive`,
  and `watchSyncEffect`) in `'vue'` imports, and recognizes `customRef` and
  `shallowReactive` in `defineExpose` and `v-model` target analysis.
- Validation: 2,547 SDK tests pass (with all five optional compiler-gated
  standalone tests passing when `MOONSHINE_CREPUS_COMPILER` is set); 876
  source-gate modules (`scripts/check-native-sfc.ts`), Crepuscularity Vue
  compiler tests, Clippy (`-D warnings`), and both 25-project typecheck lanes
  (`tsc` and `tsgo`) pass. The signal kernel stays at 4,041 raw bytes. Source
  compiler changes remain local and unpublished; npm publication stays manual.

# Moonshine 0.4.45

- Add `useTemplateRef` and `TemplateRef<T>` in `@tschk/moonshine-vue/reactive`
  (re-exported from `@tschk/moonshine-vue/expose`) and `bindComponentRef` in
  `@tschk/moonshine-vue/expose`. `useTemplateRef(key)` validates active component
  initialization and per-instance key uniqueness, returning a readonly native
  ref (`r.value = ...` throws `TypeError`) initialized to `null` and bound
  internally by `bindRef` and `bindComponentRef`.
- Extend `createTextModel`, `createCheckedModel`, `createSelectModel`, and
  `createModelOption` in `@tschk/moonshine-vue/model` and
  `@tschk/moonshine-vue/select` to exclude `"ref"` from attribute getter
  forwarding and invoke `props.ref(element)` after model initialization (after
  initial `apply()` on `<select>` so `selectRef.value.value` reflects initial
  option selection in `onMounted`).
- Local unpublished Crepuscularity lowering admits `useTemplateRef` (and
  type-only `Ref` / `TemplateRef`) from `'vue'`, resolves top-level `const x =
useTemplateRef("key")` bindings (including hyphenated keys), rejects duplicate
  template ref keys across `ref`/`shallowRef`/`useTemplateRef`, and lowers
  `ref="x"` and `:ref="'x'"` on `v-model` `<input>`, `<textarea>`, `<select>`,
  and `<option>` elements.
- Validation: 2,537 SDK tests pass (with all five optional compiler-gated
  standalone tests passing when `MOONSHINE_CREPUS_COMPILER` is set); 876
  source-gate modules (`scripts/check-native-sfc.ts`), 24 Crepuscularity Vue
  model/expose/template-ref compiler tests, Clippy (`-D warnings`), and both
  25-project typecheck lanes (`tsc` and `tsgo`) pass. The signal kernel stays at
  4,041 raw bytes. Source compiler changes remain local and unpublished; npm
  publication stays manual.

# Moonshine 0.4.44

- Add `toStore` and `fromStore` in `@tschk/moonshine-svelte/store` for Svelte 5
  rune/store interoperability. `toStore(get, set?)` evaluates `get()` eagerly,
  captures the creating Rune scope (`pre` before DOM children mount, `render`
  after), matches Svelte 5 post-order effect registration when subscribed inside
  an initializing Rune effect, survives parent component disposal while store
  subscribers remain active, and returns a one-shot `writable(get())` on SSR.
  `fromStore(store)` bridges `Readable` and `Writable` stores (plus `{ subscribe }`
  observables) into a `{ current }` accessor, shares one client subscription
  across tracked readers and `$derived` chains, releases after a microtask when
  demand drops to zero, preserves effect teardown history values, and falls back
  to `get(store)` outside tracking or on SSR.
- Reduce SSR static-attribute, selection, and consumer allocations in
  `@tschk/moonshine-dom/ssr` (`ssrElement`, `ssrControlValueAttr`) and
  `@tschk/moonshine-svelte/spread-element-server`.
- Local unpublished Crepuscularity lowering admits `toStore` and `fromStore`
  imports, aliases, and re-exports from `svelte/store`.
- Validation: 2,536 SDK tests pass (with all five optional compiler-gated
  standalone tests passing when `MOONSHINE_CREPUS_COMPILER` is set); 876
  source-gate modules (`scripts/check-native-sfc.ts`), Clippy (`-D warnings`),
  and both 25-project typecheck lanes (`tsc` and `tsgo`) pass against Svelte
  5.57.1. The signal kernel stays at 4,041 raw bytes. Source compiler changes
  remain local and unpublished; npm publication stays manual.

# Moonshine 0.4.43

- Add `@tschk/moonshine-vue/expose` (`exposeRefs`, `bindRef`, `ShallowUnwrap`) and
  extend `@tschk/moonshine-vue/app` (`createApp`, `ComponentExports`) so
  `app.mount(target)` returns the root component's exposed instance (or a
  null-prototype empty object when `defineExpose` is omitted or empty).
  `enqueueComponentReference` in `@tschk/moonshine-dom/component-instance`
  schedules owned element and component template refs into the shared reference
  flush wave before `onMounted` hooks run and clears them to `null` on unmount.
  `Unwrap<T>` in `@tschk/moonshine-vue/reactive` preserves `Node | Window` leaf
  types without deep ref recursion.
- Local unpublished Crepuscularity lowering supports top-level `defineExpose` and
  static intrinsic/imported-component template refs (`ref="x"` and `:ref="'x'"`
  targeting a top-level `const` `ref` or `shallowRef` setup binding), branding
  DOM and SSR component returns as `ComponentView<Node, Exports, Props>` while
  erasing runtime `defineExpose` and template `ref` attributes in SSR. Dynamic
  ref expressions, function refs, `useTemplateRef`, `v-for` ref arrays and
  `v-model` form-control template refs reject with explicit diagnostics.
- Validation: 2,530 SDK tests pass (with all five optional compiler-gated
  standalone tests passing when `MOONSHINE_CREPUS_COMPILER` is set); 876
  source-gate modules (`scripts/check-native-sfc.ts`), 15 Crepuscularity Vue test
  suites, Clippy (`-D warnings`), and both 25-project typecheck lanes (`tsc` and
  `tsgo`) pass. The signal kernel stays at 4,041 raw bytes. Source compiler
  changes remain local and unpublished; npm publication stays manual.

# Moonshine 0.4.42

- Support spread attributes combined with `bind:group` on static checkbox and
  radio inputs. Direct `setInputValue(input, value, notify = true)` and unbound
  `installElementSpread` retain eager group-member reconciliation; bound spreads
  (`installBoundElementSpread`) update input values with `notify = false` so
  spread-only value updates do not invalidate the group member effect until the
  group model or an authored dynamic `value={expr}` watched via
  `createInputGroup.bind(input, watch)` updates.
- Local unpublished Crepuscularity lowering admits `bind:group` with intrinsic
  spreads on static `type="checkbox"` and `type="radio"` inputs, keeps change
  handlers in the ordered spread layer dictionary, suppresses trailing synthetic
  `defaultValue`/`defaultChecked` layers on spread inputs, and emits positioned
  SSR `checked` spread layers only when an authored `value` attribute is present.
- Validation: 2,517 SDK tests pass (with all five optional compiler-gated
  standalone tests also passing when `MOONSHINE_CREPUS_COMPILER` is set); 868
  source-gate modules, 10 authored Chromium differential phases, 3 multi-input
  SSR comparisons, and both project typecheck lanes (`tsc` and `tsgo`) pass
  against Svelte 5.57.1. The signal kernel stays at 4,041 raw bytes. Source
  compiler changes remain local and unpublished; npm publication stays manual.

# Moonshine 0.4.41

- Preserve details toggle-handler ordering in opt-in bound element spreads.
  Existing handlers run before the open binding writes; removed/re-added handlers
  follow ordinary listener registration order. Input/change ordering is unchanged.
- Local unpublished Crepuscularity lowering now combines intrinsic spreads with
  `bind:open`. Five authored Chromium phases and six fresh SSR renders match
  Svelte 5.57.1; isolated Bun/minified Node source checks also pass. Group spread
  bindings, actions/attachments with spreads, scoped CSS and hydration remain open.
- Validation: 2,515 SDK tests pass with five optional skips; 868 source-gate modules,
  930 native compiler regressions, both project typecheck lanes and scoped Clippy
  pass. Feature CI passes on Linux/macOS and Dart. The signal kernel stays at
  4,041 raw bytes; the state-only Svelte consumer stays at 6,569 raw bytes.
  No new runtime dependencies or general performance claim. Source compiler
  changes remain unpublished; npm publication stays manual.

# Moonshine 0.4.40

- Add opt-in native input/textarea/select/option spread forwarding, preserving
  live values, reset defaults, typed selections and owned event listeners.
  Bound spread callbacks install once between capture and ordinary handlers.
  Form SSR uses the existing independent renderer and reads spread getters once.
- Local unpublished Crepuscularity lowering supports these form spreads with
  value, checked, select and file bindings. Authored Chromium and repeated SSR
  fixtures match Svelte 5.57.1, including file-model non-reading on the server.
  Open/group spread bindings, autofocus, scoped directives and hydration remain
  unsupported. This is not a compiled Svelte ABI replacement.
- Validation: 2,514 SDK tests pass (five optional skips), 868 source-gate modules,
  929 native compiler regressions, strict generated types and isolated Bun/Node
  source consumers pass. Both project typecheck lanes and scoped Clippy pass.
  Feature CI passes on Linux and macOS.
- Keep the signal kernel at 4,041 raw bytes and the state-only Svelte consumer at
  6,569 raw bytes. No runtime dependencies are added. The reproducible
  `scripts/benchmark-svelte-form-ssr.ts` comparison produces a smaller native
  form SSR bundle but slower rendering than Svelte in the measured workload;
  no general speed/size ranking is claimed. Source compiler changes remain
  unpublished; npm publication stays manual.

# Moonshine 0.4.39

- Add opt-in independent Svelte intrinsic spread helpers on `/runes` and `/ssr`.
  Support ordered layers/getters, live rest forwarding, attribute removal and
  stable owned event listeners without adding a host runtime dependency.
- Local unpublished Crepuscularity lowering connects ordinary static HTML source
  spreads to these helpers, including nested component bodies. Source checks
  match Svelte 5.57.1 across wrapper updates, SSR getter ordering and entity
  behavior. Forms, dynamic/namespaced elements, directive combinations, scoped
  CSS, autofocus and hydration remain outside this forwarding contract.
- Compiler checks: 848 native library tests, 73 authored source regressions,
  four new spread tests and scoped Clippy pass. Two authored Chromium fixtures,
  isolated Bun/Node consumers, public types and 425 pinned-Bun Svelte tests pass.
  The final local SDK run has one Solid bridge timeout reproduced on the
  committed baseline; other 2,504 tests pass.
  Feature CI passes on Linux and macOS.
- Keep the signal kernel at 4,041 raw bytes. The state-only Svelte control changes
  from 6,566 raw / 2,729 gzip to 6,569 raw / 2,731 gzip bytes; unused spread
  implementation is omitted. No runtime speed or host-size comparison claimed.
  Compiler changes remain unpublished; npm publication stays manual.

# Moonshine 0.4.38

- Add opt-in native HTTP route loading/actions through router `/data-http` and
  server `/data-http`, with Bun/Node builds and previews selecting the transport.
  Preserve response metadata, cookies, abort signals and independent mutation
  revalidation; reject malformed configuration and cross-origin browser requests.
- Keep the default export signal-only and host-free. Direct server responses,
  redirects and errors remain HTTP; host forms, fetchers, RSC and hydration are
  not implemented. Applications own payload validation, authentication and Host
  acceptance. Cancellation cannot roll back committed writes.
- Reject already-aborted actions before execution. Real HTTP/browser lifecycles,
  relocated Bun/Node builds, extracted package consumers, both typecheckers and
  52 pinned-Bun transport/preview tests pass. The broader local test command has
  two existing-test timeouts and one follow-on killed-process error; both timed
  tests pass individually under their original deadlines. Feature CI passes on
  Linux and macOS.
- Signal kernel remains 4,041 raw bytes. A plain unused-transport SSR consumer
  changes from 11,818 raw / 4,420 gzip to 12,155 raw / 4,574 gzip bytes; moving
  transport into its own entry removes 603 gzip bytes from the inline draft.
  No speed or host comparison claimed. npm publication stays manual.

# Moonshine 0.4.37

- Add opt-in Astro SSR helpers for ordered intrinsic attribute spreads. Local
  unpublished Crepuscularity lowering preserves literal/dynamic values, duplicate
  attributes, once-only string-key getters, coercion order and helper hygiene.
  Function data stringify without executing their bodies; symbols are ignored.
- Keep server event filtering and strict name/directive validation. These differ
  from Astro's permissive spread behavior. Slot-outlet spreads, async slots and
  broader source syntax remain unsupported. No host runtime or dependency added.
- Full SDK: 16,914 passing test executions, zero failures. Both typecheckers,
  declaration consumers, 56 compiler tests, 848 native library tests, scoped
  Clippy and the 856-module source gate pass. Broader Clippy still reports two
  pre-existing warnings in an untouched Astro source test.
- Repeated fresh Bun/Node SSR and Chromium parsing/edit/reset pass. Six parsed
  cases match real Astro 7.4.0 attribute helpers; compiler 4.0.0 segment probes
  are separate evidence, not a complete host compiler/render comparison.
- The source fixture is 5,860 gzip bytes; no-spread control stays 12,844 raw bytes
  and changes from 4,902 to 4,903 gzip bytes. Signal kernel stays 4,041 raw bytes.
  No host bundle or speed claim. npm publication stays manual.

# Moonshine 0.4.36

- Add opt-in React `useRouteSubmit` and `useRouteSubmitting` hooks over the
  independent data runtime. Action result types, pending state and provider
  replacement follow the owning runtime without a host router dependency.
- Preserve existing cancellation behavior: successful superseded writes
  revalidate current data; failed reloads expose a data error while retaining
  the successful action result. Applications own transport and serialization.
- Focused tests, both typecheckers, public Bun/Node consumers and ten real HTTP
  browser phases pass. The full local run recorded 16,834 passes, seven existing
  timeouts and two follow-on child-process errors; all seven timeout checks
  passed separately under their original deadlines.
- The reader-only bundle stays 3,084 raw / 1,343 gzip bytes. No host-router size
  or speed comparison is claimed. Host form/navigation contracts remain open.
  npm publication remains manual.

# Moonshine 0.4.35

- Add native own-slot presence through the opt-in Astro sourceHasSlot helper.
  Local unpublished Crepuscularity lowers ordinary Astro.slots.has calls with
  dynamic names, nested props, hygienic helpers and arguments evaluated once.
  Presence works without outlets and never initializes unused slot content.
- Empty supplied slots count; missing/inherited names do not. Native own-slot
  semantics differ from Astro Slots instance prototype/reserved-name quirks.
  Async slot rendering, the slot bag, method extraction, computed/optional forms
  and intrinsic spreads remain unsupported.
- Full SDK run: 16,832 passing test executions, zero failures. Both typecheckers
  pass 25 projects. Nine direct slot tests, four isolated consumer tests, source
  and declaration consumers, 45 compiler tests, 848 native library tests,
  owned-target Clippy and the 856-module source gate pass.
- Six source cases pass repeated fresh Bun/minified Node SSR without host/parser
  imports. The real Astro 7.4.0 Slots class and compiler 4.0.0 were checked
  separately for presence values and emitted slot shapes. This is not a full
  host-renderer comparison.
- The native six-case fixture is 5,592 gzip bytes. A no-slot control bundle is
  byte-identical before/after the helper; the signal kernel stays 4,041 raw bytes.
  No host bundle or speed claim. Source compiler changes remain local/unpublished;
  npm publication stays manual.

# Moonshine 0.4.34

- Add independent synchronous server resources on DOM `/resource/ssr` and Solid
  `/ssr`. Fetchers never run; request-loaded seeds and source truthiness determine
  snapshots. Server refetch returns loading and mutation stores literal values,
  including functions. Client resources reject SSR before invoking user callbacks.
- Fix inherited initialValue presence for client resources: seeded pending fetches
  report refreshing, matching Solid. No host runtime or new dependencies.
- Local unpublished Crepuscularity now routes explicit Solid SSR createResource
  and Resource imports, aliases, reexports and type queries to the native server
  entry. Creation needs an active SSR scope. Async SSR, Suspense, hydration,
  storage and full resource options remain unsupported.
- Full SDK run: 16,831 passing test executions, zero failures. Both typecheckers
  pass 25 projects. Thirty direct tests, six isolated consumer tests, declaration
  consumers, 12 compiler tests, 848 native library tests, owned-target Clippy and
  the 856-module source gate pass.
- Sixteen authored text-output SSR cases repeat in fresh Bun/minified Node with
  zero fetches and a host/parser-free runtime graph. Thirteen client browser
  phases retain loading/error behavior, focus, selection, disposal and identity.
- Signal kernel stays 4,041 raw bytes. The SSR text fixture is 4,927 gzip bytes
  versus Solid 1.9.14's 14,042. The client fixture remains larger: 8,545 versus
  7,636, adding 44 gzip bytes against the preceding resource implementation.
  These are scoped bundle comparisons, with no startup/runtime speed claim.
  Source compiler changes remain local/unpublished; npm publication stays manual.

# Moonshine 0.4.33

- Add independent component emit trim/number conversion to the opt-in Vue event
  protocol. Flags are read live; all payload arguments and once listeners retain
  Vue 3.5.13 conversion rules. No host runtime or new dependencies.
- Local Crepuscularity now lowers component modifiers, preserving custom flag
  order, repeated flags, named/kebab keys and the explicit modelValue distinction.
  Required model props and callback payload types remain intact. Compiler changes
  remain local/unpublished; dynamic arguments, defineModel and hydration remain
  unsupported. Undeclared modifier root attrs are omitted; modifier-object
  mutation after a parent update differs from Vue and remains unsupported.
- Six direct Chromium cases and nine authored cases with nineteen browser phases
  compare against Vue 3.5.13. Repeated fresh Bun/minified Node SSR, source and
  declaration consumers, both full typecheckers, 531 core tests, 848 native
  library tests, 50 focused compiler tests and core/owned-native Clippy pass.
  The 856-module source gate and isolated package regression pass.
- Full local SDK run: 16,400 passing executions and one unchanged build-boundary
  timeout. The isolated test passes in 4.42 seconds under a longer observation
  window; the full local run is not green.
- Signal kernel remains 4,041 raw bytes. The modifier fixture is 10,943 gzip bytes
  versus Vue's 21,493. Emit conversion adds 158 gzip bytes to the unchanged named
  model control; no startup/runtime speed claim. npm publication remains manual.

# Moonshine 0.4.32

- Verify static named and multiple component models through the existing native
  props/emits protocol. Canonical identifier/kebab arguments, distinct payloads,
  per-model listener order and class/style normalization need no new runtime or
  dependencies. Children declare each model prop and update event explicitly.
- Fourteen authored Chromium phases match Vue 3.5.13, including once listeners,
  external writes, independent roots and disposal. Active setup emits match
  repeated fresh Bun/minified Node SSR. Source and declaration consumers pass
  both TypeScript lanes, including invalid prop and callback payload checks.
- Full SDK run: 16,397 passing test executions, zero failures. Both typecheckers
  pass all 25 projects; the 856-module source gate and 848 native web-library
  tests pass. Library Clippy passes; all-target Clippy reports two existing
  length-comparison warnings in the unchanged Astro source test.
- Signal kernel stays 4,041 raw bytes. The named-model fixture is 10,983 gzip
  bytes versus Vue 3.5.13's 21,335; no startup/runtime speed claim.
- This release adds regression tests and documentation. Source compiler changes
  remain local/unpublished; component model modifiers, defineModel and hydration
  remain unsupported. npm publication remains manual.

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
