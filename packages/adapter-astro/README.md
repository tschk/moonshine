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
| `./ssr`      | Independent synchronous Astro source factories |

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

The compiler entry still requires Astro. The independent `/ssr` entry supplies
factories for Crepuscularity-authored server modules; it does not implement
Astro's compiled component ABI. It preserves HTML attributes, normalizes
`class:list` and style objects, escapes ordinary children and keeps component
props independent of any host runtime.

Local Crepuscularity integration now lowers fenced `.astro` frontmatter into
per-render synchronous factories, including typed `Props`, `Astro.props`, static
imports, imported children, conditionals and simple maps. This compiler work is
not yet published. Scriptless entry files retain the older scope-based template
path. Parsing and lowering stay in Crepuscularity.

This remains a bounded source slice: top-level await, dynamic imports,
client directives, script/style blocks, runtime exports, async children, and
Astro globals other than `Astro.props` are unsupported. Hydration and arbitrary
host-compiled output are unsupported. Use the legacy compiler explicitly for
applications requiring the full Astro compiler contract.

Run the authored-source regression with an explicitly supplied local compiler:

```sh
MOONSHINE_CREPUS_COMPILER=/absolute/path/to/crepus bun test packages/adapter-astro/test/standalone.test.ts
```

It checks prop/interpolation capture, deferred component setup, short-circuit
values, optional maps, slots and component prop identity in isolated Bun and Node
consumers. Without the variable,
that compiler integration case is explicitly skipped; runtime cases still run.

The local authored compiler retains whitespace in `pre`/`textarea`, including
nested elements and expression boundaries, and keeps same-line root sibling
separators. These factories serialize initial newlines using literal HTML rules;
the browser consumes the first newline after `pre`/`textarea`. Ordinary native
DOM factories keep their existing textarea property-value behavior.

Conditional and mapped markup retains text punctuation, including apostrophes,
colons, question marks and operator-like text. Nested template substitutions
work in child and attribute expressions, while quoted attribute braces stay literal.
Authored regex/division boundaries use Crepuscularity's existing JavaScript
parser, including nested templates, attributes and JavaScript groups. Astro
void tags stay in the markup frontend; no host runtime or parser enters the SDK.
Attribute spreads, namespace/directive attributes,
generic `Props`, and map callbacks with index/destructuring/block bodies are not
yet supported. These parser limits remain work in Crepuscularity.

Combined `class` and `class:list` use the existing class-list helper, with the
ordinary class evaluated first at the directive position. Empty HTML classes
are omitted. Component factories omit an empty normalized class-list prop while
retaining an explicitly supplied empty ordinary `class` prop.

Local authored slot lowering now supports default and nonempty literal named
slots, grouping of same-name children, named Fragments and forwarding through
imported layouts. An explicit empty slot suppresses fallback; whitespace-only
ordinary component content supplies no slot. Projected HTML loses the marker,
while projected components retain their ordinary `slot` prop. Dynamic/empty
names, misplaced markers and `Astro.slots` utilities reject explicitly.

Generated calls use the compiler-facing `sourceComponent` / `sourceSlot`
contract. Slot values stay outside ordinary props, including `children` and
`slots`. Props and template interpolations capture when the parent constructs
its template; component frontmatter runs during serialization, once per
invocation. Unused slot content stays lazy, repeated outlets render it again,
and fallback interpolations capture eagerly while fallback components defer.
Deferred content retains its caller's native SSR owner. Construct these helpers
inside `renderToString(() => ...)`; ordinary public `h` invocation is unchanged.
This compiler integration is local and unpublished, and the new runtime helpers
are not yet in a tagged SDK release. This is not Astro's compiled component ABI;
async rendering, hydration and full slot/source coverage remain incomplete.
