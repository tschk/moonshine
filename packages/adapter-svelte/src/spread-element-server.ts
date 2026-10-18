import { sourceAttributeValue } from "@tschk/moonshine-dom/attributes";
import { classValue } from "./class";

const ATTRIBUTE_NAME = /^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/;

/**
 * Ordinary HTML intrinsic spread for compiler-owned `hAttributeEntries` output.
 * Layers merge eagerly like JS object spread, so each getter runs exactly once.
 */
export function spreadServerEntries(
  layers: readonly unknown[],
): readonly (readonly [string, string | undefined])[] {
  // A null prototype keeps `__proto__` and inherited names ordinary data.
  const merged: Record<string | symbol, unknown> = Object.create(null);
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    if (layer != null) Object.assign(merged, layer);
  }
  const entries: Array<readonly [string, string | undefined]> = [];
  const keys = Object.keys(merged);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]!;
    const value = merged[key];
    // Functions, event handlers and internal or invalid names are never attributes.
    if (typeof value === "function" || !ATTRIBUTE_NAME.test(key)) continue;
    if (/^on/i.test(key)) continue;
    const name = key.toLowerCase();
    entries.push([
      name,
      sourceAttributeValue(
        name,
        key === "class" ? classValue(value) : value,
        true,
      ),
    ]);
  }
  return entries;
}
