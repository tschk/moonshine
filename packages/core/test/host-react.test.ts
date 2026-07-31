import { describe, expect, test } from "bun:test";
import * as host from "../src/host-react";

describe("host-react", () => {
  test("exports signal + react + runes surface", () => {
    expect(typeof host.createSignal).toBe("function");
    expect(typeof host.createMemo).toBe("function");
    expect(typeof host.useSignal).toBe("function");
    expect(typeof host.createApp).toBe("function");
    expect(typeof host.state).toBe("function");
    expect(typeof host.derived).toBe("function");
    expect(typeof host.effect).toBe("function");
    expect(typeof host.jsx).toBe("function");
  });

  test("does not export router (host-owned)", () => {
    expect("MoonshineRouter" in host).toBe(false);
    expect("navigate" in host).toBe(false);
  });
});
