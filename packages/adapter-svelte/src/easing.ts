/** Independent host-free Svelte easing functions (`svelte/easing`). */

export type EasingFunction = (t: number) => number;

export function linear(t: number): number {
  return t;
}

export function backInOut(t: number): number {
  const s = 1.70158 * 1.525;
  if ((t *= 2) < 1) {
    return 0.5 * (t * t * ((s + 1) * t - s));
  }
  return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
}

export function backIn(t: number): number {
  const s = 1.70158;
  return t * t * ((s + 1) * t - s);
}

export function backOut(t: number): number {
  const s = 1.70158;
  return --t * t * ((s + 1) * t + s) + 1;
}

export function bounceOut(t: number): number {
  const a = 4.0 / 11.0;
  const b = 8.0 / 11.0;
  const c = 9.0 / 10.0;

  const ca = 4356.0 / 361.0;
  const cb = 35442.0 / 1805.0;
  const cc = 16061.0 / 1805.0;

  const t2 = t * t;

  return t < a
    ? 7.5625 * t2
    : t < b
      ? 9.075 * t2 - 9.9 * t + 3.4
      : t < c
        ? ca * t2 - cb * t + cc
        : 10.8 * t * t - 20.52 * t + 10.72;
}

export function bounceInOut(t: number): number {
  return t < 0.5
    ? 0.5 * (1.0 - bounceOut(1.0 - t * 2.0))
    : 0.5 * bounceOut(t * 2.0 - 1.0) + 0.5;
}

export function bounceIn(t: number): number {
  return 1.0 - bounceOut(1.0 - t);
}

export function circInOut(t: number): number {
  if ((t *= 2) < 1) {
    return -0.5 * (Math.sqrt(1 - t * t) - 1);
  }
  return 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1);
}

export function circIn(t: number): number {
  return 1.0 - Math.sqrt(1.0 - t * t);
}

export function circOut(t: number): number {
  return Math.sqrt(1 - --t * t);
}

export function cubicInOut(t: number): number {
  return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
}

export function cubicIn(t: number): number {
  return t * t * t;
}

export function cubicOut(t: number): number {
  const f = t - 1.0;
  return f * f * f + 1.0;
}

export function elasticInOut(t: number): number {
  return t < 0.5
    ? 0.5 *
        Math.sin(((+13.0 * Math.PI) / 2) * 2.0 * t) *
        Math.pow(2.0, 10.0 * (2.0 * t - 1.0))
    : 0.5 *
        (Math.sin(((-13.0 * Math.PI) / 2) * (2.0 * t - 1.0 + 1.0)) *
          Math.pow(2.0, -10.0 * (2.0 * t - 1.0)) +
          2.0);
}

export function elasticIn(t: number): number {
  return Math.sin((13.0 * t * Math.PI) / 2) * Math.pow(2.0, 10.0 * (t - 1.0));
}

export function elasticOut(t: number): number {
  return (
    Math.sin((-13.0 * (t + 1.0) * Math.PI) / 2) * Math.pow(2.0, -10.0 * t) + 1.0
  );
}

export function expoInOut(t: number): number {
  return t === 0.0 || t === 1.0
    ? t
    : t < 0.5
      ? +0.5 * Math.pow(2.0, 20.0 * t - 10.0)
      : -0.5 * Math.pow(2.0, 10.0 - t * 20.0) + 1.0;
}

export function expoIn(t: number): number {
  return t === 0.0 ? t : Math.pow(2.0, 10.0 * (t - 1.0));
}

export function expoOut(t: number): number {
  return t === 1.0 ? t : 1.0 - Math.pow(2.0, -10.0 * t);
}

export function quadInOut(t: number): number {
  t /= 0.5;
  if (t < 1) return 0.5 * t * t;
  t--;
  return -0.5 * (t * (t - 2) - 1);
}

export function quadIn(t: number): number {
  return t * t;
}

export function quadOut(t: number): number {
  return -t * (t - 2.0);
}

export function quartInOut(t: number): number {
  return t < 0.5
    ? +8.0 * Math.pow(t, 4.0)
    : -8.0 * Math.pow(t - 1.0, 4.0) + 1.0;
}

export function quartIn(t: number): number {
  return Math.pow(t, 4.0);
}

export function quartOut(t: number): number {
  return Math.pow(t - 1.0, 3.0) * (1.0 - t) + 1.0;
}

export function quintInOut(t: number): number {
  if ((t *= 2) < 1) return 0.5 * t * t * t * t * t;
  return 0.5 * ((t -= 2) * t * t * t * t + 2);
}

export function quintIn(t: number): number {
  return t * t * t * t * t;
}

export function quintOut(t: number): number {
  return --t * t * t * t * t + 1;
}

export function sineInOut(t: number): number {
  return -0.5 * (Math.cos(Math.PI * t) - 1);
}

export function sineIn(t: number): number {
  const v = Math.cos(t * Math.PI * 0.5);
  if (Math.abs(v) < 1e-14) return 1;
  return 1 - v;
}

export function sineOut(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}
