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
const ELEMENT_NAME = /^[a-zA-Z][a-zA-Z0-9:_-]*$/;
const ATTRIBUTE_NAME = /^[a-zA-Z_:][a-zA-Z0-9:_.-]*$/;
const EVENT_NAME = /^on/i;

function validateBindingBox(box: unknown): BindingValue {
  if (box === null || typeof box !== "object")
    throw new TypeError(
      "Server binding metadata requires a plain { value } box",
    );
  const proto = Object.getPrototypeOf(box);
  if (proto !== Object.prototype && proto !== null)
    throw new TypeError(
      "Server binding metadata requires a plain { value } box",
    );
  const descriptor = Object.getOwnPropertyDescriptor(box, "value");
  if (!descriptor || !("value" in descriptor))
    throw new TypeError("Server binding metadata requires an own data value");
  let preserveSelected: boolean | undefined;
  if (Object.hasOwn(box, "preserveSelected")) {
    const policy = Object.getOwnPropertyDescriptor(box, "preserveSelected");
    if (policy && (!("value" in policy) || typeof policy.value !== "boolean"))
      throw new TypeError(
        "Server selected policy requires an own boolean data value",
      );
    preserveSelected = policy?.value;
  }
  return { value: descriptor.value, preserveSelected };
}

function bindingValue(
  props: Record<string, unknown> | null,
  key: symbol,
): BindingValue | undefined {
  if (!props || !Object.hasOwn(props, key)) return undefined;
  return validateBindingBox(Reflect.get(props, key));
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
  const text = typeof value === "string" ? value : String(value);
  if (text.length === 0) return "";
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
  while (typeof child === "function") child = child();
  if (child == null || typeof child !== "object") return child;
  if (Array.isArray(child)) {
    const length = child.length;
    if (length === 0) return "";
    if (length === 1) return resolve(child[0]);
    const resolved: SSRChild[] = [];
    for (let index = 0; index < length; index++)
      resolved.push(resolve(child[index]));
    return resolved;
  }
  if (!(html in child) && !(ssrOwner in child)) {
    throw new TypeError("Server children must be text or factory HTML");
  }
  return child;
}

function text(child: SSRChild): string {
  while (typeof child === "function") child = child();
  if (child == null || typeof child === "boolean") return "";
  if (typeof child === "string") return child;
  if (typeof child !== "object") return String(child);
  if (ssrOwner in child) return inSSRScope(child, () => text(child.child));
  if (Array.isArray(child)) {
    let out = "";
    for (let index = 0; index < child.length; index++)
      out += text(child[index]);
    return out;
  }
  throw new TypeError("Server textarea/title/option children must be text");
}

function content(child: SSRChild, selection?: Selection, svg = false): string {
  while (typeof child === "function") child = child();
  if (child == null || typeof child === "boolean") return "";
  if (typeof child === "object") {
    if (html in child) return (child as HTML)[html](selection, svg);
    if (ssrOwner in child)
      return inSSRScope(child, () => content(child.child, selection, svg));
    if (Array.isArray(child)) {
      let out = "";
      for (let index = 0; index < child.length; index++)
        out += content(child[index], selection, svg);
      return out;
    }
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

/** Compiler-facing ordered explicit attributes; repeated names retain source order. */
export function hAttributeEntries(
  tag: string,
  entries: ReadonlyArray<readonly [string, unknown]>,
  ...children: SSRChild[]
): HTML {
  return intrinsic(tag, null, children, undefined, entries, true);
}

/** Compiler-only explicit attributes with independent typed select/option identity. */
export function hSelectionEntries(
  tag: "select" | "option",
  entries: ReadonlyArray<readonly [string, unknown]>,
  selection: { value: unknown; preserveSelected?: boolean },
  ...children: SSRChild[]
): HTML {
  if (tag !== "select" && tag !== "option")
    throw new TypeError("Selection entries require select or option");
  return intrinsic(
    tag,
    null,
    children,
    undefined,
    entries,
    true,
    validateBindingBox(selection),
  );
}

function intrinsic(
  tag: string,
  props: Record<string, unknown> | null,
  children: SSRChild[],
  sourceCodec?: typeof sourceAttributeValue,
  sourceEntries?: ReadonlyArray<readonly [string, unknown]>,
  explicitAttributes = false,
  selectionBox?: BindingValue,
): HTML {
  if (!ELEMENT_NAME.test(tag)) {
    throw new TypeError("Invalid server element name");
  }
  const owner = getOwner();
  const lower = tag.toLowerCase();
  const typedSelect =
    lower === "select"
      ? (selectionBox ??
        (!explicitAttributes ? bindingValue(props, selectBinding) : undefined))
      : undefined;
  const typedOption =
    lower === "option"
      ? (selectionBox ??
        (!explicitAttributes ? bindingValue(props, optionBinding) : undefined))
      : undefined;
  if (lower === "script" || lower === "style") {
    throw new TypeError("Server script/style elements are unsupported");
  }
  const staticMode = explicitAttributes || Boolean(sourceCodec);
  let staticAttributes = "";
  const attributes: Array<[string, unknown]> | undefined = staticMode
    ? undefined
    : [];
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
    ? undefined
    : props
      ? Object.keys(props)
      : undefined;
  const attributeCount = sourceEntries
    ? sourceEntries.length
    : (names?.length ?? 0);
  for (let index = 0; index < attributeCount; index++) {
    const name = sourceEntries ? sourceEntries[index]![0] : names![index]!;
    if (!ATTRIBUTE_NAME.test(name)) {
      throw new TypeError("Invalid server attribute name");
    }
    // Event and ref handlers are client-only and must never execute on the server.
    if (
      EVENT_NAME.test(name) ||
      (!explicitAttributes && (name === "ref" || name === "children"))
    )
      continue;
    if (
      !explicitAttributes &&
      (name === "innerHTML" ||
        name === "outerHTML" ||
        name === "dangerouslySetInnerHTML")
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
        ? sourceEntries.some(([candidate]) => candidate === property)
        : Object.hasOwn(props!, property))
    )
      continue;
    // Typed options carry their serialized value as well as comparison identity.
    // The ordinary value prop loses precedence without invoking its getter/accessor.
    if (name === "value" && (typedOption || typedSelect)) {
      if (typedOption && staticMode) {
        typedOptionValueSlot = true;
        if (
          typedOption.value != null &&
          typeof typedOption.value !== "function"
        ) {
          optionValue = String(typedOption.value);
          staticAttributes += ` value="${escapeHtml(optionValue)}"`;
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
        const entries = styleEntries(value);
        let styleText = "";
        for (let styleIndex = 0; styleIndex < entries.length; styleIndex++) {
          const [styleProp, entry] = entries[styleIndex]!;
          if (entry != null && entry !== "")
            styleText += `${styleProp}:${entry};`;
        }
        value = styleText;
      } else if (typeof value !== "string") {
        throw new TypeError(
          "Style must be a CSS string, plain record, nullish or false",
        );
      }
    }

    if (
      (!explicitAttributes || typedSelect) &&
      lower === "select" &&
      name === "multiple"
    ) {
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
      if (sourceCodec) {
        const serialized = sourceCodec(
          "value",
          value,
          typeof supplied === "function",
        );
        if (lower === "option") optionValue = String(serialized ?? "");
        if (serialized !== undefined)
          staticAttributes += ` value="${escapeHtml(serialized)}"`;
      } else {
        if (lower === "option") optionValue = String(value ?? "");
        attributes!.push(["value", value]);
      }
      continue;
    }
    if (explicitAttributes) {
      if (value != null) staticAttributes += ` ${attr}="${escapeHtml(value)}"`;
    } else if (sourceCodec) {
      const serialized = sourceCodec(
        attr,
        value,
        typeof supplied === "function",
      );
      if (serialized !== undefined)
        staticAttributes += ` ${attr}="${escapeHtml(serialized)}"`;
    } else {
      attributes!.push([attr, value]);
    }
  }
  if (
    typedOption &&
    !typedOptionValueSlot &&
    typedOption.value != null &&
    typeof typedOption.value !== "function"
  ) {
    optionValue = String(typedOption.value);
    if (staticMode) {
      staticAttributes += ` value="${escapeHtml(optionValue)}"`;
    } else {
      attributes!.push(["value", optionValue]);
    }
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
  let escapedBodyText =
    bodyText === undefined ? undefined : escapeHtml(bodyText);
  if (
    escapedBodyText !== undefined &&
    !explicitAttributes &&
    lower === "textarea" &&
    (escapedBodyText.startsWith("\n") || escapedBodyText.startsWith("\r"))
  ) {
    escapedBodyText = `\n${escapedBodyText}`;
  }
  const isSvg = (inherited = false) =>
    sourceNamespace != null
      ? sourceNamespace === "http://www.w3.org/2000/svg"
      : lower === "svg" || inherited;
  const renderAttributes = (svg: boolean) => {
    if (staticMode) return staticAttributes;
    let out = "";
    for (let index = 0; index < attributes!.length; index++) {
      const [attr, value] = attributes![index]!;
      if (!svg && attr === "checked" && !value) continue;
      const serialized = attributeValue(
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
      if (serialized !== undefined)
        out += ` ${attr}="${escapeHtml(serialized)}"`;
    }
    return out;
  };
  if (VOID.has(lower)) {
    if (bodyChild != null && bodyChild !== false && content(bodyChild))
      throw new TypeError("Void server elements cannot have children");
    if (staticMode) {
      const markup = `<${tag}${staticAttributes}>`;
      return { [html]: () => markup };
    }
    return {
      [html]: (_selection, inheritedSvg) =>
        `<${tag}${renderAttributes(isSvg(inheritedSvg))}>`,
    };
  }
  if (staticMode && escapedBodyText !== undefined && lower !== "option") {
    const markup = `<${tag}${staticAttributes}>${escapedBodyText}</${tag}>`;
    return { [html]: () => markup };
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
        let matches: boolean;
        if (selection.binding) {
          const raw =
            typedOption !== undefined
              ? typedOption.value
              : (optionValue ??
                bodyText!.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, ""));
          matches =
            selection.multiple && Array.isArray(selection.binding.value)
              ? selection.binding.value.includes(raw)
              : raw === selection.binding.value;
        } else {
          const value =
            optionValue ??
            bodyText!.replace(/[\t\n\f\r ]+/g, " ").replace(/^ | $/g, "");
          matches =
            selection.values!.has(value) &&
            (selection.multiple || !selection.matched);
        }
        selected =
          matches || (selection.binding?.preserveSelected && selectedAttribute)
            ? ` selected=""`
            : "";
        if (matches) selection.matched = true;
      }
      let body: string;
      if (escapedBodyText !== undefined) {
        body = escapedBodyText;
      } else {
        const activeOwner = getOwner();
        const targetOwner = owner && !owner.disposed ? owner : activeOwner;
        const nextSvg = svg && lower !== "foreignobject";
        body =
          targetOwner === activeOwner
            ? content(bodyChild, selection, nextSvg)
            : runWithOwner(targetOwner, () =>
                content(bodyChild, selection, nextSvg),
              );
      }
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
      return `<${tag}${staticMode ? staticAttributes : renderAttributes(svg)}${selected}>${body}</${tag}>`;
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
