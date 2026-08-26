import { describe, expect, test, mock } from "bun:test";
import { createResource } from "../src/resource";

describe("createResource", () => {
  test("fetches and exposes status", async () => {
    const r = createResource(async () => 7, { immediate: false });
    expect(r()).toBeUndefined();
    await r.refetch();
    expect(r()).toBe(7);
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);
  });

  test("captures errors", async () => {
    const r = createResource(
      async () => {
        throw new Error("nope");
      },
      { immediate: false },
    );
    await r.refetch();
    expect(r.error()?.message).toBe("nope");
    expect(r.status()).toBe("errored");
  });

  test("captures non-Error objects and invokes onError", async () => {
    let capturedError: Error | undefined;
    const r = createResource(
      async () => {
        throw "string error";
      },
      {
        immediate: false,
        onError: (err) => {
          capturedError = err;
        },
      },
    );
    await r.refetch();
    expect(r.error()?.message).toBe("string error");
    expect(r.status()).toBe("errored");
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError?.message).toBe("string error");
  });

  test("immediate fetching (default)", async () => {
    const fetcher = mock(async () => "data");
    const r = createResource(fetcher);
    // Should be pending initially while fetch is in-flight
    expect(r.status()).toBe("pending");
    expect(r.loading()).toBe(true);

    // Wait for microtasks to flush
    await Promise.resolve();

    expect(fetcher).toHaveBeenCalled();
    expect(r()).toBe("data");
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);
  });

  test("initial option", async () => {
    const r = createResource(async () => "new", {
      initial: "initial",
      immediate: false,
    });

    // Should start ready with initial value
    expect(r()).toBe("initial");
    expect(r.status()).toBe("ready");
    expect(r.loading()).toBe(false);

    await r.refetch();
    expect(r()).toBe("new");
  });

  test("error recovery", async () => {
    let shouldFail = true;
    const r = createResource(
      async () => {
        if (shouldFail) throw new Error("fail");
        return "success";
      },
      { immediate: false },
    );

    await r.refetch();
    expect(r.status()).toBe("errored");
    expect(r.error()).toBeDefined();

    shouldFail = false;
    await r.refetch();
    expect(r.status()).toBe("ready");
    expect(r.error()).toBeUndefined();
    expect(r()).toBe("success");
  });

  test("peek and subscribe", async () => {
    const r = createResource(async () => "value", { immediate: false });

    let subCalls = 0;
    const unsub = r.subscribe(() => {
      subCalls++;
    });

    expect(r.peek()).toBeUndefined();
    await r.refetch();
    expect(r.peek()).toBe("value");

    // Subscription should have been called when data changed
    expect(subCalls).toBe(1);

    unsub();
  });
});
