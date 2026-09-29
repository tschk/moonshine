declare module "svelte" {
  export const onMount: unknown;
  export const onDestroy: unknown;
  export const tick: unknown;
  export const createEventDispatcher: unknown;
}

declare module "svelte/store" {
  export const writable: unknown;
  export const readable: unknown;
  export const derived: unknown;
  export const get: unknown;
}
