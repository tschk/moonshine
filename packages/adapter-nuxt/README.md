# `@tschk/moonshine-nuxt`

The root and `./composables` entries provide native Moonshine signal bridges,
owner/SSR-scoped Nuxt state, async data, fetch, cookie, request context,
config, error, routing, navigation, layout, response status, head/SEO, and
macro composables (`useState`, `clearNuxtState`, `useAsyncData`,
`useLazyAsyncData`, `useNuxtData`, `refreshNuxtData`, `clearNuxtData`,
`useFetch`, `useLazyFetch`, `useCookie`, `refreshCookie`, `withNuxtRequest`,
`useRequestEvent`, `useRequestHeaders`, `useRequestURL`, `useRuntimeConfig`,
`useAppConfig`, `updateAppConfig`, `createError`, `showError`, `clearError`,
`useError`, `isNuxtError`, `callOnce`, `useRoute`, `useRouter`, `navigateTo`,
`abortNavigation`, `onBeforeRouteLeave`, `onBeforeRouteUpdate`,
`setResponseStatus`, `setPageLayout`, `useHead`, `useHeadSafe`,
`resolveHeadTags`, `useSeoMeta`, `useServerSeoMeta`, `preloadComponents`,
`prefetchComponents`, `preloadRouteComponents`, `definePageMeta`,
`defineNuxtPlugin`, `defineNuxtRouteMiddleware`), and a lazy native renderer.
At runtime, root and `./composables` imports need neither Nuxt, React, parser
WASM nor the optional framework peer. Legacy host APIs remain explicit on their
existing subpaths.

Strict TypeScript checking of the root entry requires installing
`@tschk/moonshine-framework`, even when importing only a bridge: the root also
exports `crepusRenderer` with the framework's `Renderer` contract. The framework
remains optional for runtime imports and bridge-only browser/Bun/Node bundles.
This requirement does not apply to `./composables` or the signal-only
`@tschk/moonshine` core entry.

```ts
import {
  useState,
  useAsyncData,
  useNuxtData,
  useRoute,
  useRouter,
  navigateTo,
  useSeoMeta,
  fromMoonshineSignal,
  crepusRenderer,
} from "@tschk/moonshine-nuxt";
```

| Entry           | Provides                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `.`             | Native signal bridges, Nuxt composables, and lazy native renderer          |
| `./composables` | Host-free Nuxt state, async data, routing, head/SEO, and macro composables |
| `./app`         | Legacy Nuxt app composables                                                |
| `./vue`         | Legacy Vue runtime re-exports                                              |

`crepusRenderer` preserves its compatibility name but renders native server
factories, escaped metadata, API JSON and SPA shells. Install
`@tschk/moonshine-framework` when invoking this source-file compatibility facade
under Bun. Bundled deployments use `@tschk/moonshine-dom/framework-native`
explicitly; the facade intentionally keeps source loading outside the static
bundle graph. Legacy React/View IR page outputs reject; native island hydration
is unsupported. The renderer loads only when
called, so signal bridge consumers do not load server rendering.

Legacy entries require their optional host peers: `nuxt` and `vue`. They cannot be
aliased over arbitrary host-compiled output to remove the host.

Nuxt app composables, Nitro, auto-imports and Vue runtime rendering remain host APIs on the legacy entries. The native renderer does not implement their request payload or hydration contracts.
Source parsing and compilation belong to Crepuscularity; these root runtime
changes do not establish full Nuxt source support.
