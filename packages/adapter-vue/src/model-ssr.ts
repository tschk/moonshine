/** Compiler-facing server text models; no DOM or directive runtime. */
import { h, type SSRChild } from "@tschk/moonshine-dom/ssr";
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
