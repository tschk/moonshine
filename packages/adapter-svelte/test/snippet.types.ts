import type { Snippet } from "../src/svelte";

declare const empty: Snippet;
declare const heading: Snippet<[string, number?]>;
declare const unsupportedRest: Snippet<string[]>;

empty();
heading("title");
heading("title", 2);
// @ts-expect-error required argument
heading();
// @ts-expect-error wrong argument type
heading(1);
// @ts-expect-error no extra arguments
empty("extra");
// @ts-expect-error rest parameters are unsupported
unsupportedRest("title");
