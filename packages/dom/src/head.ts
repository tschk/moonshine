/** Opt-in document head declarations; title writes persist after owner disposal. */
import { render, type DOMChild } from "./dom";
import { createRenderEffect, getOwner, onCleanup } from "./reactive";
import { isSSRRendering } from "./ssr-owner";
import { peekComponentContext, withComponentConsumer } from "./component";

function requireOwner(): void {
  const owner = getOwner();
  if (!owner || owner.disposed || isSSRRendering())
    throw new Error("DOM head declarations require a live browser owner");
}

/** Mount only this owner's head nodes, preserving unrelated document content. */
export function head(children: () => DOMChild): undefined {
  requireOwner();
  let stop: (() => void) | undefined;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    stop?.();
  });
  stop = render(children, document.head);
  // Child setup may dispose the containing component before render returns.
  if (disposed) stop();
}

/** Update the document title; removing a declaration does not restore an older title. */
export function title(read: () => string): undefined {
  requireOwner();
  const consumer = peekComponentContext();
  createRenderEffect(() => {
    document.title = consumer ? withComponentConsumer(consumer, read) : read();
  });
}
