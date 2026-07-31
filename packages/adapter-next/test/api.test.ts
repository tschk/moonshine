import { describe, expect, test } from "bun:test";
import * as client from "../src/client";
import {
  moonshineHtml,
  moonshineJson,
  moonshineRoute,
} from "../src/server";

describe("@tschk/moonshine-next", () => {
  test("client has signals + resource hooks", () => {
    expect(typeof client.createSignal).toBe("function");
    expect(typeof client.useSignal).toBe("function");
    expect(typeof client.createResource).toBe("function");
    expect(typeof client.useResource).toBe("function");
    expect(typeof client.createIslandSignal).toBe("function");
  });

  test("client does not export router", () => {
    expect("MoonshineRouter" in client).toBe(false);
  });

  test("moonshineJson sets content-type", async () => {
    const res = moonshineJson({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  test("moonshineHtml sets content-type", async () => {
    const res = moonshineHtml("<h1>x</h1>");
    expect(await res.text()).toBe("<h1>x</h1>");
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("moonshineRoute catches errors", async () => {
    const GET = moonshineRoute(async () => {
      throw new Error("boom");
    });
    const res = await GET(new Request("http://x/"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
