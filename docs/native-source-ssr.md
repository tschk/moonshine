# Native source SSR

`@tschk/moonshine-dom/ssr` exports `hSource` for compiler-emitted intrinsic
nodes. It shares the existing SSR child, escaping, ownership and form-binding
contracts. Component calls continue to use `h`.

Source attributes distinguish literal strings from dynamic accessor results.
Literal strings retain their authored values; dynamic boolean attributes use
presence semantics. Attribute reads and string coercion happen before lazy child
setup, including when a getter or coercion throws. Nullish ordinary input values
are omitted. This codec follows the pinned Svelte 5.57.1 reference behavior for
the tested source slice; generic `h` retains its existing attribute contract.

The matching Crepuscularity compiler candidate has passed the source SSR,
component-context, typed each, browser and 850-module regression suites. It is
not yet integrated into the live Crepuscularity checkout or published. Existing
published compilers do not automatically gain these source behaviors.

That candidate supports source-witnessed `svg`, `g`, `foreignObject`, `title`
and existing HTML `a` handling. Generic JSX SVG, other SVG elements, raw HTML in
a known SVG namespace and intrinsic spreads remain unsupported. This is not
full Svelte component ABI, hydration or async SSR compatibility.

The source comparisons cover 74 records across ten cohorts and two fresh
processes per cohort. Function-valued attributes are checked against each
process's actual function string; their compiler-generated source text is not
required to match. Retained-callback context errors are checked against each
runtime's exact diagnostic before comparison.

The measured default signal kernel is unchanged at 4,041 bytes minified,
1,671 gzip and 1,545 Brotli. The generic SSR consumer costs an additional
233 minified bytes, 76 gzip and 59 Brotli. These are bundle measurements,
not evidence that Moonshine is universally smallest or fastest.
