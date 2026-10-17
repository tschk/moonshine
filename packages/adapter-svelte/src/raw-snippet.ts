const rawSnippet = /* @__PURE__ */ Symbol("moonshine raw snippet");
export type RawSnippetFactory<P extends unknown[]> = (
  ...getters: { [K in keyof P]: () => P[K] }
) => { render(): string; setup?: (element: Element) => unknown };
/** Tagged source callable; direct execution rejects until @render is compiler-lowered. */
export interface RawSnippet<P extends unknown[] = []> {
  (...values: number extends P["length"] ? never : P): unknown;
  readonly [rawSnippet]: RawSnippetFactory<P>;
}
export function createRawSnippet<P extends unknown[]>(
  factory: RawSnippetFactory<P>,
): RawSnippet<P> {
  if (typeof factory !== "function")
    throw new TypeError("Raw snippet requires a factory");
  const snippet = (
    ..._values: number extends P["length"] ? never : P
  ): never => {
    throw new Error("Raw snippets require compiler-lowered @render invocation");
  };
  return Object.assign(snippet, { [rawSnippet]: factory });
}
/** Internal compiler adapter validation, not a source invocation API. */
export function getRawSnippetFactory<P extends unknown[]>(
  snippet: RawSnippet<P>,
): RawSnippetFactory<P> {
  if (!snippet || typeof snippet[rawSnippet] !== "function")
    throw new TypeError("Expected native raw snippet descriptor");
  return snippet[rawSnippet];
}
/** Internal dynamic @render discrimination; ordinary source snippets are untagged. */
export function isRawSnippet(value: unknown): value is RawSnippet<unknown[]> {
  return (
    typeof value === "function" &&
    typeof (value as RawSnippet<unknown[]>)[rawSnippet] === "function"
  );
}
