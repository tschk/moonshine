declare module "vue" {
  export const ref: unknown;
  export const computed: unknown;
  export const watch: unknown;
  export const reactive: unknown;
  export const onMounted: unknown;
  export const onUnmounted: unknown;
  export const defineComponent: unknown;
  export const h: unknown;
  export const createApp: unknown;
}

declare module "vue/compiler-sfc" {
  export const parse: unknown;
  export const compileScript: unknown;
  export const compileTemplate: unknown;
}
