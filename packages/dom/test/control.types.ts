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
