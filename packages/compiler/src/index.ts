export { analyzeModule, type ModuleFacts } from "./analyze.js";
export {
  classifyRoute,
  type ClassificationInput,
  type ModeDecision,
} from "./classify.js";
export {
  discoverRoutes,
  type DiscoverOptions,
  type RouteConvention,
  segmentToPattern,
} from "./discover.js";
export { mergeRoutes } from "./inherit.js";
export { buildProject, readManifest, type BuildOptions } from "./manifest.js";
