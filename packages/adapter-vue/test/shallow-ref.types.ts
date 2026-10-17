import { computed, ref, shallowRef, type Ref } from "../src/reactive";

const raw = { count: ref(1) };
const snapshot: Ref<typeof raw> = shallowRef(raw);
snapshot.value.count.value = 2;

const optional: Ref<number | undefined> = shallowRef<number>();
optional.value = 1;
optional.value = undefined;

const callback = shallowRef<() => number>(() => 1);
callback.value = () => 2;

const readonly = shallowRef(computed(() => 1));
// @ts-expect-error Existing readonly refs stay readonly.
readonly.value = 2;
