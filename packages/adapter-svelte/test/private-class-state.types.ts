import { createPrivateState, createPrivateRawState } from "../src/runes";
const literal = createPrivateState(1 as const);
literal.value = 1;
const one: 1 = literal.assign(1);
const read: 1 = literal.peek();
// @ts-expect-error literal write remains constrained
literal.value = 2;
// @ts-expect-error assignment argument remains constrained
literal.assign(2);
const optional = createPrivateState<number | undefined>(undefined);
optional.assign(2);
optional.assign(undefined);
const maybe: number | undefined = optional.peek();
// @ts-expect-error peek retains undefined
const required: number = optional.peek();
const fn = () => 1;
const functions = createPrivateState<typeof fn>(fn);
const same: typeof fn = functions.assign(fn);
const raw = createPrivateRawState<typeof fn>(fn);
raw.value = fn;
const rawFn: typeof fn = raw.peek();
// @ts-expect-error raw keeps function type
raw.value = 1;
const object = createPrivateState<{ n: number }>({ n: 1 });
object.assign({ n: 2 });
// @ts-expect-error nested value type stays precise
object.assign({ n: "bad" });
function generic<T>(initial: T) {
  const cell = createPrivateState(initial);
  cell.assign(initial);
  const value: T = cell.peek();
  return value;
}
void [one, read, maybe, required, same, rawFn, generic];
