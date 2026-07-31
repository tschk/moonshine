/**
 * Server surface for react-router apps on moonshine: the loader/action
 * response helpers plus moonshine's request handling.
 */
export {
  ErrorResponse,
  data,
  isRouteErrorResponse,
  json,
  redirect,
  redirectDocument,
  replace,
} from "./responses";

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
} from "@tschk/moonshine/server";
