# Native element references

Crepuscularity owns source parsing and lowering. Moonshine supplies the opt-in
DOM and Svelte runtime helpers described here; the signal-only entry is unchanged.

`@tschk/moonshine-dom/dom` exports `hNS(namespace, tag, props, ...children)`.
It creates HTML or SVG elements from the compiler's lexical namespace, including
SVG `a`/`title`, HTML inside `foreignObject`, and nested SVG. An authored `xmlns`
attribute does not change an element's creation namespace. Imported components
retain their own namespace decisions. Ordinary `h` retains its existing behavior.

`@tschk/moonshine-svelte/binding` exports the compiler-facing `bindThis` helper.
It requires a live native owner and Rune scheduler. References publish before
that element's actions. Cleanup preserves teardown reads, respects replacement
references, and clears the captured path after its owning source branch or
component is destroyed. Path tuples and element setters retain their types;
getters may read a broader cell that another reference has replaced.

Use a Crepuscularity build that emits these helpers and source-effect markers.
This does not support arbitrary precompiled Svelte components. Server element
references are validated and erased by the compiler. Source SVG SSR, intrinsic
spreads, and Solid compiler instructions remain unsupported.

The admission checks cover original authored reference components, namespace and
node identity, keyed reordering, action/destroy order, two-instance isolation,
both strict typecheck lanes, and fresh SSR requests. They do not establish full
Svelte coverage or a performance improvement.
