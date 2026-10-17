import { expect, test } from "bun:test";
import { reactive, ref, toRefs, watchSyncEffect } from "../src/reactive";

test("linked destructuring keeps reactive writes and stops with its watcher", () => {
  const source = reactive({ count: 1 });
  const { count } = toRefs(source);
  const seen: number[] = [];
  const stop = watchSyncEffect(() => {
    seen.push(count.value);
  });
  source.count = 2;
  count.value = 3;
  stop();
  source.count = 4;
  expect(seen).toEqual([1, 2, 3]);
  expect(count.value).toBe(4);
});

test("arrays preserve holes, initial length, extra properties and existing refs", () => {
  const cell = ref(7);
  const source: Array<number | typeof cell> & { extra?: number } = [];
  source.length = 4;
  source[1] = 1;
  source[3] = cell;
  source.extra = 9;
  const output = toRefs(source);
  expect(output.length).toBe(4);
  expect(0 in output).toBe(false);
  expect(2 in output).toBe(false);
  expect(output[3]).toBe(cell);
  expect(output.extra!.value).toBe(9);
  output[1]!.value = 8;
  expect(source[1]).toBe(8);
  source.push(10);
  expect(output.length).toBe(4);
  expect(toRefs({ cell }).cell).toBe(cell);
});

test("enumeration keeps inherited string keys, source receivers and safe own prototype keys", () => {
  let reads = 0;
  const source = Object.create({ inherited: 5 });
  Object.defineProperty(source, "value", {
    enumerable: true,
    get() {
      reads++;
      expect(this).toBe(source);
      return this.inherited;
    },
    set(value) {
      this.inherited = value;
    },
  });
  const symbol = Symbol();
  source[symbol] = 9;
  const output = toRefs(source);
  expect(reads).toBe(1);
  expect(Object.keys(output)).toEqual(["value", "inherited"]);
  expect(symbol in output).toBe(false);
  output.value.value = 6;
  expect(output.inherited.value).toBe(6);
  const proto = toRefs(JSON.parse('{"__proto__":1}'));
  expect(Object.getPrototypeOf(proto)).toBe(Object.prototype);
  expect(Object.hasOwn(proto, "__proto__")).toBe(true);
  expect(proto.__proto__.value).toBe(1);
  expect(() => {
    toRefs({
      get value() {
        return 1;
      },
    }).value.value = 2;
  }).toThrow(TypeError);
});
