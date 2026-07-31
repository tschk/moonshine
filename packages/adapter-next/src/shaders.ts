"use client";

/**
 * WebGL fragment helpers (moonshine shaders) under the Next adapter path.
 *
 * ```ts
 * import { useFragmentShader } from "@tschk/moonshine-next/shaders";
 * ```
 */
export {
  createFullscreenFragment,
  useFragmentShader,
  wrapFragmentSource,
} from "@tschk/moonshine-shaders";
export type {
  FragmentShaderHandle,
  UseFragmentShaderOptions,
} from "@tschk/moonshine-shaders";
