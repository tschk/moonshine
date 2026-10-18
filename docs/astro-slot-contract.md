# Native Astro slot acceptance contract

Investigation against SDK 0.4.21 and the local Crepuscularity compiler,
2026-10-18. Slots are still unsupported. This document defines acceptance work;
it does not add a public runtime API or claim compatibility.

## Observed boundaries

The shared Astro parser rejects `<slot>`. The authored native compiler rejects
component content and the `slot` attribute. Its factory receives only props;
`Astro.slots` is rejected by the global rewrite. Actual CLI probes reject both
an outlet and a component with content before replacing an existing facade.

The independent SSR `h` snapshots ordinary props and invokes native component
factories. Its positional children protocol replaces a `children` prop. Astro
slots must use a separate channel: authored `children` and `slots` props must
remain ordinary props, including identity, enumeration and destructuring.

The installed MIT `@astrojs/compiler` 4.0.0 emits a separate slot map of functions
for component content. It removes named-slot markers from projected elements.
An empty named Fragment still supplies a slot function. Its slot-outlet output
passes a fallback template separately from the supplied slot.

The [official component documentation](https://docs.astro.build/en/basics/astro-components/#slots)
distinguishes absent content from an explicitly empty supplied slot: only
absence selects fallback content. Named content belongs to the immediate
component child; forwarding uses both `name` and `slot` on an outlet.

## Timing must be verified, not inferred

A supplied slot function defers its expressions until the outlet renders it.
Unused supplied slots must not run their expressions. The
[reference slot renderer](https://github.com/withastro/astro/blob/main/packages/astro/src/runtime/server/render/slot.ts)
invokes a function when rendering each outlet; it does not establish a blanket
memoization contract for all component kinds.

Fallback timing differs. For `<slot>{record("fallback")}</slot>`, the compiler
places the expression in the fallback template argument. JavaScript evaluates
that interpolation when constructing the template, even when a supplied slot
exists. This does **not** prove that every nested fallback component executes:
component render instances have their own deferred behavior. Making all fallback
work eager or all fallback work lazy would lose this distinction.

Existing native SSR helpers (`defer`, `scopeSSRChild`, `serializeSSRChild`) may
provide the necessary evaluation and owner boundaries. Verify those boundaries
before changing `h`; they are not evidence of Astro slot compatibility by
themselves. Do not add a second parser in Moonshine.

## Required source-to-runtime acceptance

- Default and named outlets, absent fallback and explicitly empty supplied slots.
- A layout with an ordinary `children` prop, ordinary `slots` prop, object/callback
  prop identity and slot content simultaneously; no carrier leaks into props.
- Callee frontmatter, surrounding markup, slot expressions and fallback
  expressions recorded in order. Unused slots, repeated outlets and nested
  fallback components need independent reference traces.
- Named groups containing multiple elements, an empty named Fragment and slot
  forwarding through two imported layouts. Marker attributes must not leak.
- Defined handling of duplicate names, dynamic names, conditionally supplied
  content and special property names such as `__proto__` and `toString`.
- Nested components retain the correct native SSR owner/context and escaping;
  async content continues to reject explicitly in the synchronous lane.
- Actual CLI module graphs execute in isolated Bun and minified Node consumers,
  pass both public typecheck lanes and retain ordinary no-slot factory behavior.
  Unsupported variants must reject before output replacement.

Parsing/grouping/lowering belongs in Crepuscularity. Moonshine should supply only
the smallest independent SSR runtime contract needed by those emitted modules.
`Astro.slots.render()` has an asynchronous host contract and must not be silently
mapped onto a synchronous helper. Slots, async SSR and hydration remain open work.
