import { describe, expect, test } from "bun:test";
import { createServerRoute, json } from "../src/server";
import {
  NotFound,
  Redirect,
  isNotFound,
  isRedirect,
  notFound,
  redirect,
} from "../src/navigation";

describe("@tschk/moonshine-tanstack server", () => {
  test("json sets content-type", async () => {
    const res = json({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  test("createServerRoute catches errors", async () => {
    const GET = createServerRoute(async () => {
      throw new Error("boom");
    });
    const res = await GET(new Request("http://x/"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("control flow", () => {
  test("redirect returns an error to throw", () => {
    const result = redirect({ to: "/login" });
    expect(result).toBeInstanceOf(Redirect);
    expect(result.options.to).toBe("/login");
    expect(isRedirect(result)).toBe(true);
  });

  test("redirect can throw eagerly", () => {
    expect(() => redirect({ to: "/x", throw: true })).toThrow(Redirect);
  });

  test("notFound returns an error carrying data", () => {
    const result = notFound({ data: { id: 1 } });
    expect(result).toBeInstanceOf(NotFound);
    expect(result.data).toEqual({ id: 1 });
    expect(isNotFound(result)).toBe(true);
  });

  test("guards reject unrelated values", () => {
    expect(isRedirect(new Error("x"))).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });
});
