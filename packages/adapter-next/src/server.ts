/**
 * Server-safe helpers for Next.js (RSC / route handlers).
 * No client hooks, no signals UI bridge.
 */
export {
  createMoonshineServer,
  definePage,
  handleMoonshineRequest,
  resolvePage,
  toMoonshineRequest,
} from "@tschk/moonshine/server";
export type {
  MoonshinePageModule,
  MoonshineRequest,
  MoonshineServer,
  MoonshineServerOptions,
} from "@tschk/moonshine/server";
