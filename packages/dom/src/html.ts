/** Explicit unsanitized markup. Default native children continue to escape text. */
import { createRenderEffect, getOwner, onCleanup } from "./reactive";

let customSanitizer: ((html: string) => unknown) | undefined;

/** Register a global sanitizer function to process HTML strings before insertion. */
export function setHTMLSanitizer(sanitizer: (html: string) => unknown): void {
  customSanitizer = sanitizer;
}

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
    const wrapper =
      namespace === "html"
        ? document.createElement("template")
        : document.createElementNS(
            namespace === "svg"
              ? "http://www.w3.org/2000/svg"
              : "http://www.w3.org/1998/Math/MathML",
            namespace === "svg" ? "svg" : "math",
          );
    const content = customSanitizer ? customSanitizer(value as string) : value;
    // Assign directly: coercing here would discard TrustedHTML identity.
    wrapper.innerHTML = content as string;
    nodes = Array.from(
      (namespace === "html"
        ? (wrapper as HTMLTemplateElement).content
        : wrapper
      ).childNodes,
    );
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
    const content = customSanitizer ? customSanitizer(value as string) : value;
    element.innerHTML = content as string;
    previous = value;
  });
}
