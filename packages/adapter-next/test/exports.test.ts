import { describe, expect, test } from "bun:test";
import * as client from "../src/index";
import * as server from "../src/server";

describe("@tschk/moonshine-next", () => {
  test("client exports host-react surface", () => {
    expect(typeof client.createSignal).toBe("function");
    expect(typeof client.useSignal).toBe("function");
    expect(typeof client.createApp).toBe("function");
    expect(typeof client.state).toBe("function");
  });

  test("client does not export host router", () => {
    expect("MoonshineRouter" in client).toBe(false);
    expect("navigate" in client).toBe(false);
  });

  test("server exports moonshine server helpers", () => {
    expect(typeof server.definePage).toBe("function");
    expect(typeof server.handleMoonshineRequest).toBe("function");
    expect(typeof server.createMoonshineServer).toBe("function");
  });
});
