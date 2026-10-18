import { reactive, ref, shallowRef, type Ref } from "../src/reactive";
const value = ref(new Set([{ count: ref(1) }]));
const count: number = value.value.values().next().value!.count;
const stored = ref(1);
const refs = reactive(new Set([stored]));
const item: Ref<number> = refs.values().next().value!;
const input: ReadonlySet<{ count: Ref<number> }> = new Set([{ count: stored }]);
const readonly = reactive(input);
const readCount: number = readonly.values().next().value!.count;
// @ts-expect-error readonly collection methods retain their public constraint.
readonly.add({ count: 2 });
const shallow = shallowRef(new Set([{ count: stored }]));
const shallowItem: Ref<number> = shallow.value.values().next().value!.count;
void [count, item, readCount, shallowItem];
