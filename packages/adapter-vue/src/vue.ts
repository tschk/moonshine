/**
 * vue runtime re-exports for moonshine apps.
 *
 * ```ts
 * import { ref, computed, watch } from "@tschk/moonshine-vue/vue";
 * ```
 */
export {
  computed,
  customRef,
  defineComponent,
  effectScope,
  getCurrentInstance,
  getCurrentScope,
  inject,
  isRef,
  markRaw,
  nextTick,
  onMounted,
  onScopeDispose,
  onUnmounted,
  provide,
  reactive,
  readonly,
  ref,
  shallowRef,
  toRaw,
  toRef,
  toRefs,
  unref,
  watch,
  watchEffect,
} from "vue";
export type {
  ComputedRef,
  Ref,
  ShallowRef,
  WritableComputedRef,
} from "vue";
