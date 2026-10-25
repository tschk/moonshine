import {
  createComponent,
  peekComponentContext,
  type ComponentContext,
} from "@tschk/moonshine-dom/component";
import { flushComponentReferences } from "@tschk/moonshine-dom/component-instance";
import { render, type DOMChild } from "@tschk/moonshine-dom/dom";
import { getOwner, onCleanup } from "@tschk/moonshine-dom/reactive";
import { h as hSSR, type SSRChild } from "@tschk/moonshine-dom/ssr";
import {
  appContextKey,
  peekAppContext,
  withActiveAppContext,
  type AppConfig,
  type AppContextState,
  type InjectionKey,
} from "./context";
import { componentErrorKey, type ComponentErrorInfo } from "./error-context";
export type { AppConfig } from "./context";
export type { ShallowUnwrap } from "./expose";

/** Erased return metadata supplied only by the native SFC compiler. */
declare const componentMetadata: unique symbol;
export type ComponentView<
  View,
  Exports extends object,
  Props extends object = object,
> = View & {
  readonly [componentMetadata]?: { props: Props; exports: Exports };
};
type Metadata<R> = [R] extends [never]
  ? never
  : typeof componentMetadata extends keyof NonNullable<R>
    ? NonNullable<NonNullable<R>[typeof componentMetadata]>
    : never;
export type ComponentProps<C extends (...args: never[]) => unknown> = [
  Metadata<ReturnType<C>>,
] extends [never]
  ? never
  : Metadata<ReturnType<C>> extends { props: infer P extends object }
    ? P
    : never;
export type ComponentExports<C extends (...args: never[]) => unknown> = [
  Metadata<ReturnType<C>>,
] extends [never]
  ? never
  : Metadata<ReturnType<C>> extends { exports: infer E extends object }
    ? E
    : never;
type ExportsOf<R> = [Metadata<R>] extends [never]
  ? object
  : Metadata<R> extends { exports: infer E extends object }
    ? E
    : object;

export interface DirectiveBinding<
  V = any,
  M extends string = string,
  A extends string = string,
> {
  instance: ComponentContext | null;
  value: V;
  oldValue: V | null;
  arg?: A;
  modifiers: Partial<Record<M, boolean>>;
  dir: ObjectDirective<any, V, M, A>;
}

export type DirectiveHook<
  HostElement = any,
  V = any,
  M extends string = string,
  A extends string = string,
> = (
  el: HostElement,
  binding: DirectiveBinding<V, M, A>,
  vnode?: null,
  prevVNode?: null,
) => void;

export interface ObjectDirective<
  HostElement = any,
  V = any,
  M extends string = string,
  A extends string = string,
> {
  created?: DirectiveHook<HostElement, V, M, A>;
  beforeMount?: DirectiveHook<HostElement, V, M, A>;
  mounted?: DirectiveHook<HostElement, V, M, A>;
  beforeUpdate?: DirectiveHook<HostElement, V, M, A>;
  updated?: DirectiveHook<HostElement, V, M, A>;
  beforeUnmount?: DirectiveHook<HostElement, V, M, A>;
  unmounted?: DirectiveHook<HostElement, V, M, A>;
  getSSRProps?: (
    binding: DirectiveBinding<V, M, A>,
    vnode?: null,
  ) => Record<string, any> | undefined;
  deep?: boolean;
}

export type FunctionDirective<
  HostElement = any,
  V = any,
  M extends string = string,
  A extends string = string,
> = DirectiveHook<HostElement, V, M, A>;

export type Directive<
  HostElement = any,
  V = any,
  M extends string = string,
  A extends string = string,
> =
  | ObjectDirective<HostElement, V, M, A>
  | FunctionDirective<HostElement, V, M, A>;

export type DirectiveArguments = Array<
  | [Directive | undefined]
  | [Directive | undefined, any]
  | [Directive | undefined, any, string]
  | [Directive | undefined, any, string | undefined, Record<string, boolean>]
>;

export type FunctionPlugin<Options = any[]> = Options extends unknown[]
  ? (app: NativeApplication<any>, ...options: Options) => any
  : (app: NativeApplication<any>, options: Options) => any;

export type ObjectPlugin<Options = any[]> = {
  install: FunctionPlugin<Options>;
};

export type Plugin<Options = any[]> =
  FunctionPlugin<Options> | ObjectPlugin<Options>;

export function definePlugin<Options = any[]>(
  plugin: Plugin<Options>,
): Plugin<Options> {
  return plugin;
}

export const renderAppSSRSymbol = /* @__PURE__ */ Symbol(
  "moonshine.vue.app.ssr",
);

export interface NativeApplication<out E extends object = object> {
  readonly version: string;
  readonly config: AppConfig;
  readonly _context: {
    app: NativeApplication<any>;
    config: AppConfig;
    mixins: Array<Record<string, any>>;
    components: Record<string, (...args: any[]) => any>;
    directives: Record<string, Directive>;
    provides: Record<PropertyKey, unknown>;
  };
  use<Options extends unknown[]>(
    plugin: Plugin<Options>,
    ...options: Options
  ): this;
  use<Options>(plugin: Plugin<Options>, options: Options): this;
  provide<T>(key: InjectionKey<T> | string | number, value: T): this;
  runWithContext<T>(fn: () => T): T;
  component(name: string): ((...args: any[]) => any) | undefined;
  component<T extends (...args: any[]) => any>(
    name: string,
    component: T,
  ): this;
  directive(name: string): Directive | undefined;
  directive(name: string, directive: Directive): this;
  mixin(mixin: Record<string, any>): this;
  onUnmount(cb: () => void): void;
  mount(target: string | Element | ShadowRoot): E;
  unmount(): void;
  readonly [renderAppSSRSymbol]?: () => SSRChild;
}

export type App<E extends object = object> = NativeApplication<E>;

const emptyInstance: object = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ Object.create(null),
);
const leases = /* @__PURE__ */ new WeakMap<
  Element | ShadowRoot,
  NativeApplication
>();

// Validate async/VNode results without evaluating accessor children ahead of insert.
function content(value: DOMChild): DOMChild {
  if (typeof value === "function") return () => content(value());
  if (Array.isArray(value)) return value.map(content);
  if (value !== null && typeof value === "object" && !(value instanceof Node)) {
    if (value instanceof Promise)
      void Promise.prototype.then.call(value, undefined, () => {});
    throw new TypeError(
      "Native applications require DOM children, not promises or VNodes",
    );
  }
  return value;
}

function attachAppOwnerContext(appState: AppContextState): void {
  const scope = getOwner();
  if (!scope) return;
  scope.context = new Map(scope.context);
  scope.context.set(appContextKey, appState);
  scope.context.set(
    componentErrorKey,
    (error: unknown, info: ComponentErrorInfo) => {
      if (appState.config.errorHandler) {
        appState.config.errorHandler(error, info.component, info.phase);
      } else {
        throw error;
      }
    },
  );
}

/** Mount a native compiled/component factory; this does not execute Vue VNodes. */
export function createApp<R extends DOMChild>(
  component: (props?: Record<string, never>) => R,
): NativeApplication<ExportsOf<R>>;
export function createApp<P extends object, R extends DOMChild>(
  component: (props: P) => R,
  props: P,
): NativeApplication<ExportsOf<R>>;
export function createApp<
  P extends object = Record<string, any>,
  R extends DOMChild = DOMChild,
>(component: (props: P) => R, props?: P): NativeApplication<ExportsOf<R>> {
  if (typeof component !== "function")
    throw new TypeError("Native applications require a component factory");
  const resolvedProps = (arguments.length > 1 ? props : ({} as P)) as P;
  if (
    resolvedProps === null ||
    typeof resolvedProps !== "object" ||
    Array.isArray(resolvedProps)
  )
    throw new TypeError("Native application props must be an object");

  const config: AppConfig = {
    errorHandler: undefined,
    warnHandler: undefined,
    globalProperties: {},
    performance: false,
    idPrefix: undefined,
    compilerOptions: {},
    optionMergeStrategies: {},
    throwUnhandledErrorInProduction: false,
  };

  const appState: AppContextState = {
    provides: new Map(),
    components: new Map(),
    directives: new Map(),
    mixins: [],
    config,
    idState: { next: 0 },
  };

  const installedPlugins = new Set<unknown>();
  const unmountCallbacks: Array<() => void> = [];

  let state: "new" | "mounting" | "mounted" | "stopped" = "new";
  let stop: (() => void) | undefined;
  const stopped = () => state === "stopped";
  const unmount = () => {
    if (state === "new" || state === "stopped") return;
    state = "stopped";
    const dispose = stop;
    stop = undefined;
    let firstError: unknown;
    let hasError = false;
    try {
      dispose?.();
    } catch (err) {
      firstError = err;
      hasError = true;
    }
    for (const cb of unmountCallbacks.splice(0)) {
      try {
        cb();
      } catch (err) {
        if (config.errorHandler) {
          config.errorHandler(err, undefined, "app unmount");
        } else if (!hasError) {
          firstError = err;
          hasError = true;
        }
      }
    }
    if (hasError) {
      throw firstError;
    }
  };

  const componentsRecord: Record<string, (...args: any[]) => any> = {};
  const directivesRecord: Record<string, Directive> = {};
  const providesRecord: Record<PropertyKey, unknown> = Object.create(null);

  const appContextObj = {
    get app() {
      return app;
    },
    config,
    mixins: appState.mixins,
    components: componentsRecord,
    directives: directivesRecord,
    provides: providesRecord,
  };

  const app = {
    mount(target: string | Element | ShadowRoot) {
      if (state !== "new")
        throw new Error("Native application cannot be mounted again");
      if (typeof document === "undefined")
        throw new Error("Native application mount requires a DOM");
      const container =
        typeof target === "string" ? document.querySelector(target) : target;
      if (!(container instanceof Element) && !(container instanceof ShadowRoot))
        throw new TypeError(
          "Native application mount target was not found or is invalid",
        );
      if (leases.has(container))
        throw new Error("Native application mount target is already owned");
      const release = () => {
        if (leases.get(container) === app) leases.delete(container);
      };
      // Clearing and disposal can synchronously reenter another app mount.
      leases.set(container, app);
      state = "mounting";
      let instance: object | undefined;
      try {
        container.replaceChildren();
        if (stopped()) {
          release();
          return emptyInstance as ExportsOf<R>;
        }
        const dispose = render(() => {
          attachAppOwnerContext(appState);
          return withActiveAppContext(appState, () =>
            createComponent(
              (input: P) => content(component(input)),
              resolvedProps,
              "dom",
              {
                capture: (value) => {
                  instance = value;
                },
              },
            ),
          );
        }, container);
        const finish = () => {
          try {
            dispose();
          } finally {
            release();
          }
        };
        if (stopped()) finish();
        else {
          flushComponentReferences();
          stop = finish;
          state = "mounted";
        }
        return (instance ?? emptyInstance) as ExportsOf<R>;
      } catch (error) {
        release();
        state = "stopped";
        throw error;
      }
    },
    unmount,
    [renderAppSSRSymbol]() {
      appState.idState.next = 0;
      attachAppOwnerContext(appState);
      return withActiveAppContext(appState, () =>
        hSSR(component as unknown as (props: P) => SSRChild, resolvedProps),
      );
    },
  } as NativeApplication<ExportsOf<R>>;

  Object.defineProperties(app, {
    version: { value: "3.5.13", writable: false, configurable: true },
    config: { value: config, writable: false, configurable: true },
    _context: { value: appContextObj, writable: false, configurable: true },
    use: {
      value(plugin: Plugin<any>, ...options: any[]) {
        if (installedPlugins.has(plugin)) {
          return app;
        }
        if (plugin && typeof (plugin as ObjectPlugin).install === "function") {
          installedPlugins.add(plugin);
          withActiveAppContext(appState, () =>
            (plugin as ObjectPlugin).install(app, ...options),
          );
        } else if (typeof plugin === "function") {
          installedPlugins.add(plugin);
          withActiveAppContext(appState, () =>
            (plugin as (...args: any[]) => any)(app, ...options),
          );
        }
        return app;
      },
      writable: true,
      configurable: true,
    },
    provide: {
      value(key: PropertyKey, value: unknown) {
        appState.provides.set(key, value);
        providesRecord[key] = value;
        return app;
      },
      writable: true,
      configurable: true,
    },
    runWithContext: {
      value<T>(fn: () => T): T {
        return withActiveAppContext(appState, fn);
      },
      writable: true,
      configurable: true,
    },
    component: {
      value(name: string, comp?: (...args: any[]) => any): any {
        if (comp === undefined) {
          return appState.components.get(name);
        }
        appState.components.set(name, comp);
        componentsRecord[name] = comp;
        return app;
      },
      writable: true,
      configurable: true,
    },
    directive: {
      value(name: string, dir?: Directive): any {
        if (dir === undefined) {
          return appState.directives.get(name);
        }
        appState.directives.set(name, dir);
        directivesRecord[name] = dir;
        return app;
      },
      writable: true,
      configurable: true,
    },
    mixin: {
      value(mixin: Record<string, any>) {
        if (!appState.mixins.includes(mixin)) {
          appState.mixins.push(mixin);
        }
        return app;
      },
      writable: true,
      configurable: true,
    },
    onUnmount: {
      value(cb: () => void) {
        if (typeof cb === "function") {
          unmountCallbacks.push(cb);
        }
      },
      writable: true,
      configurable: true,
    },
  });
  return app;
}

/** Create an SSR-capable native Vue application instance. */
export function createSSRApp<P extends object = Record<string, any>, R = any>(
  component: (props: P) => R,
  props?: P,
): NativeApplication<ExportsOf<R>> {
  return (
    arguments.length > 1
      ? createApp(component as unknown as (props: P) => DOMChild, props!)
      : createApp(component as unknown as () => DOMChild)
  ) as NativeApplication<ExportsOf<R>>;
}

/** Resolve a globally registered component from the active application context. */
export function resolveComponent(
  name: string,
): ((...args: any[]) => any) | string {
  const appCtx = peekAppContext();
  return appCtx?.components.get(name) ?? name;
}

/** Resolve a globally registered custom directive from the active application context. */
export function resolveDirective(name: string): Directive | undefined {
  return peekAppContext()?.directives.get(name);
}

/** Apply custom directives to a rendered DOM element or SSR props object. */
export function withDirectives<T>(node: T, directives: DirectiveArguments): T {
  const instance = peekComponentContext() ?? null;
  if (typeof Element !== "undefined" && node instanceof Element) {
    for (const entry of directives) {
      const dir = entry[0];
      if (!dir) continue;
      const value = entry[1];
      const arg = entry[2];
      const modifiers = entry[3] ?? {};
      const dirObj: ObjectDirective =
        typeof dir === "function" ? { mounted: dir, updated: dir } : dir;
      const binding: DirectiveBinding = {
        instance,
        value,
        oldValue: null,
        arg,
        modifiers,
        dir: dirObj,
      };
      dirObj.created?.(node, binding, null, null);
      dirObj.beforeMount?.(node, binding, null, null);
      dirObj.mounted?.(node, binding, null, null);
      if (getOwner() && (dirObj.beforeUnmount || dirObj.unmounted)) {
        onCleanup(() => {
          dirObj.beforeUnmount?.(node, binding, null, null);
          dirObj.unmounted?.(node, binding, null, null);
        });
      }
    }
    return node;
  }
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    const merged: Record<string, any> = { ...(node as Record<string, any>) };
    for (const entry of directives) {
      const dir = entry[0];
      if (!dir || typeof dir === "function") continue;
      const value = entry[1];
      const arg = entry[2];
      const modifiers = entry[3] ?? {};
      const binding: DirectiveBinding = {
        instance,
        value,
        oldValue: null,
        arg,
        modifiers,
        dir,
      };
      const ssrProps = dir.getSSRProps?.(binding, null);
      if (ssrProps && typeof ssrProps === "object") {
        Object.assign(merged, ssrProps);
      }
    }
    return merged as T;
  }
  return node;
}

/** Emit a warning through the active application's `config.warnHandler` or `console.warn`. */
export function warn(msg: string, ...args: unknown[]): void {
  const appCtx = peekAppContext();
  const instance = peekComponentContext();
  if (appCtx?.config.warnHandler) {
    appCtx.config.warnHandler(msg, instance, "");
    return;
  }
  console.warn(`[Vue warn]: ${msg}`, ...args);
}
