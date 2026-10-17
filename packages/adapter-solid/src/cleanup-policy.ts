import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { retainRoot, solidCleanupPolicy } from "./cleanup-finalization";
import { cleanupOrderKey } from "@tschk/moonshine-dom/reactive";
import {
  getOwner,
  createRoot as nativeRoot,
} from "@tschk/moonshine-dom/reactive";
import {
  render as nativeRender,
  type DOMChild,
} from "@tschk/moonshine-dom/dom";
export function install() {
  const owner = getOwner();
  if (!owner || owner.disposed) throw Error("live owner");
  if (isSSRRendering() || peekComponentContext()?.mode === "ssr") {
    if (owner.context?.has(cleanupOrderKey)) {
      owner.context = new Map(owner.context);
      owner.context.delete(cleanupOrderKey);
    }
    return;
  }
  owner.context = new Map(owner.context);
  owner.context.set(cleanupOrderKey, solidCleanupPolicy);
}
export function createRoot<T>(fn: (stop: () => void) => T): T {
  return nativeRoot((stop) => {
    install();
    return fn(stop);
  });
}
export function render(fn: () => DOMChild, node: Element | ShadowRoot) {
  return nativeRender(() => {
    install();
    const value = fn();
    retainRoot(value);
    return value;
  }, node);
}
