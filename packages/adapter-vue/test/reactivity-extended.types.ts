import {
  customRef,
  effectScope,
  getCurrentScope,
  isProxy,
  isReactive,
  isReadonly,
  isShallow,
  markRaw,
  onScopeDispose,
  readonly,
  ref,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  toRaw,
  toValue,
  triggerRef,
  type CustomRefFactory,
  type DeepReadonly,
  type EffectScope,
  type MaybeRef,
  type MaybeRefOrGetter,
  type Ref,
} from "../src/reactive";

const maybeRef: MaybeRef<number> = ref(1);
const maybeGetter: MaybeRefOrGetter<string> = () => "ok";
const v1: number = toValue(maybeRef);
const v2: string = toValue(maybeGetter);
const v3: boolean = toValue(true);

const sr = shallowRef({ count: 1 });
triggerRef(sr);

const factory: CustomRefFactory<number> = (track, trigger) => ({
  get() {
    track();
    return 1;
  },
  set(_v: number) {
    trigger();
  },
});
const cr: Ref<number> = customRef(factory);

const raw = markRaw({ nested: { count: 1 } });
const unwrapped: { nested: { count: number } } = toRaw(raw);

const shallowState = shallowReactive({ a: 1, nested: { b: 2 } });
const deepRo: DeepReadonly<{ a: number; nested: { b: Ref<string> } }> =
  readonly({
    a: 1,
    nested: { b: ref("hi") },
  });
const nestedStr: string = deepRo.nested.b;
// @ts-expect-error deep readonly blocks nested property assignment
deepRo.nested.b = "no";

const shallowRo = shallowReadonly({ top: 1, nested: { mutable: 2 } });
// @ts-expect-error shallow readonly blocks top-level property assignment
shallowRo.top = 2;
shallowRo.nested.mutable = 3;

const checks: boolean[] = [
  isProxy(shallowState),
  isReactive(shallowState),
  isReadonly(deepRo),
  isShallow(shallowRo),
];

const scope: EffectScope = effectScope(true);
const ran: number | undefined = scope.run(() => 42);
const current: EffectScope | undefined = getCurrentScope();
onScopeDispose(() => {}, true);
scope.stop();

void [v1, v2, v3, cr, unwrapped, nestedStr, shallowRo, checks, ran, current];
