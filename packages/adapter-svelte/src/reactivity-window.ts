/** Independent Svelte 5 svelte/reactivity/window reactive values on the Moonshine graph. */
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import { ReactiveValue } from "./reactivity";

function inBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    !isSSRRendering() &&
    peekComponentContext()?.mode !== "ssr"
  );
}

function onWindow(
  events: string | readonly string[],
  handler: () => void,
): () => void {
  if (!inBrowser() || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const list = typeof events === "string" ? [events] : events;
  for (const event of list) {
    window.addEventListener(event, handler, { passive: true });
  }
  return () => {
    if (
      typeof window === "undefined" ||
      typeof window.removeEventListener !== "function"
    ) {
      return;
    }
    for (const event of list) {
      window.removeEventListener(event, handler);
    }
  };
}

function trackScreenPosition(
  read: () => number | undefined,
): (update: () => void) => () => void {
  return (update) => {
    if (!inBrowser()) return () => {};
    let prev = read();
    let frameId: number | undefined;
    let stopped = false;
    const check = () => {
      if (stopped) return;
      const next = read();
      if (!Object.is(next, prev)) {
        prev = next;
        update();
      }
    };
    const loop = () => {
      if (stopped) return;
      check();
      if (
        typeof window !== "undefined" &&
        typeof window.requestAnimationFrame === "function"
      ) {
        frameId = window.requestAnimationFrame(loop);
      }
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      frameId = window.requestAnimationFrame(loop);
    }
    const offResize = onWindow("resize", check);
    return () => {
      stopped = true;
      offResize();
      if (
        frameId !== undefined &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(frameId);
      }
    };
  };
}

/** Reactive view of `window.innerWidth`; `undefined` on the server. */
export const innerWidth: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.innerWidth : undefined),
  (update) => onWindow("resize", update),
);

/** Reactive view of `window.innerHeight`; `undefined` on the server. */
export const innerHeight: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.innerHeight : undefined),
  (update) => onWindow("resize", update),
);

/** Reactive view of `window.outerWidth`; `undefined` on the server. */
export const outerWidth: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.outerWidth : undefined),
  (update) => onWindow("resize", update),
);

/** Reactive view of `window.outerHeight`; `undefined` on the server. */
export const outerHeight: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.outerHeight : undefined),
  (update) => onWindow("resize", update),
);

/** Reactive view of `window.screenLeft`, updated via `requestAnimationFrame`; `undefined` on the server. */
export const screenLeft: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.screenLeft : undefined),
  trackScreenPosition(() => (inBrowser() ? window.screenLeft : undefined)),
);

/** Reactive view of `window.screenTop`, updated via `requestAnimationFrame`; `undefined` on the server. */
export const screenTop: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.screenTop : undefined),
  trackScreenPosition(() => (inBrowser() ? window.screenTop : undefined)),
);

/** Reactive view of `window.scrollX`; `undefined` on the server. */
export const scrollX: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.scrollX : undefined),
  (update) => onWindow("scroll", update),
);

/** Reactive view of `window.scrollY`; `undefined` on the server. */
export const scrollY: ReactiveValue<number | undefined> = new ReactiveValue(
  () => (inBrowser() ? window.scrollY : undefined),
  (update) => onWindow("scroll", update),
);

/** Reactive view of `navigator.onLine`; `undefined` on the server. */
export const online: ReactiveValue<boolean | undefined> = new ReactiveValue(
  () =>
    inBrowser() && typeof navigator !== "undefined"
      ? navigator.onLine
      : undefined,
  (update) => onWindow(["online", "offline"], update),
);

/** Reactive view of `window.devicePixelRatio`; `undefined` on the server. */
export const devicePixelRatio: { readonly current: number | undefined } =
  new ReactiveValue(
    () => (inBrowser() ? window.devicePixelRatio : undefined),
    (update) => {
      if (!inBrowser()) return () => {};
      let cleanupMedia: (() => void) | undefined;
      const listenMedia = () => {
        cleanupMedia?.();
        cleanupMedia = undefined;
        if (typeof window.matchMedia !== "function") return;
        const dpr = window.devicePixelRatio;
        if (typeof dpr !== "number" || !Number.isFinite(dpr)) return;
        const mql = window.matchMedia(`(resolution: ${dpr}dppx)`);
        if (!mql || typeof mql.addEventListener !== "function") return;
        mql.addEventListener("change", onChange, { once: true });
        cleanupMedia = () => {
          mql.removeEventListener("change", onChange);
        };
      };
      const onChange = () => {
        update();
        listenMedia();
      };
      listenMedia();
      const offResize = onWindow("resize", onChange);
      return () => {
        offResize();
        cleanupMedia?.();
      };
    },
  );
