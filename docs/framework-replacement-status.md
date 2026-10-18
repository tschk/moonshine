# Framework replacement status

Audited against SDK 0.4.29 on 2026-10-18, with unpublished local Astro slots and prop spreads,
Svelte details-binding, native Vue text/checked models and Set-prop integration. This is a replacement boundary audit,
not a claim of full framework compatibility. Source compiler improvements remain
local and unpublished in Crepuscularity. The default Moonshine entry stays
signal-only; React and web capabilities remain opt-in.

| Framework    | Independent behavior today                                                                           | Important remaining application boundary                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Next         | React-based navigation, links and bounded request helpers; no Next dependency                        | RSC/server actions, cache revalidation, filesystem conventions, image optimization                              |
| React Router | React-based links, navigation, location and response helpers; no React Router dependency             | Client loader/action lifecycles, fetchers, forms and nested route configuration                                 |
| TanStack     | React-based navigation hooks and links; no TanStack dependency                                       | Route tree/typing and loader lifecycles; invalidation/loading need an explicit data runtime; matches stay empty |
| Waku         | React-based client routing; no Waku dependency                                                       | RSC payloads/streaming, file routing, server APIs and search codecs                                             |
| Solid        | Independent graph, DOM/SSR factories, control flow, stores and client resources; no Solid dependency | Hydration, async SSR, Suspense, full resource options and arbitrary compiled instructions                       |
| Svelte       | Independent stores, ownership and native source runtime                                              | Complete rune/component coverage, transitions and hydration; see the source coverage ledger                     |
| Vue          | Independent composition helpers and bounded native SFC runtime                                       | Complete SFC lowering, attrs fallthrough and host VNode/compiler ABI                                            |
| Angular      | Native signal bridges and bounded template rendering                                                 | Component-class/decorator compilation, DI, lifecycle and compiled instructions                                  |
| Astro        | Independent synchronous source SSR factories                                                         | Dynamic slots, islands/hydration, async rendering and complete compiler API                                     |
| Nuxt         | Native signal bridges and lazy renderer                                                              | App composables, payload/data lifecycle, auto-imports, Nitro and Vue component contracts                        |

The first four rows still use React. Removing their host framework does not
remove React or establish compatibility with a complete existing application.
`adapter-conformance` is shared verification support, not another framework.
Package READMEs describe the supported subpaths and narrower source variants.

## Seven remaining host-dependent entries

- Vue: `packages/adapter-vue/src/vue.ts` and `src/compiler-sfc.ts`.
- Angular: `packages/adapter-angular/src/core.ts` and `src/common.ts`.
- Astro: `packages/adapter-astro/src/compiler.ts`.
- Nuxt: `packages/adapter-nuxt/src/app.ts` and `src/vue.ts`.

These entries explicitly re-export their hosts. Their Vue, Angular, Astro and
Nuxt peers are already optional; native roots do not need those hosts at runtime.
Deleting a peer or aliasing a partial native implementation over these entries
would break the exported contract. Replace each behavior and its source compiler
contract before removing its legacy entry. Parsing/lowering belongs in
Crepuscularity; web routing, rendering, data loading and deployment belong here.

The scan covers direct imports in adapter source and package manifests, not every
transitive dependency. Existing isolated consumer tests provide runtime evidence
for native entry boundaries. `packages/core/test/adapters-contract.test.ts`
contains the reimplementing-adapter host dependency guard; the export-target
checker alone does not establish independence.

## Next useful work

1. Connect existing server route loaders/actions to a real client data lifecycle:
   cancellation, errors, invalidation and mutation revalidation. Share that web
   behavior before adding compatibility hook names. The opt-in data runtime now
   provides cancellation, invalidation and action revalidation; TanStack loader hooks and full data-router lifecycles remain open.
   The opt-in `/data-react` entry exposes the owning native state to React.
   Explicit location-bound ready seeds can reuse application-loaded data without
   an initial fetch; applications still own transport and validation. This does
   not implement [React Router’s hydration data contract](https://reactrouter.com/api/data-routers/createBrowserRouter).
   The React hook does not alias TanStack's match-scoped
   [`useLoaderData`](https://tanstack.com/router/latest/docs/api/router/useLoaderDataHook).
2. Extend authored component composition through Crepuscularity, including Astro
   slots and remaining Vue/Svelte source variants. Require actual DOM/SSR and
   public-type consumers; primitives alone do not prove source compatibility.
   Local `bind:open` now reaches the independent details helper, including store,
   keyed-row and imported-child cases. Props-less Vue setup and text/numeric
   `v-model` now compile locally, including supported modifiers and textarea.
   Static checkbox/radio models now compile locally with array/Set/scalar behavior;
   eleven direct and thirteen authored SFC browser phases match Vue 3.5.13.
   Source SSR preserves the distinct root/nested checked policy.
   Vue select/component models, checked modifiers and attrs fallthrough remain gaps.
   Astro component prop spreads now compile locally with final class-list
   normalization; intrinsic HTML spreads and synchronous slot-presence queries
   remain useful additions to investigate.
3. Design request/client identity transport before claiming hydration or Svelte
   `$props.id()` compatibility. Separate client/server counters do not satisfy
   matching hydrated IDs.

## Performance boundary

The verified 0.4.25 signal-only core bundle is 4,041 raw bytes. That is one entry,
not a whole-framework comparison. The Solid README records a historical resource
application workload where Moonshine's bundle is larger than Solid's; those
numbers are tied to that fixture and snapshot. Refresh comparable bundle,
startup, SSR and interaction workloads before making release-wide performance
claims. No evidence here establishes universal smallest or fastest behavior.

Useful missing behavior remains. The investigation goal is still active.
