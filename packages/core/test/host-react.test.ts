import { describe, expect, test } from "bun:test";
import * as host from "../src/host-react";
import { createResource } from "../src/resource";

describe("host-react", () => {
  test("exports signal + react + runes + resource surface", () => {
    expect(typeof host.createSignal).toBe("function");
    expect(typeof host.createMemo).toBe("function");
    expect(typeof host.useSignal).toBe("function");
    expect(typeof host.createApp).toBe("function");
    expect(typeof host.state).toBe("function");
    expect(typeof host.derived).toBe("function");
    expect(typeof host.effect).toBe("function");
    expect(typeof host.jsx).toBe("function");
    expect(typeof host.createResource).toBe("function");
    expect(typeof host.useResource).toBe("function");
    expect(typeof host.createIslandSignal).toBe("function");
  });

  test("does not export router (host-owned)", () => {
    expect("MoonshineRouter" in host).toBe(false);
    expect("navigate" in host).toBe(false);
  });

  test("createResource works from host barrel", async () => {
    const r = createResource(async () => "ok", { immediate: false });
    await r.refetch();
    expect(r()).toBe("ok");
  });
});
