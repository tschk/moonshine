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

| Entry           | Provides                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.`             | Native signal bridges, lazy native renderer, and host-free runtime helpers                                                                       |
| `./actions`     | Independent Astro Actions (`defineAction`, `ActionError`, `ActionInputError`, `z`)                                                               |
| `./compiler`    | Legacy Astro compiler re-exports                                                                                                                 |
| `./content`     | Independent Content Collections & Live Content Layer (`defineCollection`, `getCollection`, `getEntry`, `getEntries`, `reference`, `render`, `z`) |
| `./context`     | Independent `AstroCookies`, `createAstroGlobal`, `withAstroContext`, `useAstro`                                                                  |
| `./ssr`         | Independent synchronous Astro source factories                                                                                                   |
| `./transitions` | Independent View Transitions (`fade`, `slide`, `none`, `navigate`, `swapFunctions`)                                                              |

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
Namespace/directive attributes, generic `Props`, and map callbacks with
index/destructuring/block bodies are not yet supported. These parser limits remain work in Crepuscularity.

Local component prop spreads now preserve ordinary JavaScript override order,
getter evaluation and own string/symbol keys. Forwarding `Astro.props` works
through imported components; ordinary `children`/`slots` props remain separate
from projected slots. Spread `class:list` normalizes against the final `class`
after overrides. Nullish spreads contribute no props. Slot outlet spreads remain
rejected. Compiler lowering is local and unpublished.

Local intrinsic spreads use ordered attribute segments rather than merged props.
Own enumerable string getters run once, in order, with coercion before the next
getter/expression; inherited and symbol keys are ignored. Function values stringify
without invocation. Literal and dynamic boolean values retain their separate
rules. Repeated attributes (including spread classes) remain separate; HTML parsing
keeps the first. Authored `class` plus `class:list` combines at the directive position.
The opt-in `/ssr` compiler helpers are `sourceAttribute`, `sourceSpread` and
`sourceElement`; ordinary no-spread factories retain their existing path.

Moonshine retains its server constraints: event attributes are filtered, invalid
names throw, script/style elements and spread directives/namespaces reject.
These differ from Astro's more permissive spread handling. Nullish spreads are
empty; string/array index keys fail attribute-name validation. Raw-content-looking
names remain escaped ordinary attributes, not HTML injection instructions.

An authored fixture passes three fresh SSR requests in Bun and minified Node,
plus Chromium parsing, input editing and form reset with no client script. Six
parsed cases match actual Astro 7.4.0 attribute helpers, with event filtering
recorded separately. The reference uses compiler 4.0.0 segment output and runtime
helpers separately, not a complete host compilation/rendering comparison. The
fixture is 5,860 gzip bytes; an ordinary no-spread control stays 12,844 raw bytes
and changes from 4,902 to 4,903 gzip bytes. No host bundle or speed claim.

Without prop spreads, combined `class` and `class:list` use the existing helper.
The ordinary class evaluates first at the directive position. Empty HTML classes
are omitted. Component factories omit an empty normalized class-list prop while
retaining an explicitly supplied empty ordinary `class` prop.

Local authored slot lowering now supports default and nonempty literal named
slots, grouping of same-name children, named Fragments and forwarding through
imported layouts. An explicit empty slot suppresses fallback; whitespace-only
ordinary component content supplies no slot. Projected HTML loses the marker,
while projected components retain their ordinary `slot` prop. Dynamic/empty
outlet names and misplaced markers reject explicitly. `Astro.slots.render`, the
slot bag, method extraction, computed/optional access and unrelated Astro globals
remain unsupported.

Local source now supports ordinary `Astro.slots.has(nameExpression)` calls in
frontmatter and template expressions, including dynamic strings and nested
`Astro.props` reads. For example:

```astro
---
interface Props { lookup?: string }
const present = Astro.slots.has(Astro.props.lookup ?? "head");
---
<section data-present={String(present)}><slot name="head">fallback</slot></section>
```

Presence uses the existing native own-slot protocol: an explicitly empty supplied
slot counts, missing/inherited names do not. The query never renders content or
reads its value. It works without a slot outlet; an unused child that would throw
stays unevaluated. Shadowed local `Astro` bindings remain ordinary JavaScript.
Native own-slot behavior differs from Astro's inherited-name and reserved-member
quirks; it does not implement the host Slots instance ABI.

The real Astro 7.4.0 Slots class and @astrojs/compiler 4.0.0 were checked separately
for presence values and emitted slot shapes. Six native source cases pass
repeated fresh Bun/minified Node SSR, with dynamic argument evaluation once and
no Astro/React/parser WASM in the runtime graph. Both source/declaration type
lanes pass. The native fixture is 5,592 gzip bytes; there is no full host bundle
or timing comparison. A no-slot control bundle is byte-identical before/after
the helper addition. Compiler changes remain local and unpublished.

Generated calls use the compiler-facing `sourceComponent` / `sourceSlot` /
`sourceHasSlot` contract. Slot values stay outside ordinary props, including `children` and
`slots`. Props and template interpolations capture when the parent constructs
its template; component frontmatter runs during serialization, once per
invocation. Unused slot content stays lazy, repeated outlets render it again,
and fallback interpolations capture eagerly while fallback components defer.
Deferred content retains its caller's native SSR owner. Construct these helpers
inside `renderToString(() => ...)`; ordinary public `h` invocation is unchanged.
This compiler integration is local and unpublished. The companion runtime
helpers are available in SDK 0.4.22. This is not Astro's compiled component ABI;
async rendering, hydration and full slot/source coverage remain incomplete.
