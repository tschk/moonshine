import type { MoonshineManifest } from "./manifest";
import type { RouteDefinition, RuntimeTarget } from "./routes";

export type DeploymentAdapter = {
  name: string;
  runtimes: RuntimeTarget[];
  capabilities: MoonshineManifest["capabilities"];
  build(manifest: MoonshineManifest, outDir: string): Promise<void>;
};

export function defineRoute<T extends RouteDefinition>(route: T): T {
  return route;
}
