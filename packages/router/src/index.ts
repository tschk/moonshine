export { compilePattern, matchPath } from "./pattern.js";
export type {
  CompiledPattern,
  MatchResult,
  RouteParams,
  Segment,
  SegmentKind,
} from "./pattern.js";

export { createRouteGraph, matchRoutes } from "./graph.js";
export type { RouteGraph, RouteMatch } from "./graph.js";

export {
  navigate,
  getLocation,
  useLocation,
  useHistory,
  useParams,
  useNavigate,
  useRouter,
  MoonshineRouter,
  isExternal,
  Link,
  safeHref,
} from "./navigation.js";
export type {
  MoonshineRouterProps,
  MoonshineRouteDefinition,
} from "./navigation.js";

export { createMoonshineRouter, splitLocation } from "./runtime.js";
export type { MoonshineRouterInstance, HistorySnapshot } from "./runtime.js";
