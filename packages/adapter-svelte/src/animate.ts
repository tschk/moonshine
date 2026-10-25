/** Independent Svelte 5 `svelte/animate` FLIP animation helper (`flip`). */
import { cubicOut } from "./easing";

export interface AnimationConfig {
  delay?: number;
  duration?: number;
  easing?: (t: number) => number;
  css?: (t: number, u: number) => string;
  tick?: (t: number, u: number) => void;
}

export interface FlipParams {
  delay?: number;
  duration?: number | ((len: number) => number);
  easing?: (t: number) => number;
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

export function flip(
  node: Element,
  {
    from,
    to,
  }: {
    from:
      DOMRect | { left: number; top: number; width: number; height: number };
    to: DOMRect | { left: number; top: number; width: number; height: number };
  },
  params: FlipParams = {},
): AnimationConfig {
  const style = getElementStyle(node);
  const transform =
    style.transform === "none" || !style.transform ? "" : `${style.transform} `;

  const {
    delay = 0,
    duration = (d: number) => Math.sqrt(d) * 120,
    easing = cubicOut,
  } = params;

  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const dsx = to.width ? from.width / to.width : 1;
  const dsy = to.height ? from.height / to.height : 1;
  const d = Math.hypot(dx, dy);

  return {
    delay,
    duration: typeof duration === "function" ? duration(d) : duration,
    easing,
    css: (_t, u) => {
      const x = u * dx;
      const y = u * dy;
      const sx = dsx + (1 - dsx) * (1 - u);
      const sy = dsy + (1 - dsy) * (1 - u);
      return `transform: ${transform}translate(${x}px, ${y}px) scale(${sx}, ${sy});`;
    },
  };
}
