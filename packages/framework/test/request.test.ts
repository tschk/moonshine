import { expect, test } from "bun:test";
import { getRequest, getResponseHeaders, runWithRequest } from "../src/request";

test("request scopes return values and restore nested and outside contexts", () => {
  const outer = new Request("http://outer/");
  const inner = new Request("http://inner/");
  expect(getRequest()).toBeUndefined();
  expect(
    runWithRequest(outer, () => {
      expect(getRequest()).toBe(outer);
      expect(runWithRequest(inner, () => getRequest())).toBe(inner);
      expect(getRequest()).toBe(outer);
      return 42;
    }),
  ).toBe(42);
  expect(getRequest()).toBeUndefined();
  const failure = new Error("callback");
  expect(() =>
    runWithRequest(outer, () => {
      throw failure;
    }),
  ).toThrow(failure);
  expect(getRequest()).toBeUndefined();
});

test("overlapping async requests retain isolated contexts across awaits", async () => {
  const first = new Request("http://first/");
  const second = new Request("http://second/");
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = runWithRequest(first, async () => {
    expect(getRequest()).toBe(first);
    await barrier;
    expect(getRequest()).toBe(first);
    return "first";
  });
  const next = runWithRequest(second, async () => {
    await Promise.resolve();
    expect(getRequest()).toBe(second);
    release();
    await Promise.resolve();
    expect(getRequest()).toBe(second);
    return "second";
  });
  expect(getRequest()).toBeUndefined();
  expect(await Promise.all([pending, next])).toEqual(["first", "second"]);
  expect(getRequest()).toBeUndefined();
});

test("response headers follow explicit nested scopes and restore outside", async () => {
  const request = new Request("http://outer/");
  const headers = new Headers();
  expect(getResponseHeaders()).toBeUndefined();
  await runWithRequest(
    request,
    async () => {
      expect(getResponseHeaders()).toBe(headers);
      await Promise.resolve();
      expect(getResponseHeaders()).toBe(headers);
      runWithRequest(request, () =>
        expect(getResponseHeaders()).toBeUndefined(),
      );
      expect(getResponseHeaders()).toBe(headers);
    },
    headers,
  );
  expect(getResponseHeaders()).toBeUndefined();
});
