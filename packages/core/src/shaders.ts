/**
 * Compat re-export — prefer `@tschk/moonshine-shaders`.
 * Kept so existing `@tschk/moonshine/shaders` imports keep working.
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
