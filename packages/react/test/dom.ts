import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

/**
 * `bun test` shares one process across files, so registering happy-dom leaks
 * its browser implementations into every other suite: its `Request` strips
 * forbidden headers like `Cookie`, and its streams are not the ones SSR
 * renderers write to. Keep the DOM, put Bun's platform globals back.
 */
const keepNative = [
  "Request",
  "Response",
  "Headers",
  "fetch",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "TextEncoder",
  "TextDecoder",
  "AbortController",
  "AbortSignal",
  "Blob",
  "FormData",
  "URL",
  "URLSearchParams",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
] as const;

if (!("happyDOM" in globalThis)) {
  const scope = globalThis as unknown as Record<string, unknown>;
  const native = Object.fromEntries(keepNative.map((key) => [key, scope[key]]));
  GlobalRegistrator.register({ url: "https://example.com/start" });
  Object.assign(scope, native);
}

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { unmount(): void }[] = [];

/** Mounts `element` into a fresh detached container and flushes effects. */
export async function render(element: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return container;
}

/**
 * Unmounts every root from the current test. Without this, trees left
 * subscribed to the router signal re-render on the next test's navigation.
 */
export async function cleanup(): Promise<void> {
  await act(async () => {
    for (const root of mounted.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
}

/**
 * Dispatches a real bubbling click so React's root listener runs, and reports
 * whether the handler claimed the event.
 *
 * A document-level guard records `defaultPrevented` and then cancels the event
 * regardless, so happy-dom does not follow un-intercepted anchors and leave the
 * document on a URL later tests cannot navigate from.
 */
export async function click(
  node: Element,
  init: MouseEventInit = {},
): Promise<{ defaultPrevented: boolean }> {
  let defaultPrevented = false;
  const guard = (event: Event): void => {
    defaultPrevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", guard);
  try {
    await act(async () => {
      node.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ...init,
        }),
      );
    });
  } finally {
    document.removeEventListener("click", guard);
  }
  return { defaultPrevented };
}

/** Resets the document location between navigation assertions. */
export function setLocation(url: string): void {
  window.history.replaceState({}, "", new URL(url, "https://example.com").href);
}