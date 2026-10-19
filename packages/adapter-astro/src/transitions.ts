/** Independent host-free Astro View Transitions animations, navigation, and DOM swap helpers. */

export interface TransitionAnimation {
  name: string;
  delay?: number | string;
  duration?: number | string;
  easing?: string;
  fillMode?: string;
  direction?: string;
}

export interface TransitionAnimationPair {
  old: TransitionAnimation | TransitionAnimation[];
  new: TransitionAnimation | TransitionAnimation[];
}

export interface TransitionDirectionalAnimations {
  forwards: TransitionAnimationPair;
  backwards: TransitionAnimationPair;
}

export interface AnimationOptions {
  duration?: string | number;
}

export type Direction = "forward" | "back";

export interface NavigationOptions {
  history?: "auto" | "push" | "replace";
  formData?: FormData;
  info?: unknown;
  state?: unknown;
  sourceElement?: Element;
}

export const TRANSITION_BEFORE_PREPARATION = "astro:before-preparation";
export const TRANSITION_AFTER_PREPARATION = "astro:after-preparation";
export const TRANSITION_BEFORE_SWAP = "astro:before-swap";
export const TRANSITION_AFTER_SWAP = "astro:after-swap";
export const TRANSITION_PAGE_LOAD = "astro:page-load";

const EASE_IN_OUT_CUBIC = "cubic-bezier(0.76, 0, 0.24, 1)";

function formatCssTime(
  value: number | string | undefined,
  fallback: string,
): string {
  if (value === undefined) return fallback;
  return typeof value === "number" ? `${value}ms` : value;
}

export function fade(
  opts: AnimationOptions = {},
): TransitionDirectionalAnimations {
  const { duration } = opts;
  const oldAnim: TransitionAnimation = {
    name: "astroFadeOut",
    duration: duration ?? "90ms",
    easing: EASE_IN_OUT_CUBIC,
    fillMode: "both",
  };
  const newAnim: TransitionAnimation = {
    name: "astroFadeIn",
    duration: duration ?? "210ms",
    easing: EASE_IN_OUT_CUBIC,
    delay: duration ? undefined : "30ms",
    fillMode: "both",
  };
  return {
    forwards: { old: oldAnim, new: newAnim },
    backwards: { old: oldAnim, new: newAnim },
  };
}

export function slide(
  opts: AnimationOptions = {},
): TransitionDirectionalAnimations {
  const { duration } = opts;
  return {
    forwards: {
      old: [
        {
          name: "astroFadeOut",
          duration: duration ?? "90ms",
          easing: EASE_IN_OUT_CUBIC,
          fillMode: "both",
        },
        {
          name: "astroSlideToLeft",
          duration: duration ?? "220ms",
          easing: EASE_IN_OUT_CUBIC,
          fillMode: "both",
        },
      ],
      new: [
        {
          name: "astroFadeIn",
          duration: duration ?? "210ms",
          easing: EASE_IN_OUT_CUBIC,
          delay: duration ? undefined : "30ms",
          fillMode: "both",
        },
        {
          name: "astroSlideFromRight",
          duration: duration ?? "220ms",
          easing: EASE_IN_OUT_CUBIC,
          fillMode: "both",
        },
      ],
    },
    backwards: {
      old: [{ name: "astroFadeOut" }, { name: "astroSlideToRight" }],
      new: [{ name: "astroFadeIn" }, { name: "astroSlideFromLeft" }],
    },
  };
}

export function none(): TransitionDirectionalAnimations {
  const pair: TransitionAnimationPair = {
    old: {
      name: "none",
      duration: 0,
      easing: "linear",
      fillMode: "both",
    },
    new: {
      name: "none",
      duration: 0,
      easing: "linear",
      fillMode: "both",
    },
  };
  return {
    forwards: pair,
    backwards: pair,
  };
}

function serializeAnimations(
  anim: TransitionAnimation | TransitionAnimation[],
): string {
  const list = Array.isArray(anim) ? anim : [anim];
  return list
    .map((item) => {
      const duration = formatCssTime(item.duration, "180ms");
      const easing = item.easing ?? EASE_IN_OUT_CUBIC;
      const delay =
        item.delay !== undefined ? ` ${formatCssTime(item.delay, "0ms")}` : "";
      const direction = item.direction ? ` ${item.direction}` : "";
      const fillMode = item.fillMode ? ` ${item.fillMode}` : " both";
      return `${duration} ${easing}${delay}${direction}${fillMode} ${item.name}`;
    })
    .join(", ");
}

let scopeCounter = 0;

export function createAnimationScope(
  name: string,
  animations: TransitionDirectionalAnimations,
  scopeId?: string,
): {
  scope: string;
  styles: string;
  attributes: {
    "data-astro-transition-scope": string;
  };
} {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-") || "element";
  const scope = scopeId ?? `astro-${safeName}-${++scopeCounter}`;
  const fwdOld = serializeAnimations(animations.forwards.old);
  const fwdNew = serializeAnimations(animations.forwards.new);
  const bwdOld = serializeAnimations(animations.backwards.old);
  const bwdNew = serializeAnimations(animations.backwards.new);
  const styles =
    `[data-astro-transition-scope="${scope}"] { view-transition-name: ${scope}; }` +
    `@layer astro { ` +
    `::view-transition-old(${scope}) { animation: ${fwdOld}; } ` +
    `::view-transition-new(${scope}) { animation: ${fwdNew}; } ` +
    `[data-astro-transition=back] ::view-transition-old(${scope}) { animation: ${bwdOld}; } ` +
    `[data-astro-transition=back] ::view-transition-new(${scope}) { animation: ${bwdNew}; } ` +
    `}`;
  return {
    scope,
    styles,
    attributes: {
      "data-astro-transition-scope": scope,
    },
  };
}

export function transition(opts: {
  name?: string;
  animate?:
    "initial" | "none" | "fade" | "slide" | TransitionDirectionalAnimations;
}): Record<string, string> {
  const name = opts.name ?? "element";
  const anim =
    opts.animate === "none"
      ? none()
      : opts.animate === "slide"
        ? slide()
        : typeof opts.animate === "object" && opts.animate !== null
          ? opts.animate
          : fade();
  const { scope } = createAnimationScope(name, anim);
  return {
    "data-astro-transition-scope": scope,
  };
}

export const supportsViewTransitions: boolean =
  typeof document !== "undefined" && "startViewTransition" in document;

export function isTransitionEnabled(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector('meta[name="astro-view-transitions-enabled"]'),
  );
}

export const swapFunctions = {
  deselectScripts(newDocument: Document): void {
    const existingKeys = new Set<string>();
    if (typeof document !== "undefined") {
      for (const s of Array.from(document.scripts)) {
        if (s.dataset.astroExec === "" && s.src) {
          existingKeys.add(s.src);
        }
      }
    }
    for (const s of Array.from(newDocument.scripts)) {
      if (s.src && existingKeys.has(s.src)) {
        s.dataset.astroExec = "";
      }
    }
  },

  swapRootAttributes(newDocument: Document): void {
    if (typeof document === "undefined") return;
    const currentRoot = document.documentElement;
    const incomingRoot = newDocument.documentElement;
    const direction = currentRoot.getAttribute("data-astro-transition");
    for (const attr of Array.from(currentRoot.attributes)) {
      currentRoot.removeAttribute(attr.name);
    }
    for (const attr of Array.from(incomingRoot.attributes)) {
      currentRoot.setAttribute(attr.name, attr.value);
    }
    if (direction) {
      currentRoot.setAttribute("data-astro-transition", direction);
    }
  },

  swapHeadElements(newDocument: Document): void {
    if (typeof document === "undefined") return;
    document.title = newDocument.title;
  },

  saveFocus(): () => void {
    if (typeof document === "undefined") return () => {};
    const activeElement = document.activeElement as HTMLElement | null;
    return () => {
      if (
        activeElement &&
        typeof activeElement.focus === "function" &&
        document.contains(activeElement)
      ) {
        activeElement.focus();
      }
    };
  },

  swapBodyElement(newBody: Element, oldBody: Element): void {
    oldBody.replaceWith(newBody);
  },

  swap(newDocument: Document): void {
    if (typeof document === "undefined") return;
    swapFunctions.deselectScripts(newDocument);
    swapFunctions.swapRootAttributes(newDocument);
    swapFunctions.swapHeadElements(newDocument);
    const restoreFocus = swapFunctions.saveFocus();
    swapFunctions.swapBodyElement(newDocument.body, document.body);
    restoreFocus();
  },
};

export async function navigate(
  href: string,
  options: NavigationOptions = {},
): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const base = window.location?.href ?? "http://localhost/";
  const to = new URL(href, base);
  const from = new URL(base);
  const direction: Direction = "forward";
  const historyMode =
    options.history === "replace"
      ? "replace"
      : options.history === "push"
        ? "push"
        : to.href === from.href
          ? "replace"
          : "push";

  const beforePrep = new CustomEvent(TRANSITION_BEFORE_PREPARATION, {
    cancelable: true,
    detail: {
      from,
      to,
      direction,
      navigationType: historyMode,
      sourceElement: options.sourceElement,
      info: options.info,
      formData: options.formData,
    },
  });
  if (!document.dispatchEvent(beforePrep)) {
    return;
  }

  document.dispatchEvent(new Event(TRANSITION_AFTER_PREPARATION));

  const performSwap = () => {
    const beforeSwap = new CustomEvent(TRANSITION_BEFORE_SWAP, {
      cancelable: false,
      detail: {
        from,
        to,
        direction,
        navigationType: historyMode,
        sourceElement: options.sourceElement,
        info: options.info,
      },
    });
    document.dispatchEvent(beforeSwap);

    if (typeof window.history !== "undefined") {
      if (
        historyMode === "replace" &&
        typeof window.history.replaceState === "function"
      ) {
        window.history.replaceState(
          options.state ?? {},
          "",
          to.pathname + to.search + to.hash,
        );
      } else if (typeof window.history.pushState === "function") {
        window.history.pushState(
          options.state ?? {},
          "",
          to.pathname + to.search + to.hash,
        );
      }
    }

    document.dispatchEvent(new Event(TRANSITION_AFTER_SWAP));
  };

  const docWithVT = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => {
      finished: Promise<void>;
    };
  };

  if (typeof docWithVT.startViewTransition === "function") {
    const vt = docWithVT.startViewTransition(performSwap);
    await vt.finished;
  } else {
    performSwap();
  }

  document.dispatchEvent(new Event(TRANSITION_PAGE_LOAD));
}
