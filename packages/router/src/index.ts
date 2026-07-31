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
  createMoonshineRouter,
  navigate,
  getLocation,
  useLocation,
  useParams,
  useNavigate,
  useRouter,
  MoonshineRouter,
  Link,
  safeHref,
} from "./navigation.js";
export type {
  MoonshineRouterInstance,
  MoonshineRouterProps,
  MoonshineRouteDefinition,
} from "./navigation.js";
