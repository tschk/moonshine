"use client";

/**
 * Next.js Client Component surface.
 * Use only from files with `"use client"`. App Router owns routing.
 */
export * from "@tschk/moonshine/host-react";

export {
  createResource,
  createIslandSignal,
  useResource,
} from "@tschk/moonshine/host-react";

/**
 * SSR-friendly signal read for Client Components.
 * Pass `serverValue` when the server rendered a known initial.
 */
export { useSignal as useClientSignal } from "@tschk/moonshine/host-react";
