# `@tschk/moonshine-nuxt`

The root, `./composables`, and `./server` entries provide native Moonshine
signal bridges, owner/SSR-scoped Nuxt state, async data, fetch, cookie,
request context, config, error, routing, route middleware, navigation, layout,
response status/headers, head/SEO, payload serialization/revival, preview mode,
hydration, macro composables, built-in Nuxt components, and host-free
Nitro/`h3` server utilities
(`useState`, `clearNuxtState`, `useAsyncData`, `useLazyAsyncData`,
`useNuxtData`, `refreshNuxtData`, `clearNuxtData`, `useFetch`, `useLazyFetch`,
`useCookie`, `refreshCookie`, `withNuxtRequest`, `useRequestEvent`,
`useRequestHeaders`, `useRequestHeader`, `useRequestURL`, `useRequestFetch`,
`useRuntimeConfig`, `useAppConfig`, `updateAppConfig`, `defineAppConfig`,
`createError`, `showError`, `clearError`, `useError`, `isNuxtError`, `callOnce`,
`useRoute`, `useRouter`, `addRouteMiddleware`, `navigateTo`, `abortNavigation`,
`onBeforeRouteLeave`, `onBeforeRouteUpdate`, `setResponseStatus`,
`useResponseHeader`, `setPageLayout`, `useHead`, `useHeadSafe`,
`resolveHeadTags`, `useSeoMeta`, `useServerSeoMeta`, `preloadComponents`,
`prefetchComponents`, `preloadRouteComponents`, `prerenderRoutes`,
`getPrerenderedRoutes`, `clearPrerenderedRoutes`, `defineRouteRules`,
`getRouteRules`, `clearRouteRules`, `useNuxtApp`, `tryUseNuxtApp`,
`useLoadingIndicator`, `useRouteAnnouncer`, `usePreviewMode`, `useHydration`,
`definePayloadReducer`, `definePayloadReviver`, `serializeNuxtPayload`,
`reviveNuxtPayload`, `onNuxtReady`, `onPrehydrate`, `reloadNuxtApp`,
`definePageMeta`, `defineNuxtComponent`, `defineNuxtPlugin`,
`defineNuxtRouteMiddleware`, `NuxtLink`, `defineNuxtLink`, `NuxtPage`,
`NuxtLayout`, `registerNuxtLayout`, `clearNuxtLayouts`, `ClientOnly`,
`DevOnly`, `configureNuxtDevMode`, `NuxtErrorBoundary`,
`NuxtLoadingIndicator`, `NuxtRouteAnnouncer`, `NuxtTime`, `NuxtIsland`,
`registerNuxtIsland`, `clearNuxtIslands`, `NuxtClientFallback`, `NuxtWelcome`,
`Head`, `Title`, `Meta`, `Link`, `Style`, `Base`, `NoScript`, `Body`, `Html`,
`defineEventHandler`, `eventHandler`,
`defineLazyEventHandler`, `getQuery`, `getValidatedQuery`, `getRouterParams`,
`getRouterParam`, `getValidatedRouterParams`, `readBody`, `readValidatedBody`,
`readRawBody`, `readFormData`, `readMultipartFormData`, `getHeaders`,
`getHeader`, `setHeaders`, `setHeader`, `appendHeader`, `removeResponseHeader`,
`parseCookies`, `getCookie`, `setCookie`, `deleteCookie`, `sendRedirect`,
`sendNoContent`, `send`, `sendError`, `defaultContentType`, `handleCacheHeaders`,
`getRequestHost`, `getRequestProtocol`, `getRequestIP`, `getRequestFingerprint`,
`useStorage`, `createStorage`, `prefixStorage`, `memoryDriver`, `clearStorage`,
`defineCachedFunction`, `defineCachedEventHandler`, `useSession`, `getSession`,
`updateSession`, `clearSession`, `sealSession`, `unsealSession`, `createRouter`,
`useBase`, `handleCors`, `appendCorsHeaders`, `appendCorsPreflightHeaders`,
`isPreflightRequest`, `isCorsOriginAllowed`, `createEventStream`, `sendStream`,
`proxyRequest`, `sendProxy`), and a lazy native renderer. The local Crepus compiler
lowers `#imports`, `#app`, `#components`, `#build/components`, `#head`, and
`nuxt/app` imports to `@tschk/moonshine-nuxt/composables` and `h3`,
`nitropack/runtime`, `#internal/nitro`, `unstorage`, and
`unstorage/drivers/memory` imports to `@tschk/moonshine-nuxt/server`, plus
auto-imported `<Nuxt*>` / head tags and `definePageMeta` / `defineRouteRules`
macros inside `.vue` `<script setup>` blocks with automatic template and
destructuring ref unwrapping. At runtime, root,
`./composables`, and `./server` imports need neither Nuxt, `h3`, React, parser
WASM nor the optional framework peer. Legacy host APIs remain explicit on their
existing subpaths.

Strict TypeScript checking of the root entry requires installing
`@tschk/moonshine-framework`, even when importing only a bridge: the root also
exports `crepusRenderer` with the framework's `Renderer` contract. The framework
remains optional for runtime imports and bridge-only browser/Bun/Node bundles.
This requirement does not apply to `./composables`, `./server`, or the
signal-only `@tschk/moonshine` core entry.

```ts
import {
  useState,
  useAsyncData,
  useNuxtData,
  useRoute,
  useRouter,
  addRouteMiddleware,
  navigateTo,
  useSeoMeta,
  defineEventHandler,
  defineCachedEventHandler,
  useStorage,
  useSession,
  createRouter,
  getQuery,
  fromMoonshineSignal,
  crepusRenderer,
} from "@tschk/moonshine-nuxt";
```

| Entry           | Provides                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `.`             | Native signal bridges, Nuxt composables, Nitro/`h3` server helpers, and renderer                     |
| `./composables` | Host-free Nuxt state, async data, routing, head/SEO, and macro composables                           |
| `./server`      | Host-free Nitro/`h3` server event handlers, storage, caching, sessions, router, CORS, SSE, and proxy |
| `./app`         | Legacy Nuxt app composables                                                                          |
| `./vue`         | Legacy Vue runtime re-exports                                                                        |

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
