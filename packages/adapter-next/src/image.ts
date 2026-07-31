/**
 * `next/image` as a plain `<img>`.
 *
 * There is no image optimizer behind moonshine, so `src` is served as authored
 * and the layout props map onto native attributes.
 *
 * ```ts
 * import Image from "@tschk/moonshine-next/image";
 * ```
 */
import {
  createElement,
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

export type ImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height" | "loading"
> & {
  src: string | { src: string; width?: number; height?: number };
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  loading?: "eager" | "lazy";
  unoptimized?: boolean;
};

const FILL_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  priority,
  quality,
  loading,
  unoptimized,
  style,
  ...rest
}: ImageProps): ReactNode {
  void quality;
  void unoptimized;
  const resolved = typeof src === "string" ? { src } : src;
  return createElement("img", {
    ...rest,
    src: resolved.src,
    alt,
    width: fill ? undefined : (width ?? resolved.width),
    height: fill ? undefined : (height ?? resolved.height),
    loading: loading ?? (priority ? "eager" : "lazy"),
    decoding: priority ? "sync" : "async",
    fetchPriority: priority ? "high" : undefined,
    style: fill ? { ...FILL_STYLE, ...style } : style,
  });
}
