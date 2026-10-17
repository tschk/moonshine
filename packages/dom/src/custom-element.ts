/** Opt-in compiler writes for HTML custom elements; ordinary h props are unchanged. */
import { runWithOwner, untrack } from "./reactive";

export function setCustomElementValue(
  node: HTMLElement,
  name: string,
  value: unknown,
): void {
  if (
    node.namespaceURI !== "http://www.w3.org/1999/xhtml" ||
    !node.localName.includes("-")
  )
    throw new TypeError(
      "Custom element values require a hyphenated HTML element",
    );
  if (typeof name !== "string" || /^on/i.test(name))
    throw new TypeError("Custom element events must use event listeners");
  // Let the DOM validate names, including names outside ASCII, before setters run.
  node.ownerDocument.createAttribute(name);
  runWithOwner(null, () =>
    untrack(() => {
      const lower = name.toLowerCase();
      const attributeOnly =
        lower === "style" ||
        lower === "innerhtml" ||
        lower === "outerhtml" ||
        lower === "textcontent" ||
        lower === "innertext" ||
        lower === "__proto__";
      let property = false;
      if (!attributeOnly) {
        const view = node.ownerDocument.defaultView;
        if (view?.customElements.get(node.localName)) {
          const boundary = view.Element.prototype;
          for (
            let proto: object | null = node;
            proto && proto !== boundary;
            proto = Object.getPrototypeOf(proto)
          ) {
            if (Object.getOwnPropertyDescriptor(proto, name)?.set) {
              property = true;
              break;
            }
          }
        } else property = value !== null && typeof value === "object";
      }
      if (property) {
        if (!Reflect.set(node, name, value))
          throw new TypeError(`Cannot set custom element property ${name}`);
      } else if (value == null) node.removeAttribute(name);
      else node.setAttribute(name, String(value));
    }),
  );
}
