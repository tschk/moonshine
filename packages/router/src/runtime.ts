import { batch, createSignal, type Signal } from "@tschk/moonshine";

/**
 * The location the signal carries: pathname plus query.
 *
 * The query has to be in the signal, not read off `window.location` at render
 * time. A navigation that changes only the query would otherwise write the
 * same pathname back, notify no subscriber, and leave every `useSearchParams`
 * caller rendering the previous query — a tab bar driven by `?section=` would
 * change the URL and not the page. The hash stays out: it is still pushed to
 * history and retained in its own fragment signal; including it here would
 * corrupt the query when consumers split on the first "?".
 */
export function getBrowserPath(): string {
  if (typeof window === "undefined") return "/";
  return (window.location.pathname || "/") + window.location.search;
}

/** Splits `"/a/b?x=1"` into its pathname and its raw query string. */
export function splitLocation(location: string): [string, string] {
  const index = location.indexOf("?");
  return index === -1
    ? [location, ""]
    : [location.slice(0, index), location.slice(index + 1)];
}

export type HistorySnapshot = {
  action: "POP" | "PUSH" | "REPLACE";
  state: unknown;
};

export type MoonshineRouterInstance = {
  /** Optional opt-in data runtime; absent on navigation-only routers. */
  invalidate?: () => Promise<unknown>;
  data?: {
    peek(): { status: "pending" | "ready" | "errored" };
    subscribe(listener: () => void): () => void;
  };
  /** Navigate via History API (no full reload). */
  navigate: (
    to: string,
    options?: { replace?: boolean; state?: unknown },
  ) => void;
  /** Current pathname and query (reactive signal). */
  getLocation: () => string;
  /** Subscribe-friendly location signal, carrying pathname and query. */
  location: Signal<string>;
  /** Reactive history metadata, including same-path state-only navigation. */
  history: Signal<HistorySnapshot>;
  /** Current fragment including #, independently owned from path/query. */
  fragment: Signal<string>;
  /** Sync signals from browser location and history (a POP navigation). */
  syncFromBrowser: () => void;
};

/** Create an isolated router runtime (no shared global path). */
export function createMoonshineRouter(
  initialPath = getBrowserPath() +
    (typeof window === "undefined" ? "" : window.location.hash),
): MoonshineRouterInstance {
  const origin =
    typeof window === "undefined"
      ? "http://moonshine.invalid"
      : window.location.origin;
  const initial = new URL(initialPath, origin);
  const location = createSignal(initial.pathname + initial.search);
  const fragment = createSignal(initial.hash);
  const history = createSignal<{
    action: "POP" | "PUSH" | "REPLACE";
    state: unknown;
  }>({
    action: "POP",
    state: typeof window === "undefined" ? null : window.history.state,
  });

  const syncFromBrowser = () => {
    batch(() => {
      history.set({
        action: "POP",
        state: typeof window === "undefined" ? null : window.history.state,
      });
      location.set(getBrowserPath());
      fragment.set(typeof window === "undefined" ? "" : window.location.hash);
    });
  };

  const navigate = (
    to: string,
    options?: { replace?: boolean; state?: unknown },
  ) => {
    const url = new URL(to, new URL(location.peek(), origin));
    const nextLocation = url.pathname + url.search;
    const state = options?.state ?? null;
    if (typeof window !== "undefined") {
      const href = url.pathname + url.search + url.hash;
      if (options?.replace) window.history.replaceState(state, "", href);
      else window.history.pushState(state, "", href);
    }
    batch(() => {
      history.set({ action: options?.replace ? "REPLACE" : "PUSH", state });
      location.set(nextLocation);
      fragment.set(url.hash);
    });
  };

  return {
    navigate,
    getLocation: () => location(),
    location,
    history,
    fragment,
    syncFromBrowser,
  };
}
