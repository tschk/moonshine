/** Compiler-facing prop layers; expression caching belongs to the compiler. */
export type PropLayer = object | null | undefined;
export type LivePropLayer = PropLayer | (() => PropLayer);

// Like object spread, broad index signatures do not erase statically named keys.
type Known<T> = {
  [
    K in keyof T as string extends K
      ? never
      : number extends K
        ? never
        : symbol extends K
          ? never
          : K
  ]: T[K];
};
type IsAny<T> = 0 extends 1 & T ? true : false;
type LayerValue<T> = T extends () => infer V ? V : T;
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];
type SpreadValue<A, B, K extends keyof A | keyof B> = K extends keyof B
  ? K extends RequiredKeys<B>
    ? B[K]
    : B[K] | (K extends keyof A ? A[K] : never)
  : K extends keyof A
    ? A[K]
    : never;
type Merge<A, B> = A extends unknown
  ? B extends unknown
    ? B extends null | undefined
      ? A
      : {
          [K in RequiredKeys<A> | RequiredKeys<Known<B>>]: SpreadValue<
            A,
            Known<B>,
            K
          >;
        } & {
          [
            K in Exclude<
              keyof A | keyof Known<B>,
              RequiredKeys<A> | RequiredKeys<Known<B>>
            >
          ]?: SpreadValue<A, Known<B>, K>;
        }
    : never
  : never;
type Layers<
  Items extends readonly unknown[],
  Acc = {},
> = Items extends readonly [infer Head, ...infer Tail]
  ? IsAny<LayerValue<Head>> extends true
    ? any
    : Layers<Tail, Merge<Acc, LayerValue<Head>>>
  : Acc;
export type SpreadProps<Items extends readonly LivePropLayer[]> =
  number extends Items["length"] ? Record<PropertyKey, unknown> : Layers<Items>;

// Server snapshots enumerate Object.keys, unlike the live DOM proxy's symbols.
type WithoutSymbols<T> =
  IsAny<T> extends true
    ? any
    : T extends unknown
      ? { [K in keyof T as K extends symbol ? never : K]: T[K] }
      : never;
export type SpreadServerProps<Items extends readonly PropLayer[]> =
  number extends Items["length"]
    ? Record<PropertyKey, unknown>
    : WithoutSymbols<Layers<Items>>;

function resolve(layer: LivePropLayer): PropLayer {
  return typeof layer === "function" ? layer() : layer;
}

export function spreadProps<const Items extends readonly LivePropLayer[]>(
  ...layers: Items
): SpreadProps<Items>;
export function spreadProps(
  ...layers: LivePropLayer[]
): Record<PropertyKey, unknown> {
  function descriptor(key: PropertyKey): PropertyDescriptor | undefined {
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = resolve(layers[index]!);
      if (layer !== null && typeof layer === "object" && key in layer) {
        const found = Object.getOwnPropertyDescriptor(layer, key);
        return found ? { ...found, configurable: true } : undefined;
      }
    }
  }
  return new Proxy(
    {},
    {
      get(_target, key) {
        for (let index = layers.length - 1; index >= 0; index--) {
          const layer = resolve(layers[index]!);
          if (layer !== null && typeof layer === "object" && key in layer)
            return Reflect.get(layer, key);
        }
      },
      set(_target, key, value) {
        for (let index = layers.length - 1; index >= 0; index--) {
          const layer = resolve(layers[index]!);
          // Nullish layers are absent during writes too, avoiding the host null-layer trap.
          if (layer == null) continue;
          const found = Object.getOwnPropertyDescriptor(layer, key);
          if (found?.set) {
            // Svelte forwards through the descriptor, including its receiver.
            found.set(value);
            return true;
          }
        }
        return false;
      },
      has(_target, key) {
        return layers.some((layer) => {
          const value = resolve(layer);
          return value != null && key in value;
        });
      },
      ownKeys() {
        const keys: Array<string | symbol> = [];
        for (const source of layers) {
          const layer = resolve(source);
          if (layer == null) continue;
          for (const key in layer) if (!keys.includes(key)) keys.push(key);
          for (const key of Object.getOwnPropertySymbols(layer))
            if (!keys.includes(key)) keys.push(key);
        }
        return keys;
      },
      getOwnPropertyDescriptor: (_target, key) => descriptor(key),
    },
  );
}

export function spreadServerProps<const Items extends readonly PropLayer[]>(
  layers: Items,
): SpreadServerProps<Items>;
export function spreadServerProps(
  layers: readonly PropLayer[],
): Record<PropertyKey, unknown> {
  const merged: Record<PropertyKey, unknown> = {};
  for (const layer of layers) {
    if (layer == null) continue;
    for (const key of Object.keys(layer)) {
      const descriptor = Object.getOwnPropertyDescriptor(layer, key);
      if (descriptor) Object.defineProperty(merged, key, descriptor);
      else merged[key] = Reflect.get(layer, key);
    }
  }
  return merged;
}
