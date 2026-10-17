/** Dependency collection for opt-in schedulers; no renderer or scheduling policy. */
export { collectDeps, isTracking } from "./signal";
export type { Trackable } from "./signal";

export { subscribeInvalidation } from "./signal";
export type { InvalidationObserver } from "./signal";

export { trackDependency } from "./signal";

export { hasValueDemand } from "./signal";
