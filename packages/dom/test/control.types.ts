import { For, Show, mapArray, indexArray } from "../src/control";
const pull = <T>(read: () => T): (() => T) => read;
const items = () => [1, 2];
const keyed: () => string[] = mapArray(
  items,
  (value) => String(value),
  undefined,
  pull,
);
const delayed: () => string[] = mapArray(
  items,
  (value) => String(value),
  (dispose) => dispose(),
);
const indexed: () => number[] = indexArray(items, (value) => value(), pull);
const forwarded: () => number[] = For(
  { each: items, children: (value) => value },
  pull,
);
const shown: () => string | undefined = Show(
  { when: () => true, children: () => "shown" },
  pull,
);
const identity = (value: number) => value;
const invalidRemoval = (dispose: () => number[]) => void dispose();
const invalidSchedule = () => () => ["wrong"];
// @ts-expect-error removal receives a void disposer, not an array reader
mapArray(items, identity, invalidRemoval);
// @ts-expect-error scheduled accessor must retain the mapping payload
mapArray(items, identity, undefined, invalidSchedule);
// @ts-expect-error scheduled Show result must retain its branch payload
Show({ when: () => true, children: () => 1 }, invalidSchedule);
void [keyed, delayed, indexed, forwarded, shown];

const early: () => string[] = mapArray(
  items,
  (value) => String(value),
  undefined,
  pull,
  "before-map",
);
// @ts-expect-error removal order is an explicit supported mode
mapArray(items, identity, undefined, pull, "invalid");
void early;

const earlyIndexed: () => number[] = indexArray(
  items,
  (value) => value(),
  pull,
  "before-map",
);
// @ts-expect-error indexed update order is an explicit supported mode
indexArray(items, (value) => value(), pull, "invalid");
void earlyIndexed;

const fallbackMapped: () => number[] | string = mapArray(
  items,
  (value) => value,
  undefined,
  pull,
  "before-map",
  () => "empty",
);
const fallbackIndexed: () => number[] | string = indexArray(
  items,
  (value) => value(),
  pull,
  "before-map",
  () => "empty",
);
void [fallbackMapped, fallbackIndexed];

// Generated Svelte helpers allow a single child or a mapped child accessor.
function genericKeyed<T, U extends import("../src/dom").DOMChild>(
  each: () => readonly T[],
  child: (item: T, index: () => number) => U,
): U | (() => U[]) {
  return mapArray(each, child, undefined, pull);
}
function genericIndexed<T, U extends import("../src/dom").DOMChild>(
  each: () => readonly T[],
  child: (item: () => T, index: number) => U,
): U | (() => U[]) {
  return indexArray(each, child, pull);
}
void [genericKeyed, genericIndexed];
