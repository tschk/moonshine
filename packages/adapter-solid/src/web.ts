/**
 * Independent Solid `solid-js/web` runtime surface backed by the Moonshine reactive graph.
 * Source-level components (`Portal`, `Dynamic`, `Show`, `For`, `Index`, `Switch`, `Match`,
 * `ErrorBoundary`, `Suspense`, `SuspenseList`) and DOM manipulation helpers (`render`,
 * `insert`, `spread`, `assign`, `style`, `classList`, `setAttribute`, `addEventListener`,
 * `delegateEvents`, `clearDelegatedEvents`, `generateHydrationScript`, `HydrationScript`,
 * `NoHydration`, `Assets`).
 */
import {
  createRenderEffect,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { renderToString } from "@tschk/moonshine-dom/ssr";
import { render } from "./cleanup-policy";
import { createComponent, h } from "./component-factory";
import {
  createDynamic,
  Dynamic,
  type DynamicComponent,
  type DynamicProps,
} from "./dynamic";
import { Portal } from "./portal";
import {
  DEV,
  ErrorBoundary,
  For,
  Index,
  Match,
  mergeProps,
  Show,
  splitProps,
  Suspense,
  SuspenseList,
  Switch,
  type ConditionalProps,
  type SuspenseListProps,
  type SuspenseProps,
  type SwitchChild,
} from "./solid";

export const isServer: boolean = false;
export const isDev: boolean = false;

export {
  DEV,
  Dynamic,
  ErrorBoundary,
  For,
  Index,
  Match,
  Portal,
  Show,
  Suspense,
  SuspenseList,
  Switch,
  createComponent,
  createDynamic,
  h,
  mergeProps,
  render,
  renderToString,
  splitProps,
  type ConditionalProps,
  type DynamicComponent,
  type DynamicProps,
  type SuspenseListProps,
  type SuspenseProps,
  type SwitchChild,
};

export function setAttribute(
  node: Element,
  name: string,
  value: unknown,
): void {
  if (value == null || value === false) {
    node.removeAttribute(name);
  } else {
    node.setAttribute(name, value === true ? "" : String(value));
  }
}

export function setAttributeNS(
  node: Element,
  namespace: string,
  name: string,
  value: unknown,
): void {
  if (value == null || value === false) {
    node.removeAttributeNS(namespace, name);
  } else {
    node.setAttributeNS(namespace, name, value === true ? "" : String(value));
  }
}

export function classList(
  node: Element,
  value: Record<string, boolean | undefined | null> | undefined | null,
  prev: Record<string, boolean> = {},
): Record<string, boolean> {
  const classKeys = Object.keys(value || {});
  const prevKeys = Object.keys(prev);
  for (let i = 0; i < prevKeys.length; i++) {
    const key = prevKeys[i]!;
    if (!key || key === "undefined" || (value && value[key])) continue;
    toggleClassKey(node, key, false);
    delete prev[key];
  }
  for (let i = 0; i < classKeys.length; i++) {
    const key = classKeys[i]!;
    const classValue = Boolean(value![key]);
    if (
      !key ||
      key === "undefined" ||
      prev[key] === classValue ||
      !classValue
    ) {
      continue;
    }
    toggleClassKey(node, key, true);
    prev[key] = classValue;
  }
  return prev;
}

function toggleClassKey(node: Element, key: string, value: boolean): void {
  const names = key.trim().split(/\s+/);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (name) {
      node.classList.toggle(name, value);
    }
  }
}

export function style(
  node: Element & { style?: CSSStyleDeclaration },
  value:
    | Record<string, string | number | null | undefined>
    | string
    | null
    | undefined,
  prev?: Record<string, string | number | null | undefined> | string,
): Record<string, string | number | null | undefined> | string {
  if (!node.style) return "";
  if (!value) {
    node.removeAttribute("style");
    return {};
  }
  if (typeof value === "string") {
    node.style.cssText = value;
    return value;
  }
  if (typeof prev === "string") {
    node.style.cssText = "";
    prev = undefined;
  }
  prev = prev || {};
  for (const k of Object.keys(prev)) {
    if (value[k] == null) {
      node.style.removeProperty(k);
      delete prev[k];
    }
  }
  for (const [k, v] of Object.entries(value)) {
    if (v != null && v !== prev[k]) {
      node.style.setProperty(k, String(v));
      prev[k] = v;
    }
  }
  return prev;
}

export function addEventListener(
  node: Element,
  name: string,
  handler: EventListener | [Function, unknown] | null | undefined,
  _delegate?: boolean,
): void {
  if (!handler) return;
  const wrapped: EventListener = Array.isArray(handler)
    ? (e: Event) => handler[0](handler[1], e)
    : handler;
  node.addEventListener(name.toLowerCase(), wrapped);
  onCleanup(() => {
    node.removeEventListener(name.toLowerCase(), wrapped);
  });
}

export function assign<T extends Element>(
  node: T,
  props: Record<string, any>,
  isSVG?: boolean,
  skipChildren?: boolean,
  prevProps: Record<string, any> = {},
  skipRef = false,
): void {
  props = props || {};
  for (const prop of Object.keys(prevProps)) {
    if (!(prop in props)) {
      if (prop === "children") continue;
      prevProps[prop] = assignProp(
        node,
        prop,
        null,
        prevProps[prop],
        isSVG,
        skipRef,
      );
    }
  }
  for (const prop of Object.keys(props)) {
    if (prop === "children") {
      if (!skipChildren) {
        insert(node, props.children);
      }
      continue;
    }
    const value = props[prop];
    prevProps[prop] = assignProp(
      node,
      prop,
      value,
      prevProps[prop],
      isSVG,
      skipRef,
    );
  }
}

function assignProp(
  node: Element,
  prop: string,
  value: any,
  prev: any,
  isSVG?: boolean,
  skipRef?: boolean,
): any {
  if (prop === "style") {
    return style(node as HTMLElement, value, prev);
  }
  if (prop === "classList") {
    return classList(node, value, prev);
  }
  if (value === prev) return prev;
  if (prop === "ref") {
    if (!skipRef && typeof value === "function") {
      value(node);
    }
    return value;
  }
  if (prop.slice(0, 3) === "on:") {
    const e = prop.slice(3);
    if (prev) node.removeEventListener(e, prev);
    if (value) node.addEventListener(e, value);
    return value;
  }
  if (prop.slice(0, 10) === "oncapture:") {
    const e = prop.slice(10);
    if (prev) node.removeEventListener(e, prev, true);
    if (value) node.addEventListener(e, value, true);
    return value;
  }
  if (prop.slice(0, 2) === "on") {
    const name = prop.slice(2).toLowerCase();
    const nextListener = Array.isArray(value)
      ? (ev: Event) => value[0](value[1], ev)
      : value;
    if (prev) node.removeEventListener(name, prev);
    if (typeof nextListener === "function") {
      node.addEventListener(name, nextListener);
    }
    return nextListener;
  }
  if (prop === "class" || prop === "className") {
    setAttribute(node, "class", value);
    return value;
  }
  if (!isSVG && prop in node) {
    try {
      (node as any)[prop] = value ?? "";
      return value;
    } catch {
      // fall through to setAttribute
    }
  }
  setAttribute(node, prop, value);
  return value;
}

export function spread<T extends Element>(
  node: T,
  props: Record<string, any> | (() => Record<string, any>) = {},
  isSVG?: boolean,
  skipChildren?: boolean,
): Record<string, any> {
  const prevProps: Record<string, any> = {};
  if (!skipChildren && typeof props === "object" && "children" in props) {
    createRenderEffect(() => {
      insert(node, (props as Record<string, any>).children);
    });
  }
  createRenderEffect(() => {
    const resolved = typeof props === "function" ? props() : props;
    if (resolved && typeof resolved.ref === "function") {
      untrack(() => resolved.ref(node));
    }
  });
  createRenderEffect(() => {
    const resolved = typeof props === "function" ? props() : props;
    assign(node, resolved, isSVG, true, prevProps, true);
  });
  return prevProps;
}

export function insert<T>(
  parent: Node,
  accessor: T | (() => T),
  marker?: Node | null,
  initial?: any,
): any {
  if (marker !== undefined && !initial) initial = [];
  if (typeof accessor !== "function") {
    return insertExpression(parent, accessor, initial, marker);
  }
  createRenderEffect(
    (current: any) =>
      insertExpression(parent, (accessor as () => T)(), current, marker),
    initial,
  );
}

function insertExpression(
  parent: Node,
  value: any,
  current: any,
  marker?: Node | null,
): any {
  while (typeof current === "function") current = current();
  if (value === current) return current;
  const t = typeof value;
  if (t === "string" || t === "number") {
    const str = String(value);
    if (t === "number" && str === "") return current;
    if (
      marker === undefined &&
      current &&
      typeof current === "object" &&
      current.nodeType === 3
    ) {
      current.data = str;
      return current;
    }
    if (marker === undefined) {
      parent.textContent = str;
      return parent.firstChild ?? str;
    }
    if (typeof document !== "undefined") {
      const textNode = document.createTextNode(str);
      cleanChildren(parent, current, marker, textNode);
      return textNode;
    }
    return str;
  }
  if (value == null || t === "boolean") {
    cleanChildren(parent, current, marker);
    return null;
  }
  if (t === "function") {
    createRenderEffect(() => {
      let v = value();
      while (typeof v === "function") v = v();
      current = insertExpression(parent, v, current, marker);
    });
    return () => current;
  }
  if (Array.isArray(value)) {
    const nodes: Node[] = [];
    for (const item of value.flat(Infinity)) {
      if (item == null || typeof item === "boolean") continue;
      if (typeof item === "object" && "nodeType" in item) {
        nodes.push(item as Node);
      } else if (typeof document !== "undefined") {
        nodes.push(document.createTextNode(String(item)));
      }
    }
    cleanChildren(parent, current, marker);
    for (const n of nodes) {
      parent.insertBefore(n, marker ?? null);
    }
    return nodes;
  }
  if (typeof value === "object" && "nodeType" in value) {
    cleanChildren(parent, current, marker, value as Node);
    return value;
  }
  return current;
}

function cleanChildren(
  parent: Node,
  current: any,
  marker?: Node | null,
  replacement?: Node,
): void {
  if (marker === undefined) {
    parent.textContent = "";
    if (replacement) parent.appendChild(replacement);
    return;
  }
  if (Array.isArray(current)) {
    for (const n of current) {
      if (n && n.parentNode === parent) parent.removeChild(n);
    }
  } else if (
    current &&
    typeof current === "object" &&
    current.parentNode === parent
  ) {
    parent.removeChild(current);
  }
  if (replacement) {
    parent.insertBefore(replacement, marker);
  }
}

const DELEGATED_EVENTS_SYMBOL = Symbol.for("moonshine-solid-delegated-events");

export function delegateEvents(
  eventNames: readonly string[],
  doc: Document | undefined = typeof document !== "undefined"
    ? document
    : undefined,
): void {
  if (!doc) return;
  let set = (doc as unknown as Record<symbol, Set<string> | undefined>)[
    DELEGATED_EVENTS_SYMBOL
  ];
  if (!set) {
    set = new Set<string>();
    (doc as unknown as Record<symbol, Set<string>>)[DELEGATED_EVENTS_SYMBOL] =
      set;
  }
  for (const name of eventNames) {
    set.add(name);
  }
}

export function clearDelegatedEvents(
  doc: Document | undefined = typeof document !== "undefined"
    ? document
    : undefined,
): void {
  if (!doc) return;
  const set = (doc as unknown as Record<symbol, Set<string> | undefined>)[
    DELEGATED_EVENTS_SYMBOL
  ];
  set?.clear();
}

export function generateHydrationScript(_options?: {
  nonce?: string;
  eventNames?: string[];
}): string {
  return "";
}

export function HydrationScript(_props?: {
  nonce?: string;
  eventNames?: string[];
}): undefined {
  return undefined;
}

export function NoHydration<T>(props: { children?: T }): T | undefined {
  return props.children;
}

export function Assets<T>(_props: { children?: T }): undefined {
  return undefined;
}

export {
  FETCH_EVENT_TYPE,
  createSolidRequestEvent,
  getRequestEvent,
  withSolidRequestEvent,
  type PageEvent,
  type RequestEvent,
  type ResponseStub,
  type SolidRequestEventInit,
} from "./request-event";
