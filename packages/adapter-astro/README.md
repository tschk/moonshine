# `@tschk/moonshine-astro`

The root provides native Moonshine signal bridges and a lazy native renderer.
At runtime, root imports need neither Astro, React, parser WASM nor the optional
framework peer. Legacy host APIs remain explicit on their existing subpaths.

Strict TypeScript checking of the root entry requires installing
`@tschk/moonshine-framework`, even when importing only a bridge: the root also
exports `crepusRenderer` with the framework's `Renderer` contract. The framework
remains optional for runtime imports and bridge-only browser/Bun/Node bundles.
This requirement does not apply to the signal-only `@tschk/moonshine` core entry.

```ts
import { fromMoonshineSignal, crepusRenderer } from "@tschk/moonshine-astro";
```

| Entry        | Provides                                       |
| ------------ | ---------------------------------------------- |
| `.`          | Native signal bridges and lazy native renderer |
| `./compiler` | Legacy Astro compiler re-exports               |

`crepusRenderer` preserves its compatibility name but renders native server
factories, escaped metadata, API JSON and SPA shells. Install
`@tschk/moonshine-framework` when invoking this source-file compatibility facade
under Bun. Bundled deployments use `@tschk/moonshine-dom/framework-native`
explicitly; the facade intentionally keeps source loading outside the static
bundle graph. Legacy React/View IR page outputs reject; native island hydration
is unsupported. The renderer loads only when
called, so signal bridge consumers do not load server rendering.

Legacy entries require their optional host peers: `astro`. They cannot be
aliased over arbitrary host-compiled output to remove the host.

The compiler entry still requires Astro. Native rendering expects compiled Moonshine server factories; it does not execute Astro frontmatter or implement the Astro compiler result shapes.
Source parsing and compilation belong to Crepuscularity; these root runtime
changes do not establish full Astro source support.

The legacy Crepus template emit currently accepts fenced Astro input while
skipping its frontmatter and reading template expressions from an explicit
`scope`. A successful template build does not establish execution of constants,
`Astro.props`, imports or top-level `await`. Authored Astro server-module lowering
remains a compiler gap; it must be implemented in Crepuscularity.
