import { expect, test } from "bun:test";
import { readonly, writable, get, type Readable } from "../src/store";

function exercise(api: {
  readonly: typeof readonly;
  writable: typeof writable;
  get: typeof get;
}) {
  const events: string[] = [];
  const source = api.writable(0, () => {
    events.push("start");
    return () => {
      events.push("stop");
    };
  });
  const custom = {
    subscribe(run: (value: number) => void, invalidate?: () => void) {
      expect(this).toBe(custom);
      return source.subscribe(run, invalidate);
    },
    set: source.set,
    extra: true,
  };
  const view = api.readonly(custom);
  expect(Object.keys(view)).toEqual(["subscribe"]);
  expect(view).not.toBe(custom);
  const { subscribe } = view;
  const release = subscribe(
    (value) => events.push(`value:${value}`),
    () => events.push("invalidate"),
  );
  source.set(1);
  release();
  release();
  source.set(2);
  events.push(`get:${api.get(view)}`);
  return events;
}

test("readonly preserves store protocol and custom receivers against Svelte", async () => {
  const reference = (await import(
    Bun.resolveSync(
      "svelte/store",
      `${import.meta.dir}/../../../examples/svelte-adopt`,
    )
  )) as {
    readonly: typeof readonly;
    writable: typeof writable;
    get: typeof get;
  };
  expect(exercise({ readonly, writable, get })).toEqual(exercise(reference));
});

test("readonly hides mutation methods without freezing payloads", () => {
  const object = { count: 1 };
  const source = writable(object);
  const view: Readable<typeof object> = readonly(source);
  expect("set" in view).toBe(false);
  expect("update" in view).toBe(false);
  expect(get(view)).toBe(object);
  object.count++;
  expect(get(view).count).toBe(2);
});
