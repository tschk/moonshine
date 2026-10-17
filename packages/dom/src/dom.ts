import { cleanupOrderKey, type CleanupPolicy } from "./cleanup-order";
/** Internal one-shot callback after native range insertion. */
export const insertedNode = /* @__PURE__ */ Symbol(
  "moonshine DOM inserted node",
);
/** Optional adapter event registration; absent for the native factory. */
export const eventRegistration = /* @__PURE__ */ Symbol(
  "moonshine DOM event registration",
);
export type EventRegistration = (
  element: Element,
  name: string,
  value: unknown,
) => () => void;

/** Independent DOM helpers for Moonshine lowering, not Solid's compiled ABI. */
import {
  createRenderEffect,
  createRoot,
  createComponentScope,
  getOwner,
  runWithOwner,
  onCleanup,
  onBeforeDispose,
  templateRetentionKey,
  untrack,
  withCleanupTransaction,
} from "./reactive";
import { attributeValue } from "./attributes";
import { styleEntries } from "./style";
import { createComponent } from "./component";

export type DOMChild =
  | Node
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly DOMChild[]
  | (() => DOMChild);

const SVG = "http://www.w3.org/2000/svg";
const HTML = "http://www.w3.org/1999/xhtml";
const SVG_TAGS = new Set(
  "animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect set stop switch symbol text textPath tspan use view".split(
    " ",
  ),
);
let namespace = HTML;
const selectUpdates = new WeakMap<Node, () => void>();
const styleNames = new WeakMap<Element, Set<string>>();

function childrenNamespace(parent: Node): string {
  return parent instanceof Element &&
    parent.namespaceURI === SVG &&
    parent.localName !== "foreignObject"
    ? SVG
    : HTML;
}

function dynamic(child: DOMChild): boolean {
  return (
    typeof child === "function" || (Array.isArray(child) && child.some(dynamic))
  );
}

function values(
  child: DOMChild,
  result: Array<Node | string> = [],
): Array<Node | string> {
  if (typeof child === "function") return values(child(), result);
  if (Array.isArray(child)) {
    for (const value of child) values(value, result);
  } else if (child instanceof Node) {
    result.push(child);
  } else if (child != null && typeof child !== "boolean") {
    result.push(String(child));
  }
  return result;
}

function nodes(child: DOMChild, previous: Node[]): Node[] {
  while (
    typeof child === "function" ||
    (Array.isArray(child) && child.length === 1)
  ) {
    child = typeof child === "function" ? child() : child[0];
  }
  if (
    (typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "bigint") &&
    previous.length === 1 &&
    previous[0] instanceof Text
  ) {
    const value = String(child);
    if (previous[0].data !== value) previous[0].data = value;
    return previous;
  }
  const resolved = values(child);
  const reserved = new Set(
    resolved.filter((value): value is Node => value instanceof Node),
  );
  return resolved.map((value, index) => {
    if (value instanceof Node) return value;
    const old = previous[index];
    if (old instanceof Text && !reserved.has(old)) {
      if (old.data !== value) old.data = value;
      return old;
    }
    return document.createTextNode(value);
  });
}

function refreshSelect(parent: Node): void {
  for (let node: Node | null = parent; node; node = node.parentNode) {
    const update = selectUpdates.get(node);
    if (update) {
      untrack(update);
      break;
    }
  }
}

const nodeRange = /* @__PURE__ */ Symbol("native-node-range");
type NodeRange = {
  readonly disposed: boolean;
  schedule?: (update: () => void) => unknown;
  retain?: (node: Node) => boolean;
  end: Node;
  contents: readonly Node[];
  valid: () => boolean;
  dispose: () => void;
  move: (parent: Node, before: Node) => void;
};
function range(node: Node): NodeRange | undefined {
  return (node as Node & { [nodeRange]?: NodeRange })[nodeRange];
}
function rangeOwned(node: Node): Set<Node> {
  const owned = new Set<Node>();
  const collect = (value: Node) => {
    const nested = range(value);
    // Retired child ranges have already removed their owned nodes.
    if (owned.has(value) || (value !== node && nested?.disposed)) return;
    owned.add(value);
    if (nested) {
      for (const child of nested.contents) collect(child);
      collect(nested.end);
    }
  };
  collect(node);
  return owned;
}
/** Validate the complete boundary before mutating any sibling. */
function rangeSpan(node: Node, end: Node): Node[] | undefined {
  const parent = node.parentNode;
  if (!parent || end.parentNode !== parent) return;
  const metadata = range(node);
  const owned = metadata ? rangeOwned(node) : undefined;
  const result: Node[] = [];
  for (
    let current: Node | null = node;
    current;
    current = current.nextSibling
  ) {
    if (owned && !owned.has(current)) return;
    result.push(current);
    if (current === end)
      return !owned || result.length === owned.size ? result : undefined;
  }
}
function removeNode(node: Node, retain?: (node: Node) => boolean): void {
  const metadata = range(node);
  if (metadata) metadata.dispose();
  else if (!retain?.(node)) node.parentNode?.removeChild(node);
}
function removeNodes(
  ownedNodes: readonly Node[],
  retained?: ReadonlySet<Node>,
  retain?: (node: Node) => boolean,
): void {
  let failed = false;
  let failure: unknown;
  for (const node of ownedNodes) {
    if (retained?.has(node)) continue;
    try {
      removeNode(node, retain);
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
}
function moveNode(parent: Node, node: Node, before: Node): void {
  const metadata = range(node);
  if (metadata) metadata.move(parent, before);
  else if (node.nextSibling !== before) parent.insertBefore(node, before);
}
/** Internal range operations; adapters must not inspect marker fields. */
export function insertionRangeEnd(start: Node): Node {
  const metadata = range(start);
  if (!metadata) throw new Error("Not an insertion range");
  return metadata.end;
}
export function prepareInsertionRange(start: Node): void {
  const ready = (start as Node & { [insertedNode]?: () => void })[insertedNode];
  if (ready) {
    delete (start as Node & { [insertedNode]?: () => void })[insertedNode];
    ready();
  }
}
export function moveInsertionRange(start: Node, before: Node): void {
  if (!before.parentNode) throw new Error("Missing insertion range target");
  moveNode(before.parentNode, start, before);
}
/** Create a live insertion range; schedule is an internal compiler-owned phase seam. */
export function createInsertionRange(
  child: DOMChild,
  schedule?: (update: () => void) => unknown,
  retain?: (node: Node) => boolean,
): Node {
  const owner = getOwner();
  if (!owner || owner.disposed) throw new Error("Range requires a live owner");
  retain ??= (
    owner.context?.get(templateRetentionKey) as TemplateRetention | undefined
  )?.retain;
  const creationNamespace = namespace;
  const start = document.createComment("range");
  const end = document.createComment("/range");
  const fragment = document.createDocumentFragment();
  fragment.append(start, end);
  let stop: (() => void) | undefined;
  let disposed = false;
  const cleanupPolicy = owner.context?.get(cleanupOrderKey) as
    CleanupPolicy | undefined;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    let failed = false;
    let failure: unknown;
    try {
      const span = rangeSpan(start, end);
      // Damaged or crossed boundaries remove only the owned row ledger.
      const owned = span ?? rangeOwned(start);
      if (cleanupPolicy)
        cleanupPolicy.deferRemoval([...owned], end, retain, removeNodes);
      else
        for (const node of owned)
          if (!retain?.(node)) node.parentNode?.removeChild(node);
    } catch (error) {
      failed = true;
      failure = error;
    }
    try {
      stop?.();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
    if (failed) throw failure;
  };
  const dispose = () => {
    if (cleanupPolicy) withCleanupTransaction(cleanup);
    else cleanup();
  };
  Object.defineProperty(start, nodeRange, {
    value: {
      get disposed() {
        return disposed;
      },
      end,
      contents: [],
      valid: () => !disposed && !!rangeSpan(start, end),
      dispose,
      schedule,
      retain,
      move(parent: Node, before: Node) {
        const span = rangeSpan(start, end);
        if (
          disposed ||
          !span ||
          before.parentNode !== parent ||
          span.includes(before)
        )
          throw new Error("Invalid insertion range boundaries");
        if (end.nextSibling === before && start.parentNode === parent) return;
        for (const node of span) parent.insertBefore(node, before);
      },
    },
  });
  Object.defineProperty(start, insertedNode, {
    configurable: true,
    value: () => {
      if (disposed || owner.disposed) return;
      runWithOwner(owner, () =>
        createComponentScope(() => {
          createRoot((disposeRoot) => {
            stop = disposeRoot;
            if (disposed) {
              disposeRoot();
              return;
            }
            try {
              insert(start.parentNode!, child, end, start, creationNamespace);
            } catch (error) {
              try {
                disposeRoot();
              } catch {}
              throw error;
            }
          });
          onCleanup(dispose);
        }),
      );
    },
  });
  onCleanup(dispose);
  return start;
}

function insert(
  parent: Node,
  child: DOMChild,
  suppliedAnchor?: Node,
  rangeStart?: Node,
  rangeNamespace?: string,
): void {
  const retain =
    (rangeStart ? range(rangeStart)?.retain : undefined) ??
    (
      getOwner()?.context?.get(templateRetentionKey) as
        TemplateRetention | undefined
    )?.retain;
  const anchor = suppliedAnchor ?? document.createComment("");
  if (!suppliedAnchor) parent.appendChild(anchor);
  let current: Node[] = [];
  let cancelled = false;
  const update = () => {
    if (
      suppliedAnchor &&
      (cancelled || !rangeStart || !range(rangeStart)?.valid())
    ) {
      if (cancelled) return;
      throw new Error("Invalid insertion range boundaries");
    }
    const target = suppliedAnchor ? (anchor.parentNode ?? parent) : parent;
    const previousNamespace = namespace;
    namespace =
      suppliedAnchor && target.nodeType === 11
        ? (rangeNamespace ?? previousNamespace)
        : childrenNamespace(target);
    let next: Node[];
    try {
      next = nodes(child, current);
    } finally {
      namespace = previousNamespace;
    }
    if (cancelled) {
      removeNodes(next, undefined, retain);
      return;
    }
    if (
      next !== current ||
      next[0]?.nextSibling !== anchor ||
      next[0]?.parentNode !== parent
    ) {
      const retained = new Set(next);
      removeNodes(current, retained, retain);
      if (cancelled) {
        removeNodes(next, undefined, retain);
        return;
      }
      if (
        next.length > 1 &&
        next.length === current.length &&
        retained.size === next.length &&
        next[0] === current[current.length - 1] &&
        current[0]!.parentNode === parent &&
        next.every((node, index) => index === 0 || node === current[index - 1])
      ) {
        // Move the last row once instead of moving every other retained row.
        moveNode(target, next[0]!, current[0]!);
      }
      let cursor: Node = anchor;
      for (let i = next.length - 1; i >= 0; i--) {
        const node = next[i]!;
        moveNode(target, node, cursor);
        cursor = node;
      }
      current = next;
      if (rangeStart) range(rangeStart)!.contents = current;
      for (const node of next) {
        const ready = (node as Node & { [insertedNode]?: () => void })[
          insertedNode
        ];
        if (ready) {
          delete (node as Node & { [insertedNode]?: () => void })[insertedNode];
          ready();
        }
      }
    }
    refreshSelect(target);
  };
  const cleanupPolicy = getOwner()?.context?.get(cleanupOrderKey) as
    CleanupPolicy | undefined;
  onCleanup(() => {
    cancelled = true;
    const owned = [...current, anchor];
    if (!cleanupPolicy) {
      removeNodes(owned, undefined, retain);
      return;
    }
    cleanupPolicy.deferRemoval(owned, anchor, retain, removeNodes);
  });
  if (dynamic(child)) {
    const schedule = rangeStart && range(rangeStart)?.schedule;
    if (schedule) schedule(update);
    else createRenderEffect(update);
  } else update();
}

function style(element: Element, value: unknown): void {
  const declaration = (element as HTMLElement | SVGElement).style;
  if (value != null && typeof value === "object") {
    const entries = styleEntries(value);
    const next = new Set(
      entries.filter(([, value]) => value !== null).map(([name]) => name),
    );
    for (const name of styleNames.get(element) ?? []) {
      if (!next.has(name)) declaration.removeProperty(name);
    }
    for (const [name, value] of entries) {
      if (value === null) declaration.removeProperty(name);
      else declaration.setProperty(name, value);
    }
    styleNames.set(element, next);
  } else if (value == null || value === false) {
    element.removeAttribute("style");
    styleNames.delete(element);
  } else {
    if (typeof value !== "string")
      throw new TypeError("style must be a CSS string, plain record or null");
    element.setAttribute("style", value);
    styleNames.set(element, new Set(Array.from(declaration)));
  }
}

function attribute(element: Element, name: string, value: unknown): void {
  if (name === "defaultValue") {
    (element as HTMLInputElement | HTMLTextAreaElement).defaultValue =
      value == null ? "" : String(value);
    return;
  } else if (name === "defaultChecked") {
    (element as HTMLInputElement).defaultChecked = Boolean(value);
    return;
  } else if (name === "style") {
    style(element, value);
    return;
  }
  if (name === "value" && element instanceof HTMLSelectElement) {
    if (!element.multiple && Array.isArray(value)) {
      throw new TypeError("Single select value cannot be an array");
    }
    if (element.multiple) {
      const selected = new Set(
        (Array.isArray(value) ? value : value == null ? [] : [value]).map(
          String,
        ),
      );
      for (const option of element.options)
        option.selected = selected.has(option.value);
    } else {
      const next = value == null ? "" : String(value);
      element.value = next;
    }
  } else if (
    name === "value" &&
    element.namespaceURI === HTML &&
    (element.localName === "progress" ||
      element.localName === "meter" ||
      element.localName === "li")
  ) {
    const target = element as
      HTMLProgressElement | HTMLMeterElement | HTMLLIElement;
    if (
      target.value !== value ||
      (element.localName === "progress" && value === 0)
    )
      target.value = (value ?? "") as number;
  } else if (name === "value" && "value" in element) {
    const input = element as HTMLInputElement;
    const next = value == null ? "" : String(value);
    if (
      input.value !== next ||
      (element instanceof HTMLOptionElement && !element.hasAttribute("value"))
    )
      input.value = next;
    if (element instanceof HTMLOptionElement) refreshSelect(element);
  } else if (name === "checked" && "checked" in element) {
    (element as HTMLInputElement).checked = Boolean(value);
  } else {
    const attr =
      name === "className" ? "class" : name === "htmlFor" ? "for" : name;
    const attributeNamespace =
      attr === "xmlns" || attr.startsWith("xmlns:")
        ? "http://www.w3.org/2000/xmlns/"
        : attr.startsWith("xlink:")
          ? "http://www.w3.org/1999/xlink"
          : attr.startsWith("xml:")
            ? "http://www.w3.org/XML/1998/namespace"
            : null;
    const text = attributeValue(attr, value, element.namespaceURI === HTML);
    if (text === undefined) {
      if (attributeNamespace)
        element.removeAttributeNS(
          attributeNamespace,
          attr.slice(attr.indexOf(":") + 1),
        );
      else element.removeAttribute(attr);
    } else {
      if (attributeNamespace)
        element.setAttributeNS(attributeNamespace, attr, text);
      else element.setAttribute(attr, text);
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): HTMLElementTagNameMap[K];
export function h<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): SVGElementTagNameMap[K];
export function h<P extends object>(
  component: (props: P & { children?: DOMChild }) => DOMChild,
  props: P | null,
  ...children: DOMChild[]
): DOMChild;
export function h(
  tag: string,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): HTMLElement | SVGElement;
export function h<P extends Record<string, unknown>>(
  tag: string | ((props: P & { children?: DOMChild }) => DOMChild),
  props: P | null = null,
  ...children: DOMChild[]
): DOMChild {
  if (typeof tag === "function") {
    const componentProps = children.length
      ? Object.defineProperties(
          {},
          {
            ...Object.getOwnPropertyDescriptors(props ?? {}),
            children: {
              value: children,
              enumerable: true,
              writable: true,
              configurable: true,
            },
          },
        )
      : (props ?? {});
    return createComponent(
      tag,
      componentProps as P & { children?: DOMChild },
      "dom",
    );
  }
  // shortcut: ambiguous SVG tags need accessor children or xmlns, until lowering supplies namespace context.
  const elementNamespace =
    props?.xmlns ??
    (tag === "svg" || namespace === SVG || SVG_TAGS.has(tag) ? SVG : HTML);
  return createIntrinsic(tag, props, children, elementNamespace);
}

/** Compiler-owned lexical namespace; authored xmlns remains an ordinary attribute. */
export function hNS<K extends keyof SVGElementTagNameMap>(
  elementNamespace: typeof SVG,
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): SVGElementTagNameMap[K];
export function hNS<K extends keyof HTMLElementTagNameMap>(
  elementNamespace: typeof HTML,
  tag: K,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): HTMLElementTagNameMap[K];
export function hNS(
  elementNamespace: typeof HTML | typeof SVG,
  tag: string,
  props?: Record<string, unknown> | null,
  ...children: DOMChild[]
): Element;
export function hNS(
  elementNamespace: typeof HTML | typeof SVG,
  tag: string,
  props: Record<string, unknown> | null = null,
  ...children: DOMChild[]
): Element {
  if (elementNamespace !== HTML && elementNamespace !== SVG)
    throw new TypeError("Unsupported element namespace");
  return createIntrinsic(tag, props, children, elementNamespace);
}

function createIntrinsic(
  tag: string,
  props: Record<string, unknown> | null,
  children: DOMChild[],
  elementNamespace: unknown,
): Element {
  const element = document.createElementNS(String(elementNamespace), tag);
  const select = element instanceof HTMLSelectElement;
  const input = element instanceof HTMLInputElement;
  const textarea = element instanceof HTMLTextAreaElement;
  const output =
    element.namespaceURI === HTML && element.localName === "output";
  const numericValue =
    element.namespaceURI === HTML &&
    (element.localName === "progress" ||
      element.localName === "meter" ||
      element.localName === "li");
  let formProperties: Map<string, unknown> | undefined;
  let selectValue: unknown;
  let selectMultiple: unknown;
  let hasSelectValue = false;
  const registerEvents = (props as Record<PropertyKey, unknown> | null)?.[
    eventRegistration
  ] as EventRegistration | undefined;
  for (const name of Object.keys(props ?? {})) {
    if (name === "children") continue;
    const value = props![name];
    if (name === "defaultValue" && !input && !textarea)
      throw new TypeError(
        "defaultValue is supported only on input and textarea",
      );
    if (name === "defaultChecked" && !input)
      throw new TypeError("defaultChecked is supported only on input");
    if (
      name === "defaultValue" ||
      name === "defaultChecked" ||
      (name === "value" && (input || textarea || output || numericValue)) ||
      (name === "checked" && input)
    ) {
      (formProperties ??= new Map()).set(name, value);
      continue;
    }
    if (select && name === "value") {
      selectValue = value;
      hasSelectValue = true;
      continue;
    }
    if (select && name === "multiple") selectMultiple = value;
    if (name === "ref") {
      if (value == null) continue;
      if (typeof value !== "function")
        throw new TypeError("ref must be a callback");
      untrack(() => value(element));
    } else if (name.startsWith("on") && registerEvents) {
      onCleanup(registerEvents(element, name, value));
    } else if (name.startsWith("on")) {
      if (value == null) continue;
      const object =
        typeof value === "object"
          ? (value as EventListenerObject & AddEventListenerOptions)
          : undefined;
      if (
        typeof value !== "function" &&
        typeof object?.handleEvent !== "function"
      )
        throw new TypeError(
          `${name} must be an event handler or handleEvent object`,
        );
      const event = name.startsWith("on:")
        ? name.slice(3)
        : name.slice(2).toLowerCase();
      const listener = value as EventListenerOrEventListenerObject;
      const options = object
        ? {
            capture: Boolean(object.capture),
            once: object.once,
            passive: object.passive,
            signal: object.signal,
          }
        : undefined;
      element.addEventListener(event, listener, options);
      onCleanup(() =>
        element.removeEventListener(event, listener, options?.capture),
      );
    } else if (typeof value === "function") {
      createRenderEffect(() => attribute(element, name, value()));
    } else attribute(element, name, value);
  }
  if (
    (children.length || (props && "children" in props)) &&
    !(
      textarea &&
      (formProperties?.has("defaultValue") || formProperties?.has("value"))
    )
  )
    insert(
      element,
      children.length ? children : () => props!.children as DOMChild,
    );
  // Defaults define reset state; live value/checked override it without controlled reset handling.
  if (formProperties)
    for (const name of ["defaultValue", "defaultChecked", "value", "checked"]) {
      if (!formProperties.has(name)) continue;
      const value = formProperties.get(name);
      if ((output || numericValue) && name === "value") {
        // Match the initial nullish cache: leave defaults untouched until a value changes.
        let previous: unknown;
        const apply = (next: unknown) => {
          const normalized = next ?? undefined;
          if (previous === normalized) return;
          previous = normalized;
          attribute(element, name, next);
        };
        if (typeof value === "function")
          createRenderEffect(() => apply(value()));
        else apply(value);
      } else if (typeof value === "function")
        createRenderEffect(() => attribute(element, name, value()));
      else attribute(element, name, value);
    }
  if (select && hasSelectValue) {
    const value = selectValue;
    const multiple = selectMultiple;
    const update = () => {
      if (typeof multiple === "function") multiple();
      attribute(
        element,
        "value",
        typeof value === "function" ? value() : value,
      );
    };
    selectUpdates.set(element, update);
    onCleanup(() => selectUpdates.delete(element));
    createRenderEffect(update);
  }
  return element;
}

export function render(
  fn: () => DOMChild,
  container: Element | ShadowRoot,
): () => void {
  let dispose = () => {};
  try {
    return createRoot((stop) => {
      dispose = stop;
      const previousNamespace = namespace;
      namespace = childrenNamespace(container);
      try {
        insert(container, fn());
      } finally {
        namespace = previousNamespace;
      }
      return stop;
    });
  } catch (error) {
    try {
      dispose();
    } catch {
      // Cleanup failures must not hide the original mount error.
    }
    throw error;
  }
}

export { attribute as setAttributeValue };

export { templateRetentionKey };
type TemplateRetention = {
  retain: (node: Node) => boolean;
  active: boolean;
  roots: readonly Node[];
  parent?: TemplateRetention;
};
function retainedTemplateNode(
  token: TemplateRetention | undefined,
  node: Node,
): boolean {
  for (let current = token; current; current = current.parent)
    if (
      current.active &&
      current.roots.some((root) => root === node || root.contains(node))
    )
      return true;
  return false;
}
/** Compiler-owned block teardown; nested insertions inherit its explicit retention policy. */
export function templateBlock<T extends Node | readonly Node[]>(
  build: (retain: (node: Node) => boolean) => T,
): T {
  const owner = getOwner();
  if (!owner || owner.disposed || owner.disposing)
    throw Error("Template block requires a live owner");
  const previous = owner.context;
  const token: TemplateRetention = {
    retain: (node) => retainedTemplateNode(token, node),
    active: false,
    roots: [],
    parent: previous?.get(templateRetentionKey) as
      TemplateRetention | undefined,
  };
  let roots: Node | readonly Node[] = [];
  onBeforeDispose(() => {
    const captured = new Set<Node>();
    for (const node of Array.isArray(roots) ? roots : [roots as Node]) {
      const metadata = range(node);
      for (const root of metadata
        ? (rangeSpan(node, metadata.end) ?? rangeOwned(node))
        : [node])
        captured.add(root);
    }
    token.roots = [...captured];
    token.active = true;
    let failed = false,
      failure: unknown;
    for (const node of token.roots) {
      if (retainedTemplateNode(token.parent, node)) continue;
      try {
        node.parentNode?.removeChild(node);
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
      }
    }
    if (failed) throw failure;
  });
  owner.context = new Map(previous);
  owner.context.set(templateRetentionKey, token);
  try {
    const result = build(token.retain);
    if (owner.disposed)
      throw Error("Template block disposed during construction");
    roots = result;
    return result;
  } finally {
    if (!owner.disposed) owner.context = previous;
  }
}
