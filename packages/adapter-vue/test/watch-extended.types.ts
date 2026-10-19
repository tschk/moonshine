import {
  onWatcherCleanup,
  reactive,
  ref,
  watch,
  watchSyncEffect,
  type WatchCallback,
  type WatchHandle,
  type WatchOptions,
  type WatchStopHandle,
} from "../src/reactive";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
const assertType = <T extends true>() => undefined as T;

const count = ref(1);
const state = reactive({ label: "ok", nested: { n: 2 } });

const h1 = watch(
  count,
  (val, prev) => {
    assertType<Equal<typeof val, number>>();
    assertType<Equal<typeof prev, number | undefined>>();
    onWatcherCleanup(() => {});
  },
  { flush: "sync", immediate: true, deep: false, once: true },
);
assertType<Equal<typeof h1, WatchHandle>>();
const stop1: WatchStopHandle = h1;
stop1();
h1.pause();
h1.resume();
h1.stop();

const h2 = watch(
  state,
  (val, prev) => {
    assertType<Equal<typeof val, typeof state>>();
    assertType<Equal<typeof prev, typeof state | undefined>>();
  },
  { flush: "sync", deep: 2 },
);
assertType<Equal<typeof h2, WatchHandle>>();

const h3 = watch(
  [state, count, () => state.label] as const,
  (val, prev) => {
    assertType<Equal<typeof val, [typeof state, number, string]>>();
    assertType<
      Equal<typeof prev, [typeof state, number, string] | undefined>
    >();
  },
  { flush: "sync" },
);
assertType<Equal<typeof h3, WatchHandle>>();

const h4 = watchSyncEffect(() => {
  onWatcherCleanup(() => {}, true);
});
assertType<Equal<typeof h4, WatchHandle>>();

const opts: WatchOptions = {
  flush: "sync",
  immediate: false,
  deep: 1,
  once: false,
};
const cb: WatchCallback<number, number | undefined> = (_v, _p, clean) => {
  clean(() => {});
};
watch(count, cb, opts);

// @ts-expect-error onWatcherCleanup requires a function
onWatcherCleanup(123);

// @ts-expect-error native watch still requires flush: "sync"
watch(count, () => {}, { flush: "pre" });
