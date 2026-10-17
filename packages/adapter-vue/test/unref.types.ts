import { ref, unref, type Ref } from "../src/reactive";
const shape = { value: 1 };
const actual = unref(shape);
const object: { value: number } = actual;
// @ts-expect-error structural objects are not branded refs
const scalar: number = actual;
const native = ref(1);
const n: number = unref(native);
const readonly: Readonly<Ref<number>> = native;
const r: number = unref(readonly);
declare const union: Ref<number> | { value: string };
const u: number | { value: string } = unref(union);
const fn = () => 1;
const f: () => number = unref(fn);
const nil: null = unref(null);
const missing: undefined = unref(undefined);
void [object, scalar, n, r, u, f, nil, missing];
