import { sourceAttributeValue } from "@tschk/moonshine-dom/attributes";
import { classValue } from "./class";
import {
  hAttributeEntries,
  hSelectionEntries,
  type SSRChild,
} from "@tschk/moonshine-dom/ssr";

const ATTRIBUTE_NAME = /^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/;

/** Compiler-owned form spread; selection retains source identity through lazy SSR children. */
export function spreadServerElement(
  tag: "input" | "textarea" | "select" | "option",
  layers: readonly unknown[],
  ...children: SSRChild[]
): SSRChild {
  const merged = merge(layers);
  if (tag === "select") {
    const { value, defaultValue, ...rest } = merged;
    return hSelectionEntries(
      "select",
      entriesFromMerged(rest),
      {
        value: value === undefined ? defaultValue : value,
        preserveSelected: true,
      },
      ...children,
    );
  }
  if (tag === "option" && Object.hasOwn(merged, "value"))
    return hSelectionEntries(
      "option",
      entriesFromMerged(merged),
      { value: merged.value },
      ...children,
    );
  return hAttributeEntries(
    tag,
    entriesFromMerged(merged, tag === "input" ? "input" : undefined),
    ...children,
  );
}

/**
 * Ordinary HTML intrinsic spread for compiler-owned `hAttributeEntries` output.
 * Layers merge eagerly like JS object spread, so each getter runs exactly once.
 * Pass `"input"` for input defaults; other form elements need their own lowering.
 */
export function spreadServerEntries(
  layers: readonly unknown[],
  element?: "input",
): readonly (readonly [string, string | undefined])[] {
  return entriesFromMerged(merge(layers), element);
}

function merge(layers: readonly unknown[]): Record<string, unknown> {
  // A null prototype keeps `__proto__` and inherited names ordinary data.
  const merged: Record<string | symbol, unknown> = Object.create(null);
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    if (layer != null) Object.assign(merged, layer);
  }
  return merged;
}

function entriesFromMerged(
  merged: Record<string, unknown>,
  element?: "input",
): readonly (readonly [string, string | undefined])[] {
  const entries: Array<readonly [string, string | undefined]> = [];
  const keys = Object.keys(merged);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]!;
    const value = merged[key];
    // Functions, event handlers and internal or invalid names are never attributes.
    if (typeof value === "function" || !ATTRIBUTE_NAME.test(key)) continue;
    if (/^on/i.test(key)) continue;
    let name = key.toLowerCase();
    if (
      element === "input" &&
      (name === "defaultvalue" || name === "defaultchecked")
    ) {
      name = name === "defaultvalue" ? "value" : "checked";
      // Presence wins even for nullish values, functions and differently cased keys.
      if (keys.some((candidate) => candidate.toLowerCase() === name)) continue;
    }
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
