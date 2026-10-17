import { createRawSnippet } from "@tschk/moonshine-svelte/raw-snippet";
import { invokeRawDOM } from "@tschk/moonshine-svelte/raw-snippet-dom";
import { invokeRawSSR } from "@tschk/moonshine-svelte/raw-snippet-ssr";
import type { Snippet } from "@tschk/moonshine-svelte/svelte";
import type { ComponentContext } from "@tschk/moonshine-dom/component";
const snippet = createRawSnippet<[number]>((read) => ({
  render: () => String(read()),
  setup(element) {
    element.textContent = String(read());
  },
}));
const source: Snippet<[number]> = snippet;
declare const consumer: ComponentContext;
declare const typecheckOnly: boolean;
if (typecheckOnly) {
  invokeRawDOM(snippet, [{ value: 2 }], consumer, true, undefined);
  invokeRawSSR(snippet, [2], consumer);
  source(2);
  // @ts-expect-error Source values are not compiler DOM cells.
  invokeRawDOM(snippet, [2], consumer, true, undefined);
  // @ts-expect-error Private getter cells are not authored snippet parameters.
  source({ value: 2 });
}
if (typecheckOnly) {
  // @ts-expect-error Compiler must explicitly supply the captured consumer scheduler.
  invokeRawDOM(snippet, [{ value: 2 }], consumer, true);
}
