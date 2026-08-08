import type { MoonshineManifest } from "./manifest";
import type { RouteDefinition, RuntimeTarget } from "./routes";

export type DeploymentAdapter = {
  name: string;
  runtimes: RuntimeTarget[];
  capabilities: MoonshineManifest["capabilities"];
  build(manifest: MoonshineManifest, outDir: string): Promise<void>;
};

/**
 * A running instance of an adapter, used to exercise it end to end.
 *
 * This lives here rather than in the conformance suite because every deploy
 * package exports a harness as part of its public API (`nodeHarness`,
 * `bunHarness`, ...). With the type owned by the test suite, each of those
 * packages had to declare the suite — fixtures and all — as a production
 * `dependency` purely to name a type, so installing an adapter installed its
 * own test tooling. The suite still owns the tests; the framework owns the
 * shape the adapters implement.
 */
export type Harness = {
  start(): Promise<URL>;
  stop(): Promise<void>;
};

export type HarnessFactory = (
  fetch: (request: Request) => Promise<Response>,
  options: { manifest: MoonshineManifest; staticDir: string },
) => Harness;

export function defineRoute<T extends RouteDefinition>(route: T): T {
  return route;
}
