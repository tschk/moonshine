import { cleanupOrderKey } from "./cleanup-order";
/**
 * Independent HTML factory. Raw markup requires explicit rawHTML; ordinary children escape.
 * No script/style element factories or hydration ABI.
 * Ordinary nonempty single selects require a match: HTML cannot preserve selection -1.
 * Explicit live props win over defaults; HTML cannot encode separate live/reset values.
 */
import {
  createRoot,
  getOwner,
  runWithOwner,
  errorHandlerKey,
  type Owner,
} from "./reactive";
import { styleEntries } from "./style";
import { attributeValue, sourceAttributeValue } from "./attributes";
import { createComponent } from "./component";
import {
  createSSRRenderAttempt,
  resetSSRRenderAttempt,
  withSSRRenderAttempt,
  type SSRRenderAttempt,
} from "./ssr-attempt";
import {
  ssrOwner,
  withSSRRendering,
  isSSRRendering,
  type OwnedSSRChild,
} from "./ssr-owner";
export { scopeSSRChild } from "./ssr-owner";

/** Compiler-only typed selection; payloads preserve literal function/object identity. */
export const selectBinding = Symbol("moonshine server select binding");
export const optionBinding = Symbol("moonshine server option binding");
type BindingValue = { value: unknown; preserveSelected?: boolean };
function bindingValue(
  props: Record<string, unknown> | null,
  key: symbol,
): BindingValue | undefined {
  if (!props || !Object.hasOwn(props, key)) return undefined;
  const box = Reflect.get(props, key);
  if (
    box === null ||
    typeof box !== "object" ||
    (Object.getPrototypeOf(box) !== Object.prototype &&
      Object.getPrototypeOf(box) !== null)
  )
    throw new TypeError(
      "Server binding metadata requires a plain { value } box",
    );
  const descriptor = Object.getOwnPropertyDescriptor(box, "value");
  if (!descriptor || !("value" in descriptor))
    throw new TypeError("Server binding metadata requires an own data value");
  const preserveSelected = Object.getOwnPropertyDescriptor(
    box,
    "preserveSelected",
  );
  if (
    preserveSelected &&
    (!("value" in preserveSelected) ||
      typeof preserveSelected.value !== "boolean")
  )
    throw new TypeError(
      "Server selected policy requires an own boolean data value",
    );
  return { value: descriptor.value, preserveSelected: preserveSelected?.value };
}
const html = Symbol("moonshine server HTML");
type Selection = {
  values?: Set<string>;
  binding?: BindingValue;
  multiple: boolean;
  matched: boolean;
  options: number;
};
export type HTML = {
  readonly [html]: (selection?: Selection, svg?: boolean) => string;
};
export type SSRChild =
  | HTML
  | OwnedSSRChild
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly SSRChild[]
  | (() => SSRChild);

const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Explicit unsanitized server markup; ordinary children remain escaped. */
export function rawHTML(value: unknown): HTML {
  const markup = String(value ?? "");
  return { [html]: () => markup };
}

export function escapeHtml(value: unknown): string {
  const text = String(value);
  // Bun emits &#x27; for apostrophes; retain this API's exact &#39; output.
  if (typeof Bun !== "undefined" && !text.includes("'"))
    return Bun.escapeHTML(text);
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function resolve(child: SSRChild): SSRChild {
  if (typeof child === "function") return resolve(child());
  if (Array.isArray(child)) return child.map(resolve);
  if (
    child != null &&
    typeof child === "object" &&
    !(html in child) &&
    !(ssrOwner in child)
  ) {
    throw new TypeError("Server children must be text or factory HTML");
  }
  return child;
}

function text(child: SSRChild): string {
  if (child && typeof child === "object" && ssrOwner in child)
    return inSSRScope(child, () => text(child.child));
  if (typeof child === "function") return text(child());
  if (Array.isArray(child)) return child.map(text).join("");
  if (child == null || typeof child === "boolean") return "";
  if (typeof child === "object") {
    throw new TypeError("Server textarea/title/option children must be text");
  }
  return String(child);
}

function content(child: SSRChild, selection?: Selection, svg = false): string {
  if (child && typeof child === "object" && ssrOwner in child)
    return inSSRScope(child, () => content(child.child, selection, svg));
  if (typeof child === "function") return content(child(), selection, svg);
  if (Array.isArray(child))
    return child.map((value) => content(value, selection, svg)).join("");
  if (child == null || typeof child === "boolean") return "";
  if (typeof child === "object") {
    if (html in child) return (child as HTML)[html](selection, svg);
    throw new TypeError("Server children must be text or factory HTML");
  }
  return escapeHtml(child);
}

/** Serialize within the active request and owner without starting or disposing a root. */
export function serializeSSRChild(child: SSRChild): string {
  const owner = getOwner();
  if (!isSSRRendering() || !owner || owner.disposed)
    throw new Error(
      "SSR child serialization requires a live server render owner",
    );
  return content(child);
}

function inSSRScope<T>(child: OwnedSSRChild, render: () => T): T {
  const owner = child[ssrOwner];
  if (owner.disposed)
    throw new Error("Cannot serialize a disposed SSR child scope");
  return runWithOwner(owner, render);
}

/** Construct nested components during serialization in the containing owner's context. */
export function defer(fn: () => SSRChild): HTML {
  return { [html]: (selection, svg) => content(fn(), selection, svg) };
}

/** Serialize the child successfully before publishing compiler binding values. */
export function afterRender(child: SSRChild, commit: () => void): HTML {
  return {
    [html]: (selection, svg) => {
      const rendered = content(child, selection, svg);
      commit();
      return rendered;
    },
  };
}

/** Synchronous buffered recovery. Arbitrary state writes are not rolled back. */
export function boundary(
  render: () => SSRChild,
  fallback: (error: unknown) => SSRChild,
): HTML {
  return {
    [html]: (selection, svg) => {
      const owner = getOwner();
      if (!owner || owner.disposed)
        throw new Error(
          "SSR boundary serialization requires a live native owner",
        );
      const branch = (renderBranch: () => SSRChild): string => {
        let stop: (() => void) | undefined;
        let attempt: SSRRenderAttempt | undefined;
        let scope: Owner | undefined;
        const localSelection = selection ? { ...selection } : undefined;
        let rendered: string;
        try {
          rendered = runWithOwner(owner, () =>
            createRoot((dispose) => {
              stop = dispose;
              scope = getOwner()!;
              attempt = createSSRRenderAttempt();
              // The attempt owns a fresh context map; setup errors belong to this buffer.
              scope.context!.delete(errorHandlerKey);
              try {
                return withSSRRenderAttempt(attempt, () =>
                  content(renderBranch(), localSelection, svg),
                );
              } catch (error) {
                // createRoot cleans failed setup before returning to the outer catch.
                attempt.status = "discarded";
                throw error;
              }
            }),
          );
        } catch (error) {
          if (attempt) attempt.status = "discarded";
          try {
            stop?.();
          } catch {
            /* Preserve the render failure. */
          }
          throw error;
        }
        if (owner.disposed) {
          attempt!.status = "discarded";
          try {
            stop!();
          } catch {
            /* Preserve the ownership failure. */
          }
          throw new Error("SSR boundary owner was disposed during rendering");
        }
        attempt!.status = "accepted";
        scope!.parent = owner;
        owner.children.add(scope!);
        if (selection && localSelection) {
          selection.matched = localSelection.matched;
          selection.options = localSelection.options;
        }
        return rendered;
      };
      try {
        return branch(render);
      } catch (error) {
        if (owner.disposed) throw error;
        return branch(() => fallback(error));
      }
    },
  };
}

/** Buffer repeatable template output until compiler binding writes stop invalidating it. */
export function settle(
  renderTemplate: (invalidate: () => void) => SSRChild,
): HTML {
  const owner = getOwner();
  if (!owner || owner.disposed)
    throw new Error("SSR settlement requires a live native owner");
  return {
    [html]: (selection, svg) => {
      if (owner.disposed)
        throw new Error("Cannot serialize a disposed SSR settlement");
      for (let iteration = 0; iteration < 1000; iteration++) {
        let dirty = false;
        let stop: (() => void) | undefined;
        let attempt: SSRRenderAttempt | undefined;
        let scope: Owner | undefined;
        const localSelection = selection ? { ...selection } : undefined;
        let rendered: string;
        try {
          rendered = runWithOwner(owner, () =>
            createRoot((dispose) => {
              stop = dispose;
              scope = getOwner()!;
              attempt = createSSRRenderAttempt();
              return withSSRRenderAttempt(attempt, () =>
                content(
                  renderTemplate(() => {
                    dirty = true;
                  }),
                  localSelection,
                  svg,
                ),
              );
            }),
          );
        } catch (error) {
          if (attempt) attempt.status = "discarded";
          try {
            stop?.();
          } catch {
            /* Preserve the render failure. */
          }
          throw error;
        }
        if (dirty) {
          attempt!.status = "discarded";
          stop!();
          continue;
        }
        if (owner.disposed) {
          attempt!.status = "discarded";
          try {
            stop!();
          } catch {
            /* Preserve the ownership failure. */
          }
          throw new Error("SSR settlement owner was disposed during rendering");
        }
        attempt!.status = "accepted";
        scope!.parent = owner;
        owner.children.add(scope!);
        if (selection && localSelection) {
          selection.matched = localSelection.matched;
          selection.options = localSelection.options;
        }
        return rendered;
      }
      throw new Error("SSR settlement update limit exceeded");
    },
  };
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
export function h<P extends Record<string, unknown>>(
  tag: string | ((props: P & { children?: SSRChild }) => SSRChild),
  props: P | null = null,
  ...children: SSRChild[]
): SSRChild {
  if (typeof tag === "function") {
    const componentProps = children.length
      ? Object.defineProperties(
          {},
          {
            ...(props && Object.getOwnPropertyDescriptors(props)),
            children: { value: children, enumerable: true, configurable: true },
          },
        )
      : (props ?? {});
    return createComponent(
      tag,
      componentProps as P & { children?: SSRChild },
      "ssr",
    );
  }
  return intrinsic(tag, props, children);
}

/** Compiler-only source attribute codec; children use the existing lazy contract. */
export function hSource(
  tag: string,
  props: Record<string, unknown> | null = null,
  ...children: SSRChild[]
): HTML {
  return intrinsic(tag, props, children, sourceAttributeValue);
}

/** Compiler-only ordered source attributes, including repeated authored names. */
export function hSourceEntries(
  tag: string,
  entries: ReadonlyArray<readonly [string, unknown]>,
  ...children: SSRChild[]
): HTML {
  return intrinsic(tag, null, children, sourceAttributeValue, entries);
}

/** Explicit HTML attributes without DOM property aliases or form-binding inference. */
export function hAttributes(
  tag: string,
  attributes: Record<string, unknown> | null = null,
  ...children: SSRChild[]
): HTML {
  return intrinsic(tag, attributes, children, undefined, undefined, true);
}

function intrinsic(
  tag: string,
  props: Record<string, unknown> | null,
  children: SSRChild[],
  sourceCodec?: typeof sourceAttributeValue,
  sourceEntries?: ReadonlyArray<readonly [string, unknown]>,
  explicitAttributes = false,
): HTML {
  if (!/^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(tag)) {
    throw new TypeError("Invalid server element name");
  }
  const owner = getOwner();
  const lower = tag.toLowerCase();
  const typedSelect =
    !explicitAttributes && lower === "select"
      ? bindingValue(props, selectBinding)
      : undefined;
  const typedOption =
    !explicitAttributes && lower === "option"
      ? bindingValue(props, optionBinding)
      : undefined;
  if (lower === "script" || lower === "style") {
    throw new TypeError("Server script/style elements are unsupported");
  }
  const attributes: Array<[string, unknown]> = [];
  let textareaValue: unknown;
  let hasTextareaValue = false;
  let selectValue: unknown;
  let hasSelectValue = false;
  let multiple = false;
  let optionValue: string | undefined;
  let typedOptionValueSlot = false;
  let selectedAttribute = "";
  let sourceNamespace: unknown;
  const names = sourceEntries
    ? sourceEntries.map(([name]) => name)
    : Object.keys(props ?? {});
  for (let index = 0; index < names.length; index++) {
    const name = names[index]!;
    if (!/^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/.test(name)) {
      throw new TypeError("Invalid server attribute name");
    }
    // Event and ref handlers are client-only and must never execute on the server.
    if (
      /^on/i.test(name) ||
      (!explicitAttributes && (name === "ref" || name === "children"))
    )
      continue;
    if (
      !explicitAttributes &&
      ["innerHTML", "outerHTML", "dangerouslySetInnerHTML"].includes(name)
    ) {
      throw new TypeError("Raw server HTML is unsupported");
    }
    if (
      !explicitAttributes &&
      name === "defaultValue" &&
      lower !== "input" &&
      lower !== "textarea"
    )
      throw new TypeError(
        "defaultValue is supported only on input and textarea",
      );
    if (!explicitAttributes && name === "defaultChecked" && lower !== "input")
      throw new TypeError("defaultChecked is supported only on input");
    const property =
      !explicitAttributes && name === "defaultValue"
        ? "value"
        : !explicitAttributes && name === "defaultChecked"
          ? "checked"
          : name;
    if (
      property !== name &&
      (sourceEntries
        ? names.includes(property)
        : Object.hasOwn(props!, property))
    )
      continue;
    // Typed options carry their serialized value as well as comparison identity.
    // The ordinary value prop loses precedence without invoking its getter/accessor.
    if (name === "value" && (typedOption || typedSelect)) {
      if (typedOption && sourceCodec) {
        typedOptionValueSlot = true;
        if (
          typedOption.value != null &&
          typeof typedOption.value !== "function"
        ) {
          optionValue = String(typedOption.value);
          attributes.push(["value", optionValue]);
        }
      }
      continue;
    }
    const supplied = sourceEntries ? sourceEntries[index]![1] : props![name];
    let value = typeof supplied === "function" ? supplied() : supplied;
    if (name === "xmlns") sourceNamespace = value;
    if (!explicitAttributes && name === "style") {
      if (value == null || value === false) value = undefined;
      else if (typeof value === "object") {
        value = styleEntries(value)
          .map(([property, entry]) =>
            entry == null || entry === "" ? "" : `${property}:${entry};`,
          )
          .join("");
      } else if (typeof value !== "string") {
        throw new TypeError(
          "Style must be a CSS string, plain record, nullish or false",
        );
      }
    }

    if (!explicitAttributes && lower === "select" && name === "multiple") {
      multiple =
        (sourceCodec
          ? sourceCodec(name, value, true)
          : attributeValue(name, value, true)) !== undefined;
    }
    if (!explicitAttributes && lower === "select" && name === "value") {
      selectValue = value;
      hasSelectValue = true;
      continue;
    }
    if (!explicitAttributes && lower === "option" && name === "selected") {
      if (
        (sourceCodec
          ? sourceCodec(name, value, true)
          : attributeValue(name, value, true)) !== undefined
      )
        selectedAttribute = ` selected=""`;
      continue;
    }
    if (!explicitAttributes && lower === "textarea" && property === "value") {
      textareaValue = value;
      hasTextareaValue = true;
      continue;
    }
    const attr =
      !explicitAttributes && property === "className"
        ? "class"
        : !explicitAttributes && property === "htmlFor"
          ? "for"
          : property;
    if (!explicitAttributes && property === "value") {
      const serialized = sourceCodec
        ? sourceCodec("value", value, typeof supplied === "function")
        : value;
      if (lower === "option")
        optionValue = sourceCodec
          ? String(serialized ?? "")
          : String(value ?? "");
      attributes.push(["value", serialized]);
      continue;
    }
    attributes.push([
      attr,
      sourceCodec
        ? sourceCodec(attr, value, typeof supplied === "function")
        : value,
    ]);
  }
  if (
    typedOption &&
    !typedOptionValueSlot &&
    typedOption.value != null &&
    typeof typedOption.value !== "function"
  ) {
    optionValue = String(typedOption.value);
    attributes.push(["value", optionValue]);
  }
  if (
    lower === "select" &&
    !typedSelect &&
    Array.isArray(selectValue) &&
    !multiple
  ) {
    throw new TypeError("Server select array values require multiple");
  }
  const textOnly =
    lower === "textarea" || lower === "title" || lower === "option";
  const sourceChild =
    lower === "textarea" && hasTextareaValue
      ? undefined
      : children.length === 1
        ? children[0]
        : children.length
          ? children
          : explicitAttributes
            ? undefined
            : (props?.children as SSRChild);
  const bodyChild = resolve(sourceChild);
  const bodyText = textOnly
    ? hasTextareaValue
      ? String(textareaValue ?? "")
      : text(bodyChild)
    : undefined;
  const explicitNamespace = sourceCodec
    ? sourceNamespace
    : attributes.find(([name]) => name === "xmlns")?.[1];
  const isSvg = (inherited = false) =>
    explicitNamespace != null
      ? explicitNamespace === "http://www.w3.org/2000/svg"
      : lower === "svg" || inherited;
  const renderAttributes = (svg: boolean) =>
    attributes
      .map(([attr, value]) => {
        if (explicitAttributes)
          return value == null ? "" : ` ${attr}="${escapeHtml(value)}"`;
        if (sourceCodec)
          return value === undefined ? "" : ` ${attr}="${escapeHtml(value)}"`;
        if (!explicitAttributes && !svg && attr === "checked" && !value)
          return "";
        const text = attributeValue(
          attr,
          !svg &&
            attr === "value" &&
            lower !== "progress" &&
            lower !== "meter" &&
            lower !== "li"
            ? (value ?? "")
            : value,
          !svg,
        );
        return text === undefined ? "" : ` ${attr}="${escapeHtml(text)}"`;
      })
      .join("");
  if (VOID.has(lower)) {
    if (content(bodyChild))
      throw new TypeError("Void server elements cannot have children");
    return {
      [html]: (_selection, inheritedSvg) =>
        `<${tag}${renderAttributes(isSvg(inheritedSvg))}>`,
    };
  }
  return {
    [html]: (inherited, inheritedSvg) => {
      const svg = isSvg(inheritedSvg);
      const selection =
        lower === "select"
          ? typedSelect
            ? { binding: typedSelect, multiple, matched: false, options: 0 }
            : hasSelectValue
              ? {
                  values: new Set(
                    (multiple
                      ? Array.isArray(selectValue)
                        ? selectValue
                        : selectValue == null
                          ? []
                          : [selectValue]
                      : [selectValue ?? ""]
                    ).map(String),
                  ),
                  multiple,
                  matched: false,
                  options: 0,
                }
              : undefined
          : inherited;
      let selected = selectedAttribute;
      if (lower === "option" && selection) {
        selection.options++;
        const value =
          optionValue ??
          bodyText!.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
        const raw = typedOption ? typedOption.value : value;
        const matches = selection.binding
          ? selection.multiple && Array.isArray(selection.binding.value)
            ? selection.binding.value.includes(raw)
            : raw === selection.binding.value
          : selection.values!.has(value) &&
            (selection.multiple || !selection.matched);
        selected =
          matches || (selection.binding?.preserveSelected && selectedAttribute)
            ? ` selected=""`
            : "";
        if (matches) selection.matched = true;
      }
      let body =
        bodyText === undefined
          ? runWithOwner(owner && !owner.disposed ? owner : getOwner(), () =>
              content(bodyChild, selection, svg && lower !== "foreignobject"),
            )
          : escapeHtml(bodyText);
      if (
        lower === "select" &&
        selection &&
        !selection.binding &&
        !selection.multiple &&
        selection.options > 0 &&
        !selection.matched
      ) {
        throw new TypeError("Server select value has no matching option");
      }
      if (
        lower === "textarea" &&
        (body.startsWith("\n") || body.startsWith("\r"))
      )
        body = `\n${body}`;
      return `<${tag}${renderAttributes(svg)}${selected}>${body}</${tag}>`;
    },
  };
}

export function renderToString(fn: () => SSRChild): string {
  return withSSRRendering(() =>
    withSSRRenderAttempt(undefined, () => {
      let dispose = () => {};
      let result: string;
      try {
        result = createRoot((stop) => {
          dispose = stop;
          resetSSRRenderAttempt();
          const requestOwner = getOwner()!;
          if (requestOwner.context?.has(cleanupOrderKey)) {
            requestOwner.context = new Map(requestOwner.context);
            requestOwner.context.delete(cleanupOrderKey);
          }
          return content(fn());
        });
      } catch (error) {
        try {
          dispose();
        } catch {
          /* Preserve the render error. */
        }
        throw error;
      }
      dispose();
      return result;
    }),
  );
}

/** Server lowering must import lifecycle hooks here; browser effects never run. */
export function createEffect<T>(_fn: (previous: T) => T, _initial: T): void;
export function createEffect(_fn: (previous: undefined) => unknown): void;
export function createEffect<T>(_fn: (previous: T) => T, _initial?: T): void {}
export function onMount(_fn: () => void): void {}

export {
  createSignal,
  createMemo,
  createRoot,
  createComputed,
  batch,
  untrack,
  onCleanup,
  on,
  getOwner,
  runWithOwner,
} from "./reactive";
export type { Accessor, Setter, Owner } from "./reactive";
