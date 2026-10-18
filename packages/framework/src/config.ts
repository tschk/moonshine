import type { RouteDataRequests } from "./data-request";
import type { RenderMode, RuntimeTarget } from "./routes";

export type MoonshineConfig = {
  mode?: RenderMode;
  runtime?: RuntimeTarget;
  requestContext?: boolean;
  /** Enable the opt-in JSON route-data request protocol. */
  dataRequests?: RouteDataRequests;
};

export function defineConfig<T extends MoonshineConfig>(config: T): T {
  return config;
}
