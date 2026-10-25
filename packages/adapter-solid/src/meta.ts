/**
 * Host-free `@solidjs/meta` replacement on the Moonshine reactive graph.
 * Provides `MetaProvider`, `Title`, `Meta`, `Link`, `Style`, `Base`,
 * `useHead`, and `renderTags` with cascading override semantics for both
 * browser DOM (`document.head` / `document.title`) and SSR (`tags` collector
 * + `renderTags`).
 */
import {
  createRenderEffect,
  getOwner,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { defer, h as hSSR } from "@tschk/moonshine-dom/ssr";
import { isSSRRendering } from "@tschk/moonshine-dom/ssr-owner";
import {
  head as ssrHead,
  title as ssrTitle,
} from "@tschk/moonshine-dom/head-ssr";
import { h as hDOM } from "./component-factory";
import { createContext, useContext } from "./context";

export interface TagDescription {
  tag: string;
  props: Record<string, any>;
  setting?: {
    close?: boolean;
    escape?: boolean;
  };
  id: string;
  name?: string;
  ref?: Element;
}

export interface MetaProviderProps {
  tags?: Array<TagDescription>;
  children?: any;
}

interface MetaContextType {
  addTag(tag: TagDescription): number;
  removeTag(tag: TagDescription, index: number): void;
}

const MetaContext = createContext<MetaContextType | undefined>(undefined);

const cascadingTags = new Set(["title", "meta", "base"]);

function getTagKey(tag: TagDescription): string | undefined {
  const lower = tag.tag.toLowerCase();
  if (lower === "title") return "title";
  if (lower === "base") return "base";
  if (lower === "meta") {
    if (tag.props.name) return `meta:name:${tag.props.name}`;
    if (tag.props.property) return `meta:property:${tag.props.property}`;
    if (tag.props.httpEquiv || tag.props["http-equiv"]) {
      return `meta:http-equiv:${tag.props.httpEquiv ?? tag.props["http-equiv"]}`;
    }
    if (tag.props.charset || tag.props.charSet) return "meta:charset";
  }
  return undefined;
}

function resolveChildrenText(children: any): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "function") return resolveChildrenText(children());
  if (Array.isArray(children)) {
    return children.map((c) => resolveChildrenText(c)).join("");
  }
  return String(children);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

let tagIdCounter = 0;

function createClientMetaManager(tags: TagDescription[]): MetaContextType {
  const instances = new Map<string, TagDescription[]>();

  const syncCascadingKey = (key: string) => {
    const stack = instances.get(key) ?? [];
    const active = stack[stack.length - 1];
    if (typeof document === "undefined" || !document.head) return;

    if (key === "title") {
      if (active) {
        const text = resolveChildrenText(active.props.children);
        document.title = text;
      }
      return;
    }

    for (let i = 0; i < stack.length - 1; i++) {
      const item = stack[i]!;
      if (item.ref && item.ref.parentNode === document.head) {
        document.head.removeChild(item.ref);
      }
    }
    if (active && active.ref && active.ref.parentNode !== document.head) {
      document.head.appendChild(active.ref);
    }
  };

  return {
    addTag(tag: TagDescription): number {
      const key = getTagKey(tag);
      if (key) {
        const existingIdx = tags.findIndex((t) => getTagKey(t) === key);
        if (existingIdx >= 0) {
          tags.splice(existingIdx, 1, tag);
        } else {
          tags.push(tag);
        }
        let stack = instances.get(key);
        if (!stack) {
          stack = [];
          instances.set(key, stack);
        }
        stack.push(tag);
        syncCascadingKey(key);
        return stack.length - 1;
      }

      tags.push(tag);
      if (
        typeof document !== "undefined" &&
        document.head &&
        tag.ref &&
        tag.ref.parentNode !== document.head
      ) {
        document.head.appendChild(tag.ref);
      }
      return tags.length - 1;
    },
    removeTag(tag: TagDescription, _index: number): void {
      const idx = tags.indexOf(tag);
      if (idx >= 0) tags.splice(idx, 1);

      const key = getTagKey(tag);
      if (key) {
        const stack = instances.get(key);
        if (stack) {
          const sIdx = stack.indexOf(tag);
          if (sIdx >= 0) stack.splice(sIdx, 1);
          if (stack.length > 0) {
            const top = stack[stack.length - 1]!;
            if (!tags.includes(top)) tags.push(top);
          }
          syncCascadingKey(key);
        }
      }
      if (tag.ref && tag.ref.parentNode) {
        tag.ref.parentNode.removeChild(tag.ref);
      }
    },
  };
}

const defaultClientTags: TagDescription[] = [];
const defaultClientManager = createClientMetaManager(defaultClientTags);

export function MetaProvider(props: MetaProviderProps): any {
  const tags = props.tags ?? [];
  const manager = createClientMetaManager(tags);
  const isSSR = isSSRRendering();
  const h: (...args: any[]) => any = isSSR ? hSSR : hDOM;

  const currentOwner = getOwner();
  if (currentOwner) {
    currentOwner.context = new Map(currentOwner.context);
    currentOwner.context.set(MetaContext.id, manager);
    if (isSSR && currentOwner.parent) {
      currentOwner.parent.context = new Map(currentOwner.parent.context);
      currentOwner.parent.context.set(MetaContext.id, manager);
    }
  }

  return h(MetaContext.Provider, {
    value: manager,
    get children() {
      return typeof props.children === "function"
        ? props.children()
        : props.children;
    },
  });
}

export function useHead(tagDesc: TagDescription): void {
  const ctx = useContext(MetaContext) ?? defaultClientManager;
  const isSSR = isSSRRendering();

  if (isSSR) {
    const resolvedProps: Record<string, any> = {};
    for (const key of Object.keys(tagDesc.props)) {
      if (key === "children") {
        resolvedProps.children = resolveChildrenText(tagDesc.props.children);
      } else {
        const val = tagDesc.props[key];
        resolvedProps[key] = typeof val === "function" ? val() : val;
      }
    }
    const snapshot: TagDescription = {
      ...tagDesc,
      props: resolvedProps,
    };
    ctx.addTag(snapshot);

    try {
      if (tagDesc.tag === "title") {
        ssrTitle(() => resolvedProps.children ?? "");
      } else {
        const { children, ...attrs } = resolvedProps;
        ssrHead(() =>
          children !== undefined && children !== ""
            ? hSSR(tagDesc.tag, attrs, children)
            : hSSR(tagDesc.tag, attrs),
        );
      }
    } catch {
      // Outside renderWithHead() scope; MetaProvider tags array still captures it.
    }
    return;
  }

  let currentDesc: TagDescription | undefined;
  let currentIndex = -1;

  createRenderEffect(() => {
    const resolvedProps: Record<string, any> = {};
    for (const key of Object.keys(tagDesc.props)) {
      if (key === "children") {
        resolvedProps.children = resolveChildrenText(tagDesc.props.children);
      } else {
        const val = tagDesc.props[key];
        resolvedProps[key] = typeof val === "function" ? val() : val;
      }
    }

    if (currentDesc) {
      ctx.removeTag(currentDesc, currentIndex);
    }

    let el: Element | undefined;
    if (
      typeof document !== "undefined" &&
      tagDesc.tag.toLowerCase() !== "title"
    ) {
      el = document.createElement(tagDesc.tag);
      for (const [k, v] of Object.entries(resolvedProps)) {
        if (k === "children" || k === "ref") continue;
        if (v == null || v === false) continue;
        const attrName =
          k === "httpEquiv" ? "http-equiv" : k === "charSet" ? "charset" : k;
        el.setAttribute(attrName, v === true ? "" : String(v));
      }
      if (resolvedProps.children && tagDesc.setting?.close) {
        el.textContent = String(resolvedProps.children);
      }
    }

    currentDesc = {
      ...tagDesc,
      props: resolvedProps,
      ref: el,
    };
    currentIndex = untrack(() => ctx.addTag(currentDesc!));
  });

  if (getOwner()) {
    onCleanup(() => {
      if (currentDesc) {
        ctx.removeTag(currentDesc, currentIndex);
        currentDesc = undefined;
      }
    });
  }
}

export function renderTags(tags: Array<TagDescription>): string {
  const deduped: TagDescription[] = [];
  const seenKeys = new Map<string, number>();

  for (const tag of tags) {
    const key = getTagKey(tag);
    if (key && cascadingTags.has(tag.tag.toLowerCase())) {
      const prevIdx = seenKeys.get(key);
      if (prevIdx !== undefined) {
        deduped[prevIdx] = tag;
        continue;
      }
      seenKeys.set(key, deduped.length);
    }
    deduped.push(tag);
  }

  return deduped
    .map((tag) => {
      const name = tag.tag.toLowerCase();
      const props = tag.props || {};
      const keys = Object.keys(props)
        .filter((k) => k !== "children" && k !== "ref")
        .map((k) => {
          const val = props[k];
          if (val == null || val === false) return "";
          const attrName =
            k === "httpEquiv" ? "http-equiv" : k === "charSet" ? "charset" : k;
          if (val === true || val === "") return ` ${attrName}`;
          return ` ${attrName}="${escapeAttr(String(val))}"`;
        })
        .join("");

      if (tag.setting?.close) {
        const rawText = resolveChildrenText(props.children);
        const content =
          tag.setting.escape !== false ? escapeHtml(rawText) : rawText;
        return `<${name}${keys}>${content}</${name}>`;
      }
      return `<${name}${keys}>`;
    })
    .join("");
}

function makePropertiesProxy(props: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(props)) {
    const desc = Object.getOwnPropertyDescriptor(props, key);
    if (desc?.get) {
      out[key] = () => props[key];
    } else {
      out[key] = props[key];
    }
  }
  return out;
}

function renderHeadTag(tagDesc: TagDescription): any {
  if (isSSRRendering() && !useContext(MetaContext)) {
    return defer(() => {
      useHead(tagDesc);
      return "";
    });
  }
  useHead(tagDesc);
  return null;
}

export function Title(props: { children?: any; [key: string]: any }): any {
  return renderHeadTag({
    tag: "title",
    props: makePropertiesProxy(props),
    setting: { close: true, escape: true },
    id: `meta-${++tagIdCounter}`,
  });
}

export function Style(props: { children?: any; [key: string]: any }): any {
  return renderHeadTag({
    tag: "style",
    props: makePropertiesProxy(props),
    setting: { close: true, escape: false },
    id: `meta-${++tagIdCounter}`,
  });
}

export function Meta(props: Record<string, any>): any {
  return renderHeadTag({
    tag: "meta",
    props: makePropertiesProxy(props),
    id: `meta-${++tagIdCounter}`,
  });
}

export function Link(props: Record<string, any>): any {
  return renderHeadTag({
    tag: "link",
    props: makePropertiesProxy(props),
    id: `meta-${++tagIdCounter}`,
  });
}

export function Base(props: Record<string, any>): any {
  return renderHeadTag({
    tag: "base",
    props: makePropertiesProxy(props),
    id: `meta-${++tagIdCounter}`,
  });
}
