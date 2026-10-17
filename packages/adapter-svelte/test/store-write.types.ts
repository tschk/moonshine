import {
  setStoreValue,
  mutateStoreValue,
  updateStoreValue,
} from "../src/store-binding";
const store = {
  subscribe(run: (v: { count: number }) => void) {
    run({ count: 1 });
    return () => {};
  },
  set(value: { count: number }) {
    void value;
  },
};
const value = setStoreValue(store, { count: 2, literal: true as const });
const literal: true = value.literal;
// @ts-expect-error incompatible writable payload
setStoreValue(store, { count: "wrong" });
// @ts-expect-error incompatible mutation payload
mutateStoreValue(store, 3, { count: "wrong" });
const numberStore = {
  subscribe(run: (v: number) => void) {
    run(1);
  },
  set(value: number) {
    void value;
  },
};
const number: number = updateStoreValue(numberStore, 1, 1, true);
// @ts-expect-error incompatible old value
updateStoreValue(numberStore, "wrong", 1, true);
void literal;
void number;

import { mutateServerStore } from "../src/ssr";
const numberReference = {
  get(_store: import("../src/store-binding").StoreSource<number>) {
    return 1;
  },
};
mutateServerStore(numberReference, numberStore, "expression");
// @ts-expect-error Reference payload must match the target writable store.
mutateServerStore(numberReference, store, "expression");
