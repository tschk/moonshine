"use client";

/**
 * Next Client Component surface: moonshine signals + resources.
 * Stack libraries live on subpaths: `/navigation`, `/link`, `/image`, `/shaders`.
 */
export * from "@tschk/moonshine/host-react";

export {
  createIslandSignal,
  createResource,
  useResource,
} from "@tschk/moonshine/host-react";
