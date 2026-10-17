import { render, type DOMChild } from "@tschk/moonshine-dom/dom";
import { getOwner, onCleanup } from "@tschk/moonshine-dom/reactive";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { acquirePortalDocument, portalHosts } from "./events";
export function Portal(props: {
  mount?: Element;
  children?: DOMChild;
  isSVG?: boolean;
  useShadow?: boolean;
}): Text | undefined {
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") return;
  if (!getOwner() || getOwner()!.disposed)
    throw Error("Portal requires a live native owner");
  const mount = props.mount ?? document.body;
  if (mount.ownerDocument !== document)
    onCleanup(acquirePortalDocument(mount.ownerDocument));
  const marker = document.createTextNode("");
  if (mount.localName === "head") {
    let stop: (() => void) | undefined;
    let disposed = false;
    onCleanup(() => {
      disposed = true;
      stop?.();
    });
    stop = render(() => props.children, mount);
    if (disposed) stop();
    return marker;
  }
  const container = props.isSVG
    ? document.createElementNS("http://www.w3.org/2000/svg", "g")
    : document.createElement("div");
  portalHosts.set(container, () => marker.parentNode);
  let stop: (() => void) | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    try {
      stop?.();
    } finally {
      portalHosts.delete(container);
      container.remove();
    }
  });
  const renderRoot =
    props.useShadow && container.attachShadow
      ? container.attachShadow({ mode: "open" })
      : container;
  stop = render(() => props.children, renderRoot);
  // Child setup can dispose the parent before this root's disposer is available.
  if (disposed) stop();
  else mount.appendChild(container);
  return marker;
}

export { h } from "./portal-h";
