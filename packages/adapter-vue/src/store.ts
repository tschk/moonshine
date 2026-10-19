/**
 * Host-free Pinia-compatible store runtime on the Moonshine reactive graph.
 * Supports both Setup Stores (`defineStore(id, () => ...)`) and Option Stores
 * (`defineStore(id, { state, getters, actions })`), `$patch`, `$reset`,
 * `$subscribe`, `$onAction`, `$dispose`, plugins, and `storeToRefs`.
 */
import {
  batch,
  getOwner,
  onCleanup,
  untrack,
} from "@tschk/moonshine-dom/reactive";
import { peekComponentContext } from "@tschk/moonshine-dom/component";
import {
  computed,
  effectScope,
  getCurrentScope,
  isReactive,
  isReadonly,
  isRef,
  onScopeDispose,
  reactive,
  shallowRef,
  toRaw,
  toRef,
  watch,
  type EffectScope,
  type Ref,
  type Unwrap,
} from "./reactive";
import { inject, provide, type InjectionKey } from "./context";

export type StateTree = Record<string | number | symbol, any>;

export enum MutationType {
  direct = "direct",
  patchObject = "patch object",
  patchFunction = "patch function",
}

export interface SubscriptionCallbackMutation<S = StateTree> {
  type: MutationType;
  storeId: string;
  payload?: DeepPartial<Unwrap<S>>;
}

export type SubscriptionCallback<S = StateTree> = (
  mutation: SubscriptionCallbackMutation<S>,
  state: Unwrap<S>,
) => void;

export interface StoreSubscriptionOptions {
  detached?: boolean;
  immediate?: boolean;
  deep?: boolean;
  flush?: "sync" | "pre" | "post";
}

export interface StoreOnActionListenerContext<
  Id extends string = string,
  S extends StateTree = StateTree,
  G = Record<string, any>,
  A = Record<string, any>,
> {
  after: (callback: (resolvedReturn: any) => void) => void;
  onError: (callback: (error: unknown) => void) => void;
  name: string;
  store: Store<Id, S, G, A>;
  args: any[];
}

export type StoreOnActionListener<
  Id extends string = string,
  S extends StateTree = StateTree,
  G = Record<string, any>,
  A = Record<string, any>,
> = (context: StoreOnActionListenerContext<Id, S, G, A>) => void;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface PiniaCustomProperties {}

export interface StoreProperties<
  Id extends string = string,
> extends PiniaCustomProperties {
  readonly $id: Id;
  readonly _p: Pinia;
}

export interface Store<
  Id extends string = string,
  S extends StateTree = StateTree,
  G = Record<string, any>,
  A = Record<string, any>,
> extends StoreProperties<Id> {
  $state: Unwrap<S>;
  $patch(partialState: DeepPartial<Unwrap<S>>): void;
  $patch<F extends (state: Unwrap<S>) => any>(
    stateMutator: ReturnType<F> extends Promise<any> ? never : F,
  ): void;
  $reset(): void;
  $subscribe(
    callback: SubscriptionCallback<S>,
    options?: StoreSubscriptionOptions,
  ): () => void;
  $onAction(
    callback: StoreOnActionListener<Id, S, G, A>,
    detached?: boolean,
  ): () => void;
  $dispose(): void;
}

export type StoreGeneric = Store<
  string,
  StateTree,
  Record<string, any>,
  Record<string, any>
>;

export interface PiniaPluginContext<
  Id extends string = string,
  S extends StateTree = StateTree,
  G = Record<string, any>,
  A = Record<string, any>,
> {
  pinia: Pinia;
  store: Store<Id, S, G, A>;
  options: DefineStoreOptionsInPlugin<Id, S, G, A>;
}

export type PiniaPlugin = (
  context: PiniaPluginContext<any, any, any, any>,
) => Partial<PiniaCustomProperties & Record<string, any>> | void;

export interface Pinia {
  install: (app?: any) => void;
  state: Ref<Record<string, StateTree>>;
  use: (plugin: PiniaPlugin) => Pinia;
  _p: PiniaPlugin[];
  _s: Map<string, StoreGeneric>;
  _e: EffectScope;
}

export const piniaSymbol: InjectionKey<Pinia> = /* @__PURE__ */ Symbol(
  "moonshine.vue.pinia",
) as InjectionKey<Pinia>;

let activePinia: Pinia | undefined;

export function setActivePinia(pinia: Pinia | undefined): Pinia | undefined {
  return (activePinia = pinia);
}

export function getActivePinia(): Pinia | undefined {
  if (peekComponentContext()) {
    const injected = inject(piniaSymbol);
    if (injected) {
      setActivePinia(injected);
      return injected;
    }
  }
  return activePinia;
}

export function createPinia(): Pinia {
  const scope = effectScope(true);
  const state = scope.run(() => shallowRef<Record<string, StateTree>>({}))!;
  const _p: PiniaPlugin[] = [];
  const pinia: Pinia = {
    install(_app?: any) {
      setActivePinia(pinia);
      if (peekComponentContext()) {
        provide(piniaSymbol, pinia);
      }
    },
    use(plugin: PiniaPlugin) {
      _p.push(plugin);
      return pinia;
    },
    _p,
    _s: new Map<string, StoreGeneric>(),
    _e: scope,
    state,
  };
  setActivePinia(pinia);
  return pinia;
}

export interface DefineStoreOptionsBase<_S extends StateTree, _Store> {
  [key: string]: any;
}

export interface DefineStoreOptions<
  Id extends string,
  S extends StateTree,
  G,
  A,
> extends DefineStoreOptionsBase<S, Store<Id, S, G, A>> {
  id: Id;
  state?: () => S;
  getters?: G &
    ThisType<Unwrap<S> & StoreWithGetters<G> & PiniaCustomProperties> &
    Record<string, (state: Unwrap<S>) => any>;
  actions?: A &
    ThisType<
      A &
        Unwrap<S> &
        StoreWithState<Id, S, G, A> &
        StoreWithGetters<G> &
        PiniaCustomProperties
    >;
}

export interface DefineSetupStoreOptions<
  Id extends string,
  S extends StateTree,
  G,
  A,
> extends DefineStoreOptionsBase<S, Store<Id, S, G, A>> {
  actions?: A;
}

export interface DefineStoreOptionsInPlugin<
  Id extends string,
  S extends StateTree,
  G,
  A,
> extends Omit<DefineStoreOptions<Id, S, G, A>, "id" | "actions"> {
  actions: A;
}

export type StoreWithState<
  Id extends string,
  S extends StateTree,
  G,
  A,
> = Store<Id, S, G, A> & Unwrap<S>;

export type StoreWithGetters<G> = {
  readonly [K in keyof G]: G[K] extends (...args: any[]) => infer R
    ? R
    : Unwrap<G[K]>;
};

export type StoreGetters<SS> = {
  readonly [
    K in keyof SS as SS[K] extends (...args: any[]) => any ? never : K
  ]: Unwrap<SS[K]>;
};

export type StoreActions<SS> = {
  [K in keyof SS as SS[K] extends (...args: any[]) => any ? K : never]: SS[K];
};

export type StoreState<SS> = {
  [K in keyof SS as SS[K] extends (...args: any[]) => any ? never : K]: Unwrap<
    SS[K]
  >;
};

export type FullStore<
  Id extends string = string,
  S extends StateTree = StateTree,
  G = Record<string, any>,
  A = Record<string, any>,
> = Store<Id, S, G, A> & Unwrap<S> & StoreWithGetters<G> & A;

export interface StoreDefinition<
  Id extends string = string,
  S extends StateTree = StateTree,
  G = Record<string, any>,
  A = Record<string, any>,
> {
  (pinia?: Pinia | null): FullStore<Id, S, G, A>;
  $id: Id;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneInitialValue<T>(value: T): T {
  const raw = toRaw(value);
  if (Array.isArray(raw)) {
    return raw.map((item) => cloneInitialValue(item)) as unknown as T;
  }
  if (raw instanceof Set) {
    return new Set(
      Array.from(raw, (item) => cloneInitialValue(item)),
    ) as unknown as T;
  }
  if (raw instanceof Map) {
    return new Map(
      Array.from(raw.entries(), ([k, v]) => [
        cloneInitialValue(k),
        cloneInitialValue(v),
      ]),
    ) as unknown as T;
  }
  if (isPlainObject(raw)) {
    const out: Record<string, any> = {};
    for (const key of Object.keys(raw)) {
      out[key] = cloneInitialValue(raw[key]);
    }
    return out as T;
  }
  return raw;
}

function mergeReactiveObjects<T extends Record<string, any>>(
  target: T,
  patchToApply: DeepPartial<T>,
): T {
  for (const key of Object.keys(patchToApply)) {
    const subPatch = (patchToApply as Record<string, any>)[key];
    const targetValue = target[key];
    if (
      isPlainObject(targetValue) &&
      isPlainObject(subPatch) &&
      Object.hasOwn(target, key) &&
      !isRef(subPatch)
    ) {
      (target as Record<string, any>)[key] = mergeReactiveObjects(
        targetValue,
        subPatch,
      );
    } else {
      (target as Record<string, any>)[key] = subPatch;
    }
  }
  return target;
}

const storeRawMappings = new WeakMap<
  object,
  {
    rawSetup: Record<string, any>;
    stateKeys: Set<string>;
    getterKeys: Set<string>;
  }
>();

function registerAutoCleanup(fn: () => void, detached?: boolean): void {
  if (detached) return;
  if (getCurrentScope()) {
    onScopeDispose(fn);
  } else if (getOwner()) {
    onCleanup(fn);
  }
}

export function defineStore<
  Id extends string,
  S extends StateTree = {},
  G = {},
  A = {},
>(
  id: Id,
  options: Omit<DefineStoreOptions<Id, S, G, A>, "id">,
): StoreDefinition<Id, S, G, A>;
export function defineStore<
  Id extends string,
  S extends StateTree = {},
  G = {},
  A = {},
>(options: DefineStoreOptions<Id, S, G, A>): StoreDefinition<Id, S, G, A>;
export function defineStore<Id extends string, SS>(
  id: Id,
  storeSetup: () => SS,
  options?: DefineSetupStoreOptions<
    Id,
    StoreState<SS>,
    StoreGetters<SS>,
    StoreActions<SS>
  >,
): StoreDefinition<Id, StoreState<SS>, StoreGetters<SS>, StoreActions<SS>>;
export function defineStore(
  idOrOptions: any,
  setupOrOptions?: any,
  setupOptions?: any,
): StoreDefinition<any, any, any, any> {
  let id: string;
  let options: Record<string, any>;
  const isSetupStore = typeof setupOrOptions === "function";

  if (typeof idOrOptions === "string") {
    id = idOrOptions;
    options = isSetupStore ? (setupOptions ?? {}) : (setupOrOptions ?? {});
  } else if (
    idOrOptions &&
    typeof idOrOptions === "object" &&
    typeof idOrOptions.id === "string"
  ) {
    id = idOrOptions.id;
    options = idOrOptions;
  } else {
    throw new TypeError("defineStore requires a string store id");
  }

  function useStore(pinia?: Pinia | null): any {
    const resolvedPinia = pinia ?? getActivePinia() ?? createPinia();
    setActivePinia(resolvedPinia);
    if (!resolvedPinia._s.has(id)) {
      if (isSetupStore) {
        createSetupStore(id, setupOrOptions, options, resolvedPinia, false);
      } else {
        createOptionsStore(id, options as any, resolvedPinia);
      }
    }
    return resolvedPinia._s.get(id)!;
  }

  useStore.$id = id;
  return useStore as StoreDefinition<any, any, any, any>;
}

function createOptionsStore<
  Id extends string,
  S extends StateTree,
  G extends Record<string, any>,
  A extends Record<string, any>,
>(
  id: Id,
  options: DefineStoreOptions<Id, S, G, A>,
  pinia: Pinia,
): FullStore<Id, S, G, A> {
  const { state, actions, getters } = options;

  function setup() {
    if (!pinia.state.value[id]) {
      pinia.state.value[id] = reactive(state ? state() : {});
    }
    const localState = pinia.state.value[id]!;
    const out: Record<string, any> = {};
    for (const key of Object.keys(localState)) {
      out[key] = toRef(localState, key);
    }
    if (getters) {
      for (const name of Object.keys(getters)) {
        const getterFn = getters[name]!;
        out[name] = computed(() => {
          setActivePinia(pinia);
          const store = pinia._s.get(id)!;
          return getterFn.call(store, store as any);
        });
      }
    }
    if (actions) {
      for (const name of Object.keys(actions)) {
        out[name] = actions[name];
      }
    }
    return out;
  }

  const store = createSetupStore<Id, Record<string, any>, S, G, A>(
    id,
    setup,
    options,
    pinia,
    true,
  );
  return store;
}

function createSetupStore<
  Id extends string,
  SS extends Record<string, any>,
  S extends StateTree,
  G extends Record<string, any>,
  A extends Record<string, any>,
>(
  id: Id,
  setup: () => SS,
  options: Record<string, any>,
  pinia: Pinia,
  isOptionsStore: boolean,
): FullStore<Id, S, G, A> {
  let scope!: EffectScope;
  const subscriptions = new Set<SubscriptionCallback<S>>();
  const actionSubscriptions = new Set<StoreOnActionListener<Id, S, G, A>>();
  let isSyncListening = true;

  if (!isOptionsStore && !pinia.state.value[id]) {
    pinia.state.value[id] = {};
  }

  const initialSetupValues = new Map<string, any>();
  const stateKeys = new Set<string>();
  const getterKeys = new Set<string>();
  const actionMap: Record<string, Function> = {};
  const customProps: Record<string | symbol, any> = {};
  let rawSetup: Record<string, any> = {};

  function wrapAction(name: string, action: Function) {
    return function (this: any, ...args: any[]) {
      setActivePinia(pinia);
      const afterCallbackList: Array<(resolvedReturn: any) => void> = [];
      const onErrorCallbackList: Array<(error: unknown) => void> = [];

      function after(callback: (resolvedReturn: any) => void) {
        afterCallbackList.push(callback);
      }
      function onError(callback: (error: unknown) => void) {
        onErrorCallbackList.push(callback);
      }

      for (const listener of Array.from(actionSubscriptions)) {
        listener({
          args,
          name,
          store: storeProxy as any,
          after,
          onError,
        });
      }

      let ret: unknown;
      try {
        ret = action.apply(this && this.$id === id ? this : storeProxy, args);
      } catch (error) {
        for (const cb of onErrorCallbackList) {
          cb(error);
        }
        throw error;
      }

      if (ret instanceof Promise) {
        return ret
          .then((value) => {
            for (const cb of afterCallbackList) {
              cb(value);
            }
            return value;
          })
          .catch((error) => {
            for (const cb of onErrorCallbackList) {
              cb(error);
            }
            return Promise.reject(error);
          });
      }

      for (const cb of afterCallbackList) {
        cb(ret);
      }
      return ret;
    };
  }

  function $patch(
    partialStateOrMutator:
      DeepPartial<Unwrap<S>> | ((state: Unwrap<S>) => void),
  ): void {
    let subscriptionMutation: SubscriptionCallbackMutation<S>;
    isSyncListening = false;
    try {
      batch(() => {
        if (typeof partialStateOrMutator === "function") {
          partialStateOrMutator(pinia.state.value[id] as Unwrap<S>);
          subscriptionMutation = {
            type: MutationType.patchFunction,
            storeId: id,
          };
        } else {
          mergeReactiveObjects(pinia.state.value[id]!, partialStateOrMutator);
          subscriptionMutation = {
            type: MutationType.patchObject,
            storeId: id,
            payload: partialStateOrMutator,
          };
        }
      });
    } finally {
      isSyncListening = true;
    }
    const currentState = pinia.state.value[id] as Unwrap<S>;
    untrack(() => {
      for (const callback of Array.from(subscriptions)) {
        callback(subscriptionMutation!, currentState);
      }
    });
  }

  function $reset(): void {
    if (isOptionsStore) {
      const { state } = options as DefineStoreOptions<Id, S, G, A>;
      const newState = state ? state() : {};
      $patch(($state) => {
        Object.assign($state as Record<string, any>, newState);
      });
      return;
    }
    $patch(($state) => {
      for (const [key, initialVal] of initialSetupValues.entries()) {
        const cloned = cloneInitialValue(initialVal);
        const setupEntry = rawSetup[key];
        if (isRef(setupEntry) && !isReadonly(setupEntry)) {
          setupEntry.value = cloned;
        } else if (
          isReactive(setupEntry) &&
          isPlainObject(setupEntry) &&
          isPlainObject(cloned)
        ) {
          for (const existingKey of Object.keys(setupEntry)) {
            if (!(existingKey in cloned)) {
              delete (setupEntry as Record<string, any>)[existingKey];
            }
          }
          Object.assign(setupEntry, cloned);
        }
        ($state as Record<string, any>)[key] = cloned;
      }
    });
  }

  function $subscribe(
    callback: SubscriptionCallback<S>,
    subscribeOptions: StoreSubscriptionOptions = {},
  ): () => void {
    subscriptions.add(callback);
    const stopWatcher = scope.run(() =>
      watch(
        () => pinia.state.value[id] as Unwrap<S>,
        (state) => {
          if (isSyncListening) {
            callback(
              {
                storeId: id,
                type: MutationType.direct,
              },
              state,
            );
          }
        },
        {
          flush: "sync",
          deep: subscribeOptions.deep !== false,
          immediate: subscribeOptions.immediate,
        },
      ),
    );

    const removeSubscription = () => {
      subscriptions.delete(callback);
      stopWatcher?.();
    };
    registerAutoCleanup(removeSubscription, subscribeOptions.detached);
    return removeSubscription;
  }

  function $onAction(
    callback: StoreOnActionListener<Id, S, G, A>,
    detached?: boolean,
  ): () => void {
    actionSubscriptions.add(callback);
    const removeListener = () => {
      actionSubscriptions.delete(callback);
    };
    registerAutoCleanup(removeListener, detached);
    return removeListener;
  }

  function $dispose(): void {
    scope.stop();
    subscriptions.clear();
    actionSubscriptions.clear();
    pinia._s.delete(id);
  }

  const baseProperties: Record<string | symbol, any> = {
    _p: pinia,
    $id: id,
    $patch,
    $reset,
    $subscribe,
    $onAction,
    $dispose,
  };

  const storeTarget: Record<string | symbol, any> = Object.assign(
    reactive({}),
    baseProperties,
  );

  const storeProxy = new Proxy(storeTarget, {
    get(target, prop, receiver) {
      if (prop === "$state") {
        return pinia.state.value[id];
      }
      if (prop in baseProperties) {
        return baseProperties[prop];
      }
      if (prop in actionMap && typeof prop === "string") {
        return actionMap[prop];
      }
      if (typeof prop === "string" && prop in rawSetup) {
        const val = rawSetup[prop];
        return isRef(val) ? val.value : val;
      }
      const stateObj = pinia.state.value[id];
      if (stateObj && typeof prop === "string" && prop in stateObj) {
        const val = stateObj[prop];
        return isRef(val) ? val.value : val;
      }
      if (prop in customProps) {
        const val = customProps[prop];
        return isRef(val) ? val.value : val;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (prop === "$state") {
        $patch(($state) => {
          Object.assign($state as Record<string, any>, value);
        });
        return true;
      }
      if (typeof prop === "string" && prop in rawSetup) {
        const current = rawSetup[prop];
        if (isRef(current)) {
          if (isReadonly(current)) {
            throw new TypeError(`Cannot assign to readonly getter '${prop}'`);
          }
          current.value = value;
          return true;
        }
        rawSetup[prop] = value;
        if (stateKeys.has(prop)) {
          pinia.state.value[id]![prop] = value;
        }
        return true;
      }
      const stateObj = pinia.state.value[id];
      if (stateObj && typeof prop === "string" && prop in stateObj) {
        stateObj[prop] = value;
        return true;
      }
      if (prop in customProps) {
        const current = customProps[prop];
        if (isRef(current) && !isReadonly(current)) {
          current.value = value;
          return true;
        }
        customProps[prop] = value;
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
    has(target, prop) {
      return (
        prop === "$state" ||
        prop in baseProperties ||
        (typeof prop === "string" &&
          (prop in rawSetup ||
            prop in actionMap ||
            Boolean(
              pinia.state.value[id] && prop in pinia.state.value[id]!,
            ))) ||
        prop in customProps ||
        Reflect.has(target, prop)
      );
    },
    ownKeys(target) {
      const keys = new Set<string | symbol>([
        ...Reflect.ownKeys(target),
        ...Object.keys(rawSetup),
        ...Object.keys(actionMap),
        ...Object.keys(pinia.state.value[id] ?? {}),
        ...Reflect.ownKeys(customProps),
      ]);
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (
        prop === "$state" ||
        prop in baseProperties ||
        (typeof prop === "string" &&
          (prop in rawSetup ||
            prop in actionMap ||
            Boolean(
              pinia.state.value[id] && prop in pinia.state.value[id]!,
            ))) ||
        prop in customProps
      ) {
        return {
          enumerable: true,
          configurable: true,
          writable: true,
          value: (storeProxy as any)[prop],
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  }) as unknown as FullStore<Id, S, G, A>;

  pinia._s.set(id, storeProxy);

  const setupStore = pinia._e.run(() => {
    scope = effectScope();
    return scope.run(() => setup());
  })!;

  rawSetup = setupStore ?? {};

  for (const key of Object.keys(rawSetup)) {
    const prop = rawSetup[key];
    if (isRef(prop)) {
      if (isReadonly(prop)) {
        getterKeys.add(key);
      } else {
        stateKeys.add(key);
        if (!isOptionsStore) {
          initialSetupValues.set(key, cloneInitialValue(prop.value));
          const stateTarget = pinia.state.value[id]!;
          Object.defineProperty(stateTarget, key, {
            enumerable: true,
            configurable: true,
            get: () => prop.value,
            set: (v) => {
              prop.value = v;
            },
          });
        }
      }
    } else if (isReactive(prop)) {
      stateKeys.add(key);
      if (!isOptionsStore) {
        initialSetupValues.set(key, cloneInitialValue(prop));
        pinia.state.value[id]![key] = prop;
      }
    } else if (typeof prop === "function") {
      const wrapped = wrapAction(key, prop);
      actionMap[key] = wrapped;
      rawSetup[key] = wrapped;
    }
  }

  storeRawMappings.set(storeProxy, {
    rawSetup,
    stateKeys,
    getterKeys,
  });

  const pluginOptions: DefineStoreOptionsInPlugin<Id, S, G, A> = {
    ...options,
    actions: actionMap as unknown as A,
  };

  for (const plugin of pinia._p) {
    const extension = scope.run(() =>
      plugin({
        store: storeProxy,
        pinia,
        options: pluginOptions,
      }),
    );
    if (extension && typeof extension === "object") {
      for (const key of Reflect.ownKeys(extension)) {
        const val = (extension as Record<string | symbol, any>)[key];
        customProps[key] = val;
        if (
          typeof key === "string" &&
          (isRef(val) || isReactive(val)) &&
          !isReadonly(val)
        ) {
          stateKeys.add(key);
          if (isRef(val)) {
            Object.defineProperty(pinia.state.value[id]!, key, {
              enumerable: true,
              configurable: true,
              get: () => val.value,
              set: (v) => {
                val.value = v;
              },
            });
          } else {
            pinia.state.value[id]![key] = val;
          }
        }
      }
    }
  }

  return storeProxy;
}

export type StoreToRefs<SS> = {
  [
    K in keyof SS as SS[K] extends (...args: any[]) => any
      ? never
      : K extends `$${string}` | "_p"
        ? never
        : K
  ]: SS[K] extends Ref<infer V> ? Ref<V> : Ref<Unwrap<SS[K]>>;
};

export function storeToRefs<SS extends StoreGeneric>(
  store: SS,
): StoreToRefs<SS> {
  if (!store || typeof store !== "object") {
    throw new TypeError("storeToRefs requires a store instance");
  }
  const refs = {} as Record<string, Ref<any>>;
  const mapping = storeRawMappings.get(store);
  if (mapping) {
    for (const key of mapping.stateKeys) {
      const rawVal = mapping.rawSetup[key];
      refs[key] = isRef(rawVal) ? rawVal : toRef(store as any, key);
    }
    for (const key of mapping.getterKeys) {
      const rawVal = mapping.rawSetup[key];
      refs[key] = isRef(rawVal) ? rawVal : toRef(store as any, key);
    }
    return refs as StoreToRefs<SS>;
  }

  for (const key of Object.keys(store)) {
    if (key.startsWith("$") || key === "_p") continue;
    const val = (store as Record<string, any>)[key];
    if (typeof val === "function") continue;
    refs[key] = toRef(store as any, key);
  }
  return refs as StoreToRefs<SS>;
}

let mapStoreSuffix = "Store";

export function setMapStoreSuffix(suffix: string): void {
  mapStoreSuffix = suffix;
}

export function mapStores<
  Stores extends Array<StoreDefinition<any, any, any, any>>,
>(...stores: Stores): Record<string, () => StoreGeneric> {
  const res: Record<string, () => StoreGeneric> = {};
  for (const useStore of stores) {
    res[`${useStore.$id}${mapStoreSuffix}`] = function (this: any) {
      return useStore(this?.$pinia);
    };
  }
  return res;
}

export function mapState<Id extends string, S extends StateTree, G, A>(
  useStore: StoreDefinition<Id, S, G, A>,
  keysOrMapper:
    | ReadonlyArray<string>
    | Record<string, string | ((store: FullStore<Id, S, G, A>) => any)>,
): Record<string, () => any> {
  const res: Record<string, () => any> = {};
  if (Array.isArray(keysOrMapper)) {
    for (const key of keysOrMapper) {
      res[key] = function (this: any) {
        return (useStore(this?.$pinia) as any)[key];
      };
    }
  } else {
    for (const [alias, keyOrFn] of Object.entries(keysOrMapper)) {
      res[alias] = function (this: any) {
        const store = useStore(this?.$pinia);
        return typeof keyOrFn === "function"
          ? keyOrFn.call(this, store)
          : (store as any)[keyOrFn];
      };
    }
  }
  return res;
}

export const mapGetters = mapState;

export function mapWritableState<Id extends string, S extends StateTree, G, A>(
  useStore: StoreDefinition<Id, S, G, A>,
  keysOrMapper: ReadonlyArray<string> | Record<string, string>,
): Record<string, { get: () => any; set: (value: any) => void }> {
  const res: Record<string, { get: () => any; set: (value: any) => void }> = {};
  if (Array.isArray(keysOrMapper)) {
    for (const key of keysOrMapper) {
      res[key] = {
        get(this: any) {
          return (useStore(this?.$pinia) as any)[key];
        },
        set(this: any, value: any) {
          (useStore(this?.$pinia) as any)[key] = value;
        },
      };
    }
  } else {
    for (const [alias, key] of Object.entries(keysOrMapper)) {
      res[alias] = {
        get(this: any) {
          return (useStore(this?.$pinia) as any)[key];
        },
        set(this: any, value: any) {
          (useStore(this?.$pinia) as any)[key] = value;
        },
      };
    }
  }
  return res;
}

export function mapActions<Id extends string, S extends StateTree, G, A>(
  useStore: StoreDefinition<Id, S, G, A>,
  keysOrMapper: ReadonlyArray<string> | Record<string, string>,
): Record<string, (...args: any[]) => any> {
  const res: Record<string, (...args: any[]) => any> = {};
  if (Array.isArray(keysOrMapper)) {
    for (const key of keysOrMapper) {
      res[key] = function (this: any, ...args: any[]) {
        const store = useStore(this?.$pinia) as any;
        return store[key](...args);
      };
    }
  } else {
    for (const [alias, key] of Object.entries(keysOrMapper)) {
      res[alias] = function (this: any, ...args: any[]) {
        const store = useStore(this?.$pinia) as any;
        return store[key](...args);
      };
    }
  }
  return res;
}
