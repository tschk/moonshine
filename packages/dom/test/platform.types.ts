/* eslint-disable no-shadow-restricted-names -- Deliberate namespace capture exercises compiler type hygiene. */
import { sourceRealm, type GlobalTypes } from "../src/platform";
export function globalThis() {}
export namespace globalThis {
  export type Parameters<T> = { captured: T };
  export type ReturnType<T> = { captured: T };
  export type Iterable<T> = { captured: T };
  export type ArrayLike<T> = { captured: T };
  export type Element = { captured: true };
}
type BuiltinParameters = GlobalTypes.Parameters<
  (text: string, count: number) => void
>;
const args: BuiltinParameters = ["text", 1];
const result: GlobalTypes.ReturnType<() => number> = 1;
const iterable: GlobalTypes.Iterable<number> = [1];
const arrayLike: GlobalTypes.ArrayLike<string> = { 0: "text", length: 1 };
declare const element: GlobalTypes.Element;
const name: string = element.tagName;
type IsAny<T> = 0 extends 1 & T ? true : false;
const noAny: IsAny<BuiltinParameters> = false;
// @ts-expect-error Generated parameters retain the real utility type.
const wrong: BuiltinParameters = [1, "text"];
// @ts-expect-error Generated members retain their declared types.
const wrongArray: GlobalTypes.ArrayLike<string> = { 0: 1, length: 1 };
const object: object = sourceRealm().Object.create(null);
void [
  args,
  result,
  iterable,
  arrayLike,
  name,
  noAny,
  wrong,
  wrongArray,
  object,
];
