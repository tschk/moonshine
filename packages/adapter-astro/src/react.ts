"use client";

/**
 * @astrojs/react helpers live in the host app; this path is moonshine+react for islands.
 */
export * from "@tschk/moonshine/host-react";
export {
  createFullscreenFragment,
  useFragmentShader,
  wrapFragmentSource,
} from "@tschk/moonshine-shaders";
