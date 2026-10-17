import { isRef } from "./reactive";
const baseString = Object.prototype.toString;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";
function symbolText(value: unknown, fallback: string | number = ""): unknown {
  return typeof value === "symbol"
    ? "Symbol(" + (value.description ?? fallback) + ")"
    : value;
}
function jsonValue(_key: string, value: unknown): unknown {
  if (isRef(value)) return jsonValue("", value.value);
  if (baseString.call(value) === "[object Map]") {
    const map = value as Map<unknown, unknown>,
      label = `Map(${map.size})`,
      entries: Record<string, unknown> = {};
    let index = 0;
    // Gather before coercing keys so iterator failures retain precedence.
    const pairs = [...map.entries()];
    // Concatenation deliberately preserves the default primitive hint for object keys.
    for (const [key, item] of pairs)
      entries[(symbolText(key, index++) as string) + " =>"] = item;
    return { [label]: entries };
  }
  if (baseString.call(value) === "[object Set]") {
    const set = value as Set<unknown>;
    return {
      [`Set(${set.size})`]: [...set.values()].map((item) => symbolText(item)),
    };
  }
  if (typeof value === "symbol") return symbolText(value);
  if (
    object(value) &&
    !Array.isArray(value) &&
    baseString.call(value) !== "[object Object]"
  )
    return String(value);
  return value;
}
/** Opt-in native Vue interpolation conversion; no HTML is produced. */
export function toDisplayString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (
    Array.isArray(value) ||
    (object(value) &&
      (value.toString === baseString || typeof value.toString !== "function"))
  ) {
    if (isRef(value)) return toDisplayString(value.value);
    return JSON.stringify(value, jsonValue, 2);
  }
  return String(value);
}
/** SSR interpolation stringifies the helper result before the renderer escapes it. */
export function toDisplayStringSSR(value: unknown): string {
  return String(toDisplayString(value));
}
