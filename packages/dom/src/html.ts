/** Explicit unsanitized markup. Default native children continue to escape text. */
import { createRenderEffect, getOwner, onCleanup } from "./reactive";

export function rawHTML(
  read: () => unknown,
  namespace: "html" | "svg" | "mathml" = "html",
): () => Node[] {
  if (typeof read !== "function")
    throw new TypeError("rawHTML requires a getter");
  if (namespace !== "html" && namespace !== "svg" && namespace !== "mathml")
    throw new TypeError("Unsupported raw HTML namespace");
  let previous: unknown = "";
  let nodes: Node[] = [];
  return () => {
    const value = read() ?? "";
    if (previous === value) return nodes;
    const template = document.createElement("template");
    let container: Element | DocumentFragment = template.content;
    if (namespace !== "html") {
      container = document.createElementNS(
        namespace === "svg"
          ? "http://www.w3.org/2000/svg"
          : "http://www.w3.org/1998/Math/MathML",
        namespace === "svg" ? "svg" : "math",
      );
      template.content.appendChild(container);
    }
    // Assign directly: coercing here would discard TrustedHTML identity.
    (namespace === "html" ? template : (container as Element)).innerHTML =
      value as string;
    nodes = Array.from(container.childNodes);
    previous = value;
    return nodes;
  };
}

/** Own the complete contents of a fresh sole-child element, including final cleanup. */
export function htmlContent(element: Element, read: () => unknown): void {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("htmlContent requires a live native owner");
  if (!(element instanceof Element) || typeof read !== "function")
    throw new TypeError("htmlContent requires an element and getter");
  let previous: unknown = "";
  onCleanup(() => element.replaceChildren());
  createRenderEffect(() => {
    const value = read() ?? "";
    if (previous === value) return;
    element.innerHTML = value as string;
    previous = value;
  });
}
