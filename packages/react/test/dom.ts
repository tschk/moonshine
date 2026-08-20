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

export async function cleanup(): Promise<void> {
  await act(async () => {
    for (const root of mounted.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
}
