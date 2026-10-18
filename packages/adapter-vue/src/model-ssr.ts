/** Compiler-facing server form models; no DOM or directive runtime. */
import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";
import { equalModelValue } from "./model-equality";
export function createServerTextModel(
  tag: "input" | "textarea",
  props: Record<string, unknown>,
  read: () => unknown,
): SSRChild {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props)) attributes[key] = () => props[key];
  const value = read();
  if (tag === "textarea" || value != null) attributes.value = value;
  return h(tag, attributes);
}

/** Checkbox/radio SSR follows the source model policy, including scalar truthiness. */
export function createServerCheckedModel(
  type: "checkbox" | "radio",
  props: Record<string, unknown>,
  read: () => unknown,
  // Vue source SSR treats fallthrough roots differently from nested inputs.
  nested = false,
): SSRChild {
  const attributes: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(props))
    if (!nested || (key !== "true-value" && key !== "false-value"))
      attributes[key] = () => props[key];
  attributes.type = type;
  const model = read();
  if (type === "radio")
    attributes.checked = equalModelValue(model, props.value);
  else if (nested && "true-value" in props) {
    if (equalModelValue(model, props["true-value"])) attributes.checked = true;
  } else if (Array.isArray(model)) {
    if (model.some((value) => equalModelValue(value, props.value)))
      attributes.checked = true;
  } else if (model || model === "") attributes.checked = true;
  return h("input", attributes);
}
