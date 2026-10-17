/** Independent synchronous Astro source factories; no host compiler ABI. */
export * from "@tschk/moonshine-dom/ssr";
import {
  h as nativeH,
  hAttributes,
  type HTML,
  type SSRChild,
} from "@tschk/moonshine-dom/ssr";

const booleanAttributes = new Set(
  "allowfullscreen async autofocus autoplay checked controls default defer disabled disablepictureinpicture disableremoteplayback formnovalidate inert loop muted nomodule novalidate open playsinline readonly required reversed scoped seamless selected itemscope".split(
    " ",
  ),
);

/** Compiler-facing class:list normalization, independent of clsx. */
export function classList(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value))
    return value.map(classList).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const classes: string[] = [];
    for (const key in value) if (Reflect.get(value, key)) classes.push(key);
    return classes.join(" ");
  }
  return "";
}

/** Compiler-facing interpolation normalization for synchronous Astro factories. */
export function sourceChild(value: unknown): SSRChild {
  if (!value && value !== 0) return undefined;
  if (value === true) return "true";
  if (Array.isArray(value)) return value.map(sourceChild);
  if (typeof value === "function") return () => sourceChild(value());
  if (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new TypeError(
      "Async Astro children are unsupported; use synchronous server data",
    );
  }
  return value as SSRChild;
}

function style(value: object): string {
  return Object.entries(value)
    .filter(
      ([, item]) =>
        typeof item === "number" || (typeof item === "string" && item.trim()),
    )
    .map(
      ([key, item]) =>
        `${key[0] === "-" || key[1] === "-" ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${item}`,
    )
    .join(";");
}

function attribute(
  tag: string,
  name: string,
  value: unknown,
  dynamic: boolean,
): unknown {
  if (value == null) return undefined;
  if (!dynamic && typeof value === "string") return value;
  const lower = name.toLowerCase();
  if (
    booleanAttributes.has(lower) ||
    (["download", "hidden", "popover"].includes(lower) &&
      typeof value === "boolean")
  ) {
    if (tag.includes("-") && lower !== "popover") return String(value);
    return value ? "" : undefined;
  }
  if (name === "style" && typeof value === "object") {
    if (Array.isArray(value) && value.length === 2)
      return `${style(value[0] ?? {})};${value[1]}`;
    return style(value);
  }
  return String(value);
}

export function h<P extends object>(
  component: (props: P & { children?: SSRChild }) => SSRChild,
  props: P | null,
  ...children: SSRChild[]
): SSRChild;
export function h(
  tag: string,
  props?: Record<string, unknown> | null,
  ...children: SSRChild[]
): HTML;
export function h(
  tag: string | ((props: any) => SSRChild),
  props: Record<string, unknown> | null = null,
  ...children: SSRChild[]
): SSRChild {
  if (typeof tag === "function") {
    const captured =
      props == null
        ? null
        : Object.fromEntries(
            Object.keys(props).map((name) => [name, props[name]]),
          );
    return nativeH(tag, captured, ...children.map(sourceChild));
  }
  const attributes = Object.fromEntries(
    Object.keys(props ?? {}).map((name) => [
      name === "className" ? "class" : name,
      () => {
        const supplied = props![name];
        const dynamic = typeof supplied === "function";
        return attribute(tag, name, dynamic ? supplied() : supplied, dynamic);
      },
    ]),
  );
  return hAttributes(tag, attributes, ...children.map(sourceChild));
}
