import { bindThis } from "../src/binding";
import type { ComponentReference } from "@tschk/moonshine-dom/component-instance";

declare const div: HTMLDivElement, span: HTMLSpanElement;
declare const element: Element | null, node: Node | null, object: object;
declare const unknownValue: unknown;
for (const read of [
  () => element,
  () => node,
  () => object,
  () => unknownValue,
]) {
  bindThis(div, {
    get: read,
    set(value) {
      const exact: HTMLDivElement | null = value;
      type IsAny<T> = 0 extends 1 & T ? true : false;
      const noAny: IsAny<typeof value> = false;
      void [exact, noAny];
    },
  });
}
bindThis(span, {
  parts: () => [1, "a"] as const,
  get: (_id: number, _key: string) => unknownValue,
  set: (_value: HTMLSpanElement | null, _id: number, _key: string) => {},
});
// @ts-expect-error A span cannot be written through an input-only setter.
bindThis(span, {
  get: () => element,
  set: (_value: HTMLInputElement | null) => {},
});
bindThis(div, {
  parts: () => [1] as const,
  get: (_id: number) => element,
  // @ts-expect-error Setter path arguments retain the authored tuple types.
  set: (_value: HTMLDivElement | null, _id: string) => {},
});
bindThis(div, {
  parts: () => [1] as const,
  // @ts-expect-error Getter path arguments retain the authored tuple types.
  get: (_id: string) => element,
  set: (_value: HTMLDivElement | null, _id: number) => {},
});

declare const reference: ComponentReference<{ id: string }>;
const current: { id: string } | null | undefined = reference.get();
void current;
