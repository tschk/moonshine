/** Independent Svelte 5 `svelte/transition` helpers (`fade`, `blur`, `fly`, `slide`, `scale`, `draw`, `crossfade`). */
import { cubicInOut, cubicOut, linear } from "./easing";

export type EasingFunction = (t: number) => number;

export interface TransitionConfig {
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
  css?: (t: number, u: number) => string;
  tick?: (t: number, u: number) => void;
}

export interface BlurParams {
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
  amount?: number | string;
  opacity?: number;
}

export interface FadeParams {
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
}

export interface FlyParams {
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
  x?: number | string;
  y?: number | string;
  opacity?: number;
}

export interface SlideParams {
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
  axis?: "x" | "y";
}

export interface ScaleParams {
  delay?: number;
  duration?: number;
  easing?: EasingFunction;
  start?: number;
  opacity?: number;
}

export interface DrawParams {
  delay?: number;
  speed?: number;
  duration?: number | ((len: number) => number);
  easing?: EasingFunction;
}

export interface CrossfadeParams {
  delay?: number;
  duration?: number | ((len: number) => number);
  easing?: EasingFunction;
  fallback?: (
    node: Element,
    params: CrossfadeParams,
    intro: boolean,
  ) => TransitionConfig;
}

function splitCssUnit(value: number | string): [number, string] {
  const split =
    typeof value === "string" && value.match(/^\s*(-?[\d.]+)([^\s]*)\s*$/);
  return split
    ? [Number.parseFloat(split[1]!), split[2]! || "px"]
    : [Number(value), "px"];
}

function getElementStyle(
  node: Element,
): CSSStyleDeclaration | Record<string, string> {
  if (typeof getComputedStyle === "function") {
    try {
      return getComputedStyle(node);
    } catch {
      // Fallback for synthetic/detached elements in test environments
    }
  }
  return (node as HTMLElement).style ?? {};
}

export function fade(
  node: Element,
  { delay = 0, duration = 400, easing = linear }: FadeParams = {},
): TransitionConfig {
  const style = getElementStyle(node);
  const o = Number(style.opacity || 1);
  return {
    delay,
    duration,
    easing,
    css: (t) => `opacity: ${t * o}`,
  };
}

export function blur(
  node: Element,
  {
    delay = 0,
    duration = 400,
    easing = cubicInOut,
    amount = 5,
    opacity = 0,
  }: BlurParams = {},
): TransitionConfig {
  const style = getElementStyle(node);
  const targetOpacity = Number(style.opacity || 1);
  const f = style.filter === "none" || !style.filter ? "" : `${style.filter} `;
  const od = targetOpacity * (1 - opacity);
  const [value, unit] = splitCssUnit(amount);
  return {
    delay,
    duration,
    easing,
    css: (_t, u) =>
      `opacity: ${targetOpacity - od * u}; filter: ${f}blur(${u * value}${unit});`,
  };
}

export function fly(
  node: Element,
  {
    delay = 0,
    duration = 400,
    easing = cubicOut,
    x = 0,
    y = 0,
    opacity = 0,
  }: FlyParams = {},
): TransitionConfig {
  const style = getElementStyle(node);
  const targetOpacity = Number(style.opacity || 1);
  const transform =
    style.transform === "none" || !style.transform ? "" : `${style.transform} `;
  const od = targetOpacity * (1 - opacity);
  const [xValue, xUnit] = splitCssUnit(x);
  const [yValue, yUnit] = splitCssUnit(y);
  return {
    delay,
    duration,
    easing,
    css: (t, u) =>
      `
      transform: ${transform}translate(${(1 - t) * xValue}${xUnit}, ${(1 - t) * yValue}${yUnit});
      opacity: ${targetOpacity - od * u}
    `.trim(),
  };
}

export function slide(
  node: Element,
  {
    delay = 0,
    duration = 400,
    easing = cubicOut,
    axis = "y",
  }: SlideParams = {},
): TransitionConfig {
  const style = getElementStyle(node);
  const opacity = Number(style.opacity || 1);
  const primaryProperty = axis === "y" ? "height" : "width";
  const primaryValue = Number.parseFloat(style[primaryProperty] || "0") || 0;
  const secondaryProperties =
    axis === "y" ? ["top", "bottom"] : ["left", "right"];
  const capitalizedSecondary = secondaryProperties.map(
    (e) =>
      `${e[0]!.toUpperCase()}${e.slice(1)}` as
        "Top" | "Bottom" | "Left" | "Right",
  );
  const paddingStartValue =
    Number.parseFloat(style[`padding${capitalizedSecondary[0]}`] || "0") || 0;
  const paddingEndValue =
    Number.parseFloat(style[`padding${capitalizedSecondary[1]}`] || "0") || 0;
  const marginStartValue =
    Number.parseFloat(style[`margin${capitalizedSecondary[0]}`] || "0") || 0;
  const marginEndValue =
    Number.parseFloat(style[`margin${capitalizedSecondary[1]}`] || "0") || 0;
  const borderWidthStartValue =
    Number.parseFloat(style[`border${capitalizedSecondary[0]}Width`] || "0") ||
    0;
  const borderWidthEndValue =
    Number.parseFloat(style[`border${capitalizedSecondary[1]}Width`] || "0") ||
    0;

  return {
    delay,
    duration,
    easing,
    css: (t) =>
      `overflow: hidden; opacity: ${Math.min(t * 20, 1) * opacity}; ${primaryProperty}: ${t * primaryValue}px; padding-${secondaryProperties[0]}: ${t * paddingStartValue}px; padding-${secondaryProperties[1]}: ${t * paddingEndValue}px; margin-${secondaryProperties[0]}: ${t * marginStartValue}px; margin-${secondaryProperties[1]}: ${t * marginEndValue}px; border-${secondaryProperties[0]}-width: ${t * borderWidthStartValue}px; border-${secondaryProperties[1]}-width: ${t * borderWidthEndValue}px; min-${primaryProperty}: 0`,
  };
}

export function scale(
  node: Element,
  {
    delay = 0,
    duration = 400,
    easing = cubicOut,
    start = 0,
    opacity = 0,
  }: ScaleParams = {},
): TransitionConfig {
  const style = getElementStyle(node);
  const targetOpacity = Number(style.opacity || 1);
  const transform =
    style.transform === "none" || !style.transform ? "" : `${style.transform} `;
  const sd = 1 - start;
  const od = targetOpacity * (1 - opacity);
  return {
    delay,
    duration,
    easing,
    css: (_t, u) =>
      `
      transform: ${transform}scale(${1 - sd * u});
      opacity: ${targetOpacity - od * u}
    `.trim(),
  };
}

export function draw(
  node: SVGElement & { getTotalLength(): number },
  { delay = 0, speed, duration, easing = cubicInOut }: DrawParams = {},
): TransitionConfig {
  let len = node.getTotalLength();
  const style = getElementStyle(node);
  if (style.strokeLinecap !== "butt") {
    len += Number.parseInt(style.strokeWidth || "0", 10) || 0;
  }
  let resolvedDuration: number;
  if (duration === undefined) {
    if (speed === undefined) {
      resolvedDuration = 800;
    } else {
      resolvedDuration = len / speed;
    }
  } else if (typeof duration === "function") {
    resolvedDuration = duration(len);
  } else {
    resolvedDuration = duration;
  }
  return {
    delay,
    duration: resolvedDuration,
    easing,
    css: (_t, u) =>
      `
      stroke-dasharray: ${len};
      stroke-dashoffset: ${u * len};
    `.trim(),
  };
}

export function crossfade({ fallback, ...defaults }: CrossfadeParams = {}): [
  (
    node: Element,
    params: CrossfadeParams & { key: any },
  ) => () => TransitionConfig,
  (
    node: Element,
    params: CrossfadeParams & { key: any },
  ) => () => TransitionConfig,
] {
  const toReceive = new Map<any, Element>();
  const toSend = new Map<any, Element>();

  function getCrossfade(
    fromNode: Element,
    node: Element,
    params: CrossfadeParams,
  ): TransitionConfig {
    const {
      delay = 0,
      duration = (d: number) => Math.sqrt(d) * 30,
      easing = cubicOut,
    } = { ...defaults, ...params };

    const from =
      typeof fromNode.getBoundingClientRect === "function"
        ? fromNode.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0 };
    const to =
      typeof node.getBoundingClientRect === "function"
        ? node.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0 };
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const dw = to.width ? from.width / to.width : 1;
    const dh = to.height ? from.height / to.height : 1;
    const d = Math.hypot(dx, dy);

    const style = getElementStyle(node);
    const transform =
      style.transform === "none" || !style.transform
        ? ""
        : `${style.transform} `;
    const opacity = Number(style.opacity || 1);

    return {
      delay,
      duration: typeof duration === "function" ? duration(d) : duration,
      easing,
      css: (t, u) =>
        `
        opacity: ${t * opacity};
        transform-origin: top left;
        transform: ${transform}translate(${u * dx}px,${u * dy}px) scale(${t + (1 - t) * dw}, ${t + (1 - t) * dh});
      `.trim(),
    };
  }

  function transition(
    items: Map<any, Element>,
    counterparts: Map<any, Element>,
    intro: boolean,
  ) {
    return (node: Element, params: CrossfadeParams & { key: any }) => {
      items.set(params.key, node);
      return (): TransitionConfig => {
        if (counterparts.has(params.key)) {
          const otherNode = counterparts.get(params.key)!;
          counterparts.delete(params.key);
          return getCrossfade(otherNode, node, params);
        }
        items.delete(params.key);
        if (fallback) {
          return fallback(node, params, intro);
        }
        return {};
      };
    };
  }

  return [
    transition(toSend, toReceive, false),
    transition(toReceive, toSend, true),
  ];
}
