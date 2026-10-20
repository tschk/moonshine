/** Independent synchronous Astro source factories; no host compiler ABI. */
export * from "@tschk/moonshine-dom/ssr";
import {
  h as nativeH,
  hAttributes,
  hAttributeEntries,
  defer,
  renderToString,
  scopeSSRChild,
  type HTML,
  type SSRChild,
} from "@tschk/moonshine-dom/ssr";
import { peekAstroContext, type AstroServerIslandEntry } from "./context";

const booleanAttributes = /* @__PURE__ */ new Set(
  /* @__PURE__ */ "allowfullscreen async autofocus autoplay checked controls default defer disabled disablepictureinpicture disableremoteplayback formnovalidate inert loop muted nomodule novalidate open playsinline readonly required reversed scoped seamless selected itemscope".split(
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
): string | undefined {
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

export type SourceSlots = Readonly<Record<string, SSRChild>>;

function captureProps<P extends object>(props: P): P {
  return { ...props };
}

/** Compiler-facing component invocation; slots remain outside ordinary props. */
export function sourceComponent<P extends object>(
  component: (props: P, slots: SourceSlots) => SSRChild,
  props: P,
  slots: Readonly<Record<string, () => SSRChild>> = {},
): SSRChild {
  const captured = captureProps(props);
  const values = captured as Record<string, unknown>;
  if (values["class:list"] !== undefined) {
    const list = values["class:list"];
    delete values["class:list"];
    const normalized = classList([values.class, list]);
    if (normalized) values.class = normalized;
    else delete values.class;
  }
  const supplied: SourceSlots = Object.fromEntries(
    Object.entries(slots).map(([name, render]) => [
      name,
      scopeSSRChild(() => sourceChild(render())),
    ]),
  );
  let result: { value: SSRChild } | { error: unknown } | undefined;
  return scopeSSRChild(
    defer(() => {
      if (!result) {
        try {
          result = {
            value: nativeH(
              (actual: P) => sourceChild(component(actual, supplied)),
              captured,
            ),
          };
        } catch (error) {
          result = { error };
        }
      }
      if ("error" in result) throw result.error;
      return result.value;
    }),
  );
}

/** Compiler-facing Astro 5 `<Component server:defer>` Server Island invocation. */
export function sourceServerIsland<P extends object>(
  component: (props: P, slots: SourceSlots) => SSRChild,
  componentName: string,
  props: P,
  slots: Readonly<Record<string, () => SSRChild>> = {},
): SSRChild {
  const captured = captureProps(props);
  const componentSlots: Record<string, () => SSRChild> = {};
  for (const [name, render] of Object.entries(slots)) {
    if (name !== "fallback") {
      componentSlots[name] = render;
    }
  }
  const hasFallback = Object.hasOwn(slots, "fallback");
  const ctx = peekAstroContext();
  const deferred = Boolean(ctx?.deferServerIslands);
  const id = `island-${(ctx?.serverIslands.length ?? 0) + 1}`;
  const renderIsland = () =>
    renderToString(() => sourceComponent(component, captured, componentSlots));

  if (ctx) {
    const entry: AstroServerIslandEntry = {
      id,
      componentName,
      props: { ...(captured as Record<string, unknown>) },
      hasFallback,
      deferred,
      render: renderIsland,
    };
    ctx.serverIslands.push(entry);
  }

  if (deferred) {
    const fallbackContent = hasFallback
      ? scopeSSRChild(() => sourceChild(slots.fallback!()))
      : undefined;
    return h(
      "astro-server-island",
      {
        "data-island-id": id,
        "data-component": componentName,
      },
      fallbackContent,
    );
  }

  return sourceComponent(component, captured, componentSlots);
}

/** Presence selects a slot, including an explicitly empty supplied slot. */
export function sourceSlot(
  slots: SourceSlots,
  name = "default",
  fallback?: SSRChild,
): SSRChild {
  return sourceChild(Object.hasOwn(slots, name) ? slots[name] : fallback);
}

/** Check native slot presence without evaluating its supplied content. */
export function sourceHasSlot(slots: SourceSlots, name: string): boolean {
  return Object.hasOwn(slots, name);
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
    const captured = props == null ? null : captureProps(props);
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

/** Encoded compiler-facing attribute; repeated names remain separate entries. */
export type SourceAttribute = readonly [
  name: string,
  value: string | undefined,
];

/** Coerce at the authored position, before subsequent expressions or getters. */
export function sourceAttribute(
  tag: string,
  name: string,
  supplied: unknown,
  dynamic = false,
): SourceAttribute {
  if (!/^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/.test(name)) {
    throw new TypeError("Invalid server attribute name");
  }
  if (name.includes(":") && name !== "class:list") {
    throw new TypeError(
      `Unsupported Astro spread directive or namespace: ${name}`,
    );
  }
  const outputName =
    name === "class:list" || name === "className" ? "class" : name;
  const value = /^on/i.test(name)
    ? undefined
    : name === "class:list"
      ? classList(supplied) || undefined
      : attribute(tag, name, supplied, dynamic);
  return [outputName, value];
}

/** Read and coerce own string keys in order, without invoking function data. */
export function sourceSpread(tag: string, value: unknown): SourceAttribute[] {
  if (value == null) return [];
  const object = Object(value) as Record<string, unknown>;
  return Object.keys(object).map((name) =>
    sourceAttribute(tag, name, object[name], true),
  );
}

/** Compiler-facing intrinsic with ordered, already captured source attributes. */
export function sourceElement(
  tag: string,
  entries: ReadonlyArray<SourceAttribute>,
  ...children: SSRChild[]
): HTML {
  return hAttributeEntries(tag, entries, ...children.map(sourceChild));
}

export {
  useAstro,
  peekAstroContext,
  withAstroContext,
  createAstroGlobal,
  AstroCookies,
  AstroCookie,
  type AstroGlobal,
  type AstroContextInit,
  type AstroSlots,
  type AstroServerIslandEntry,
} from "./context";
