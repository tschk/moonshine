import { expect, test } from "bun:test";
import { createServerProp } from "../src/server-prop";

test("server props keep assignments local and publish only final undefined-parent values", () => {
  for (const initial of [undefined, 1]) {
    let parent = initial;
    const writes: number[] = [];
    let defaults = 0;
    const props = {
      get value() {
        return parent;
      },
      set value(next) {
        writes.push(next!);
        parent = next;
      },
    };
    const child = createServerProp<number>(props, "value", () => {
      defaults++;
      return 3;
    });
    expect(child.value).toBe(initial ?? 3);
    expect(defaults).toBe(initial === undefined ? 1 : 0);
    child.value = 4;
    child.value = 5;
    expect(parent).toBe(initial);
    expect(writes).toEqual([]);
    child.commit();
    expect(child.value).toBe(5);
    expect(parent).toBe(initial ?? 5);
    expect(writes).toEqual(initial === undefined ? [5] : []);
    child.commit();
    expect(writes).toEqual(initial === undefined ? [5] : []);
  }
});

test("server prop commits inspect the current parent and require an own setter", () => {
  let parent: number | undefined;
  let receiverMatches = false;
  const props = {
    get value() {
      return parent;
    },
    set value(next) {
      receiverMatches = this === props;
      parent = next;
    },
  };
  const child = createServerProp<number>(props, "value", () => 3);
  parent = 9;
  child.commit();
  expect(parent).toBe(9);
  expect(receiverMatches).toBe(false);
  parent = undefined;
  child.commit();
  expect(parent).toBe(3);
  expect(receiverMatches).toBe(true);
  parent = undefined;
  const inherited = createServerProp<number>(
    Object.create(props),
    "value",
    () => 7,
  );
  inherited.commit();
  expect(parent).toBeUndefined();
  const readonly = createServerProp({ value: undefined }, "value", () => 8);
  expect(() => readonly.commit()).not.toThrow();
});

test("server props preserve literal functions and undefined without evaluating defaults twice", () => {
  const fn = () => 1;
  const child = createServerProp({ value: fn }, "value", () => () => 2);
  expect(child.value).toBe(fn);
  let writes = 0;
  const empty = createServerProp<undefined>(
    {
      get value() {
        return undefined;
      },
      set value(_) {
        writes++;
      },
    },
    "value",
  );
  empty.commit();
  expect(writes).toBe(0);
  let defaults = 0;
  const local = createServerProp({ value: undefined }, "value", () => {
    defaults++;
    return 3;
  });
  expect(local.value).toBe(3);
  expect(local.value).toBe(3);
  local.commit();
  expect(defaults).toBe(1);
  expect(() =>
    createServerProp({}, "value", () => {
      throw Error("default");
    }),
  ).toThrow("default");
});

test("server commits reread parents even for undefined children and preserve getter failures", () => {
  let reads = 0;
  const failure = Error("parent getter");
  const child = createServerProp<undefined>(
    {
      get value() {
        if (++reads === 3) throw failure;
        return undefined;
      },
      set value(_) {
        throw Error("must not publish undefined");
      },
    },
    "value",
  );
  expect(reads).toBe(1);
  child.commit();
  expect(reads).toBe(2);
  expect(() => child.commit()).toThrow(failure);
  expect(
    createServerProp({ value: null }, "value", () => {
      throw Error("default");
    }).value,
  ).toBeNull();
});
