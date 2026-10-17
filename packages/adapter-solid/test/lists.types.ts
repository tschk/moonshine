import { For, Index } from "../src/solid";
import { For as serverFor, Index as serverIndex } from "../src/ssr";

for (const list of [For, serverFor]) {
  list<number, string>({
    each: [1],
    fallback: "empty",
    children: (item) => String(item),
  });
  list({
    each: [{ id: 1 }],
    fallback: "empty",
    children: (item, index) => {
      const id: number = item.id + index();
      // @ts-expect-error A row retains its actual item type.
      void item.missing;
      return id;
    },
  });
}
for (const list of [Index, serverIndex]) {
  list<number, string>({
    each: [1],
    fallback: "empty",
    children: (item) => String(item()),
  });
  list({
    each: [{ id: 1 }],
    fallback: "empty",
    children: (item, index) => {
      const id: number = item().id + index;
      // @ts-expect-error Index exposes the item through an accessor.
      void item.id;
      return id;
    },
  });
}
