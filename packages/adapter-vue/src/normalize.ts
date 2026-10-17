import { isReactive } from "./reactive";
type StyleRecord = Record<string, unknown>;
export function normalizeClass(value: unknown): string {
  if (typeof value === "string") return value.trim();
  let result = "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const part = normalizeClass(item);
      if (part) result += part + " ";
    }
  } else if (value !== null && typeof value === "object") {
    for (const key in value)
      if ((value as Record<string, unknown>)[key]) result += key + " ";
  }
  return result.trim();
}
// Vue's narrow declaration normalizer, not a CSS validator/parser: it deliberately
// does not interpret quotes and preserves the reference's recovery behavior.
function declarations(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/;(?![^(]*\))/g)) {
    const colon = declaration.indexOf(":");
    if (colon !== -1 && colon < declaration.length - 1) {
      Object.defineProperty(result, declaration.slice(0, colon).trim(), {
        value: declaration.slice(colon + 1).trim(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return result;
}
type StyleEntry<T> = unknown extends T
  ? unknown
  : T extends string
    ? string
    : T extends readonly unknown[]
      ? StyleEntry<T[number]>
      : T extends object
        ? T[keyof T]
        : never;
type NormalizedStyle<T> = unknown extends T
  ? string | StyleRecord | undefined
  : T extends (...args: never[]) => unknown
    ? undefined
    : T extends readonly unknown[]
      ? Record<string, StyleEntry<T[number]>>
      : T extends string | object
        ? T
        : undefined;
export function normalizeStyle<T>(value: T): NormalizedStyle<T>;
export function normalizeStyle(
  value: unknown,
): string | StyleRecord | undefined {
  if (Array.isArray(value)) {
    const result: StyleRecord = {};
    for (const item of value) {
      const style =
        typeof item === "string" ? declarations(item) : normalizeStyle(item);
      if (style && typeof style !== "string")
        for (const key in style) {
          Object.defineProperty(result, key, {
            value: style[key],
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
    }
    return result;
  }
  if (
    typeof value === "string" ||
    (value !== null && typeof value === "object")
  )
    return value as string | StyleRecord;
}
export function normalizeStaticStyle(value: string): Record<string, string> {
  return declarations(value);
}

// Compiler-facing VNode policies differ from the public normalization utilities.
export function normalizeClassSSR<T>(
  value: T,
): T extends object ? string : T | string {
  return (
    value && typeof value !== "string" ? normalizeClass(value) : value
  ) as T extends object ? string : T | string;
}
function copyReactive<T>(value: T): T {
  if (isReactive(value) && !Array.isArray(value)) return { ...value } as T;
  return value;
}
export function normalizeStyleDOM<T>(value: T): NormalizedStyle<T> {
  return copyReactive(normalizeStyle(value));
}
type VNodeStyle<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? NormalizedStyle<T>
    : T;
export function normalizeStyleSSR<T>(value: T): VNodeStyle<T> {
  return (
    value !== null && typeof value === "object"
      ? normalizeStyle(copyReactive(value))
      : value
  ) as VNodeStyle<T>;
}
