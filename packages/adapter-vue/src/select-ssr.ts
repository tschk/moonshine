/** Compiler-facing option selection; source SSR differs from mounted select policy. */
import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";
import { equalModelValue } from "./model-equality";

export function createServerModelOption(
  props: Record<string, unknown>,
  children: SSRChild,
  read: () => unknown,
): SSRChild {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props))
    if (key !== "value") attributes[key] = () => props[key];
  const value = "value" in props ? props.value : null;
  if (value != null && ["string", "number", "boolean"].includes(typeof value))
    attributes.value = value;
  const model = read();
  if (
    Array.isArray(model)
      ? model.some((entry) => equalModelValue(entry, value))
      : equalModelValue(model, value)
  )
    attributes.selected = true;
  return h("option", attributes, children);
}
