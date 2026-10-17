import { toRefs, ref, type Ref } from "../src/reactive";
const obj = toRefs({
  count: 1,
  optional: undefined as number | undefined,
  cell: ref("x"),
});
const count: Ref<number> = obj.count;
obj.count.value = 2;
obj.cell.value = "y";
// @ts-expect-error wrong linked property type
obj.count.value = "bad";
const tuple = toRefs([1, "x"] as const);
const one: Readonly<Ref<1>> = tuple[0];
// @ts-expect-error mapped readonly tuple slot
tuple[0] = ref(1);
const arr = toRefs([1, 2]);
arr[0]!.value = 3;
const optional = toRefs({} as { maybe?: number });
const maybe: Ref<number | undefined> | undefined = optional.maybe;
// @ts-expect-error object constraint
toRefs(1);
void [count, one, maybe];
