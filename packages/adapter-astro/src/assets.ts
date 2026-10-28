/** Independent host-free Astro assets & image optimization helpers (`astro:assets`). */
import type { ImageMetadata } from "./content";
import { classList, h, type SSRChild } from "./ssr";

export type ImageInputFormat =
  "jpeg" | "jpg" | "png" | "tiff" | "webp" | "gif" | "svg" | "avif";

export type ImageOutputFormat =
  "avif" | "png" | "webp" | "jpeg" | "jpg" | "svg" | "gif";

export type ImageQualityPreset = "low" | "mid" | "high" | "max";
export type ImageQuality = ImageQualityPreset | number;

export type ImageFit =
  "fill" | "contain" | "cover" | "none" | "scale-down" | (string & {});

export interface UnresolvedImageTransform {
  src:
    | string
    | ImageMetadata
    | Promise<ImageMetadata | { default: ImageMetadata }>;
  width?: number | `${number}`;
  height?: number | `${number}`;
  widths?: number[];
  densities?: (number | `${number}x`)[];
  sizes?: string;
  format?: ImageOutputFormat;
  quality?: ImageQuality;
  fit?: ImageFit;
  position?: string;
  alt?: string;
  loading?: "lazy" | "eager" | null;
  decoding?: "async" | "sync" | "auto" | null;
  priority?: boolean;
  [key: string]: any;
}

export interface ImageProps extends Omit<UnresolvedImageTransform, "src"> {
  src: string | ImageMetadata | { default: ImageMetadata };
  alt: string;
}

export interface PictureProps extends ImageProps {
  formats?: ImageOutputFormat[];
  fallbackFormat?: ImageOutputFormat;
  pictureAttributes?: Record<string, any>;
}

export interface ResolvedImageTransform extends Omit<
  UnresolvedImageTransform,
  "src" | "width" | "height"
> {
  src: string | ImageMetadata;
  width?: number;
  height?: number;
}

export interface SrcSetValue {
  transform: ResolvedImageTransform;
  url: string;
  descriptor?: string;
  attributes: Record<string, any>;
}

export interface GetImageResult {
  rawOptions: ResolvedImageTransform;
  options: ResolvedImageTransform;
  src: string;
  srcSet: {
    values: SrcSetValue[];
    attribute: string;
  };
  attributes: Record<string, any>;
}

export interface AstroAssetsConfig {
  endpoint?: string;
  domains?: string[];
  remotePatterns?: {
    protocol?: string;
    hostname?: string;
    port?: string;
    pathname?: string;
  }[];
  defaultFormat?: ImageOutputFormat;
  service?: (transform: ResolvedImageTransform) => string;
}

const DEFAULT_ASSETS_CONFIG: Required<
  Pick<AstroAssetsConfig, "endpoint" | "defaultFormat">
> &
  AstroAssetsConfig = {
  endpoint: "/_image",
  defaultFormat: "webp",
  domains: [],
  remotePatterns: [],
};

let currentAssetsConfig: typeof DEFAULT_ASSETS_CONFIG = {
  ...DEFAULT_ASSETS_CONFIG,
};

export function configureAssets(
  config: AstroAssetsConfig,
): Readonly<AstroAssetsConfig> {
  currentAssetsConfig = {
    ...DEFAULT_ASSETS_CONFIG,
    ...config,
    domains: config.domains ? [...config.domains] : [],
    remotePatterns: config.remotePatterns ? [...config.remotePatterns] : [],
  };
  return currentAssetsConfig;
}

export function getAssetsConfig(): Readonly<AstroAssetsConfig> {
  return currentAssetsConfig;
}

export function resetAssetsConfig(): void {
  currentAssetsConfig = { ...DEFAULT_ASSETS_CONFIG };
}

const QUALITY_PRESETS: Record<ImageQualityPreset, number> = {
  low: 25,
  mid: 50,
  high: 80,
  max: 100,
};

function normalizeDimension(
  value: number | `${number}` | undefined,
  name: "width" | "height",
): number | undefined {
  if (value === undefined) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid image ${name}: ${String(value)}`);
  }
  return Math.round(num);
}

function normalizeQuality(
  quality: ImageQuality | undefined,
): number | string | undefined {
  if (quality === undefined) return undefined;
  if (typeof quality === "string") {
    return QUALITY_PRESETS[quality] ?? quality;
  }
  return quality;
}

function defaultTransformUrl(transform: ResolvedImageTransform): string {
  const rawSrc =
    typeof transform.src === "string" ? transform.src : transform.src.src;
  const format =
    transform.format ??
    (typeof transform.src === "object" && transform.src.format === "svg"
      ? "svg"
      : currentAssetsConfig.defaultFormat);
  if (format === "svg") {
    return rawSrc;
  }
  const params = new URLSearchParams();
  params.set("href", rawSrc);
  if (transform.width !== undefined) {
    params.set("w", String(transform.width));
  }
  if (transform.height !== undefined) {
    params.set("h", String(transform.height));
  }
  const q = normalizeQuality(transform.quality);
  if (q !== undefined) {
    params.set("q", String(q));
  }
  if (format) {
    params.set("f", format);
  }
  if (transform.fit) {
    params.set("fit", transform.fit);
  }
  if (transform.position) {
    params.set("pos", transform.position);
  }
  return `${currentAssetsConfig.endpoint}?${params.toString()}`;
}

function buildTransformUrl(transform: ResolvedImageTransform): string {
  if (currentAssetsConfig.service) {
    return currentAssetsConfig.service(transform);
  }
  return defaultTransformUrl(transform);
}

function unwrapMetadata(
  resolved: string | ImageMetadata | { default: ImageMetadata },
): string | ImageMetadata {
  if (typeof resolved === "string") return resolved;
  if (
    resolved &&
    typeof resolved === "object" &&
    "default" in resolved &&
    resolved.default
  ) {
    return resolved.default;
  }
  return resolved as ImageMetadata;
}

function resolveSrcSync(
  src: UnresolvedImageTransform["src"] | { default: ImageMetadata },
): string | ImageMetadata {
  if (!src) {
    throw new Error("getImage() requires a non-empty `src` option.");
  }
  if (typeof src === "string") return src;
  if (typeof (src as Promise<any>).then === "function") {
    throw new Error(
      "Synchronous image rendering does not accept a Promise `src`; pass resolved ImageMetadata or a URL string.",
    );
  }
  return unwrapMetadata(src as ImageMetadata | { default: ImageMetadata });
}

async function resolveSrc(
  src: UnresolvedImageTransform["src"],
): Promise<string | ImageMetadata> {
  if (!src) {
    throw new Error("getImage() requires a non-empty `src` option.");
  }
  if (typeof src === "string") return src;
  if (typeof (src as Promise<any>).then === "function") {
    const resolved = await (src as Promise<
      ImageMetadata | { default: ImageMetadata }
    >);
    return unwrapMetadata(resolved);
  }
  return unwrapMetadata(src as ImageMetadata | { default: ImageMetadata });
}

const TRANSFORM_ONLY_KEYS = /* @__PURE__ */ new Set([
  "src",
  "width",
  "height",
  "widths",
  "densities",
  "format",
  "quality",
  "fit",
  "position",
  "priority",
  "formats",
  "fallbackFormat",
  "pictureAttributes",
]);

function computeImageResult(
  options: UnresolvedImageTransform,
  resolvedSrc: string | ImageMetadata,
): GetImageResult {
  let width = normalizeDimension(options.width, "width");
  let height = normalizeDimension(options.height, "height");

  const metaWidth =
    typeof resolvedSrc === "object" ? resolvedSrc.width : undefined;
  const metaHeight =
    typeof resolvedSrc === "object" ? resolvedSrc.height : undefined;
  const aspectRatio =
    metaWidth && metaHeight && metaWidth > 0 && metaHeight > 0
      ? metaWidth / metaHeight
      : undefined;

  if (width !== undefined && height === undefined && aspectRatio) {
    height = Math.round(width / aspectRatio);
  } else if (height !== undefined && width === undefined && aspectRatio) {
    width = Math.round(height * aspectRatio);
  } else if (width === undefined && height === undefined) {
    if (metaWidth !== undefined) width = metaWidth;
    if (metaHeight !== undefined) height = metaHeight;
  }

  const rawOptions: ResolvedImageTransform = {
    ...options,
    src: resolvedSrc,
    width,
    height,
  };

  const resolvedFormat: ImageOutputFormat =
    options.format ??
    (typeof resolvedSrc === "object" && resolvedSrc.format === "svg"
      ? "svg"
      : currentAssetsConfig.defaultFormat);

  const validatedOptions: ResolvedImageTransform = {
    ...rawOptions,
    format: resolvedFormat,
  };

  const src = buildTransformUrl(validatedOptions);
  const srcSetValues: SrcSetValue[] = [];

  if (
    options.densities &&
    options.densities.length > 0 &&
    width !== undefined
  ) {
    const baseWidth = width;
    const baseHeight = height;
    for (const rawDensity of options.densities) {
      const factor =
        typeof rawDensity === "number"
          ? rawDensity
          : Number.parseFloat(rawDensity.slice(0, -1));
      if (!Number.isFinite(factor) || factor <= 0) continue;
      let targetWidth = Math.round(baseWidth * factor);
      if (metaWidth !== undefined && targetWidth > metaWidth) {
        targetWidth = metaWidth;
      }
      const targetHeight =
        baseHeight !== undefined
          ? Math.round((targetWidth / baseWidth) * baseHeight)
          : undefined;
      const variantTransform: ResolvedImageTransform = {
        ...validatedOptions,
        width: targetWidth,
        height: targetHeight,
      };
      srcSetValues.push({
        transform: variantTransform,
        url: buildTransformUrl(variantTransform),
        descriptor: `${factor}x`,
        attributes: {
          type: `image/${resolvedFormat === "jpg" ? "jpeg" : resolvedFormat}`,
        },
      });
    }
  } else if (options.widths && options.widths.length > 0) {
    for (const requestedWidth of options.widths) {
      if (!Number.isFinite(requestedWidth) || requestedWidth <= 0) continue;
      const targetWidth =
        metaWidth !== undefined && requestedWidth > metaWidth
          ? metaWidth
          : Math.round(requestedWidth);
      const targetHeight =
        aspectRatio !== undefined
          ? Math.round(targetWidth / aspectRatio)
          : height !== undefined && width !== undefined
            ? Math.round((targetWidth / width) * height)
            : undefined;
      const variantTransform: ResolvedImageTransform = {
        ...validatedOptions,
        width: targetWidth,
        height: targetHeight,
      };
      const descriptor = `${targetWidth}w`;
      if (srcSetValues.some((v) => v.descriptor === descriptor)) continue;
      srcSetValues.push({
        transform: variantTransform,
        url: buildTransformUrl(variantTransform),
        descriptor,
        attributes: {
          type: `image/${resolvedFormat === "jpg" ? "jpeg" : resolvedFormat}`,
        },
      });
    }
  }

  const srcSetAttribute = srcSetValues
    .map((entry) =>
      entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url,
    )
    .join(", ");

  const attributes: Record<string, any> = {};
  for (const [key, value] of Object.entries(options)) {
    if (TRANSFORM_ONLY_KEYS.has(key) || value === undefined || value === null) {
      continue;
    }
    attributes[key] = value;
  }
  if (attributes["class:list"] !== undefined) {
    const list = attributes["class:list"];
    delete attributes["class:list"];
    const normalized = classList([attributes.class, list]);
    if (normalized) attributes.class = normalized;
    else delete attributes.class;
  }
  if (width !== undefined) attributes.width = width;
  if (height !== undefined) attributes.height = height;
  if (options.priority) {
    if (options.loading !== null) {
      attributes.loading = options.loading ?? "eager";
    }
    if (options.decoding !== null) {
      attributes.decoding = options.decoding ?? "sync";
    }
    if (options.fetchpriority !== null) {
      attributes.fetchpriority = options.fetchpriority ?? "high";
    }
  } else {
    if (options.decoding !== null) {
      attributes.decoding = options.decoding ?? "async";
    }
    if (options.loading !== null) {
      attributes.loading = options.loading ?? "lazy";
    }
  }

  return {
    rawOptions,
    options: validatedOptions,
    src,
    srcSet: {
      values: srcSetValues,
      attribute: srcSetAttribute,
    },
    attributes,
  };
}

export function getImageSync(
  options: UnresolvedImageTransform,
): GetImageResult {
  if (!options || typeof options !== "object") {
    throw new Error("getImage() requires an options object.");
  }
  if (options.widths && options.densities) {
    throw new Error(
      "getImage() cannot use both `widths` and `densities` at the same time.",
    );
  }
  const resolvedSrc = resolveSrcSync(options.src);
  return computeImageResult(options, resolvedSrc);
}

export async function getImage(
  options: UnresolvedImageTransform,
): Promise<GetImageResult> {
  if (!options || typeof options !== "object") {
    throw new Error("getImage() requires an options object.");
  }
  if (options.widths && options.densities) {
    throw new Error(
      "getImage() cannot use both `widths` and `densities` at the same time.",
    );
  }
  const resolvedSrc = await resolveSrc(options.src);
  return computeImageResult(options, resolvedSrc);
}

export function Image(props: ImageProps): SSRChild {
  if (!props || typeof props !== "object") {
    throw new Error("<Image> requires props.");
  }
  if (props.alt === undefined || props.alt === null) {
    throw new Error("<Image> requires an `alt` attribute.");
  }
  const resolved = getImageSync(props as UnresolvedImageTransform);
  const imgAttrs: Record<string, any> = {
    src: resolved.src,
    ...(resolved.srcSet.attribute ? { srcset: resolved.srcSet.attribute } : {}),
    ...resolved.attributes,
    alt: props.alt,
  };
  return h("img", imgAttrs);
}

export function Picture(props: PictureProps): SSRChild {
  if (!props || typeof props !== "object") {
    throw new Error("<Picture> requires props.");
  }
  if (props.alt === undefined || props.alt === null) {
    throw new Error("<Picture> requires an `alt` attribute.");
  }
  const {
    formats = ["webp"],
    fallbackFormat,
    pictureAttributes = {},
    ...imageProps
  } = props;
  const resolvedSrc = resolveSrcSync(imageProps.src);
  const defaultFallback: ImageOutputFormat =
    fallbackFormat ??
    imageProps.format ??
    (typeof resolvedSrc === "object"
      ? resolvedSrc.format === "jpg"
        ? "jpg"
        : resolvedSrc.format === "svg"
          ? "svg"
          : "png"
      : "png");

  const sources: SSRChild[] = formats.map((fmt) => {
    const sourceImage = computeImageResult(
      { ...imageProps, src: resolvedSrc, format: fmt },
      resolvedSrc,
    );
    const srcset = sourceImage.srcSet.attribute || sourceImage.src;
    const mime = `image/${fmt === "jpg" ? "jpeg" : fmt === "svg" ? "svg+xml" : fmt}`;
    return h("source", {
      srcset,
      type: mime,
      ...(sourceImage.attributes.sizes
        ? { sizes: sourceImage.attributes.sizes }
        : {}),
    });
  });

  const fallbackImage = computeImageResult(
    { ...imageProps, src: resolvedSrc, format: defaultFallback },
    resolvedSrc,
  );
  const imgAttrs: Record<string, any> = {
    src: fallbackImage.src,
    ...(fallbackImage.srcSet.attribute
      ? { srcset: fallbackImage.srcSet.attribute }
      : {}),
    ...fallbackImage.attributes,
    alt: props.alt,
  };

  return h("picture", pictureAttributes, ...sources, h("img", imgAttrs));
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

/** Inspect image header bytes for dimensions and format (PNG, GIF, JPEG, WebP, SVG). */
export function inferImageDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
  format: ImageInputFormat;
  orientation?: number;
} {
  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR at offset 16..24
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return {
      width: readUint32BE(bytes, 16),
      height: readUint32BE(bytes, 20),
      format: "png",
    };
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return {
      width: readUint16LE(bytes, 6),
      height: readUint16LE(bytes, 8),
      format: "gif",
    };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunk = String.fromCharCode(
      bytes[12]!,
      bytes[13]!,
      bytes[14]!,
      bytes[15]!,
    );
    if (chunk === "VP8 ") {
      return {
        width: readUint16LE(bytes, 26) & 0x3fff,
        height: readUint16LE(bytes, 28) & 0x3fff,
        format: "webp",
      };
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const b0 = bytes[21]!;
      const b1 = bytes[22]!;
      const b2 = bytes[23]!;
      const b3 = bytes[24]!;
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
        format: "webp",
      };
    }
    if (chunk === "VP8X") {
      return {
        width: 1 + readUint24LE(bytes, 24),
        height: 1 + readUint24LE(bytes, 27),
        format: "webp",
      };
    }
  }

  // JPEG: FF D8
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1]!;
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = readUint16BE(bytes, offset + 5);
        const width = readUint16BE(bytes, offset + 7);
        return { width, height, format: "jpg" };
      }
      if (offset + 4 >= bytes.length) break;
      const segmentLength = readUint16BE(bytes, offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }

  // SVG text fallback
  const text = new TextDecoder().decode(bytes.subarray(0, 4096)).trim();
  if (text.includes("<svg")) {
    const svgTagMatch = text.match(/<svg\b[^>]*>/i);
    if (svgTagMatch) {
      const tag = svgTagMatch[0];
      const widthMatch = tag.match(/\bwidth=["'](\d+(?:\.\d+)?)(?:px)?["']/i);
      const heightMatch = tag.match(/\bheight=["'](\d+(?:\.\d+)?)(?:px)?["']/i);
      const viewBoxMatch = tag.match(
        /\bviewBox=["']\s*-?\d+(?:\.\d+)?[\s,]+-?\d+(?:\.\d+)?[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)\s*["']/i,
      );
      const width = widthMatch
        ? Math.round(Number(widthMatch[1]))
        : viewBoxMatch
          ? Math.round(Number(viewBoxMatch[1]))
          : 0;
      const height = heightMatch
        ? Math.round(Number(heightMatch[1]))
        : viewBoxMatch
          ? Math.round(Number(viewBoxMatch[2]))
          : 0;
      if (width > 0 && height > 0) {
        return { width, height, format: "svg" };
      }
    }
  }

  throw new Error("Unsupported or corrupted image buffer.");
}

export async function inferRemoteSize(
  url: string | URL,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{
  width: number;
  height: number;
  format: ImageInputFormat;
  orientation?: number;
}> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch remote image ${String(url)}: ${response.status} ${response.statusText}`,
    );
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return inferImageDimensions(buffer);
}
