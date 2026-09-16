declare module "nuxt/app" {
  export const useState: unknown;
  export const useFetch: unknown;
  export const useRoute: unknown;
  export const useRouter: unknown;
  export const navigateTo: unknown;
  export const defineNuxtPlugin: unknown;
  export const definePageMeta: unknown;
}

declare module "vue" {
  export const ref: unknown;
  export const computed: unknown;
  export const watch: unknown;
  export const defineComponent: unknown;
  export const h: unknown;
}
