import { describe, expect, test } from "bun:test";
import {
  ErrorResponse,
  data,
  isRouteErrorResponse,
  json,
  redirect,
  redirectDocument,
  replace,
} from "../src/responses";

describe("@tschk/moonshine-react-router responses", () => {
  test("json sets content-type and body", async () => {
    const res = json({ a: 1 });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  test("json accepts a bare status number", () => {
    expect(json({}, 201).status).toBe(201);
  });

  test("json keeps a caller supplied content-type", () => {
    const res = json(
      {},
      { headers: { "content-type": "application/ld+json" } },
    );
    expect(res.headers.get("content-type")).toBe("application/ld+json");
  });

  test("data returns payload plus init without serialising", () => {
    const payload = { deep: { value: 1 } };
    const result = data(payload, 400);
    expect(result.type).toBe("DataWithResponseInit");
    expect(result.data).toBe(payload);
    expect(result.init.status).toBe(400);
  });

  test("redirect defaults to 302 with a location header", () => {
    const res = redirect("/login");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  test("redirect honours an explicit status", () => {
    expect(redirect("/x", 301).status).toBe(301);
  });

  test("redirectDocument marks a full document reload", () => {
    expect(redirectDocument("/x").headers.get("x-remix-reload-document")).toBe(
      "true",
    );
  });

  test("replace marks a history replacement", () => {
    expect(replace("/x").headers.get("x-remix-replace")).toBe("true");
  });

  test("isRouteErrorResponse narrows only ErrorResponse", () => {
    expect(
      isRouteErrorResponse(new ErrorResponse(404, "Not Found", null)),
    ).toBe(true);
    expect(isRouteErrorResponse(new Error("nope"))).toBe(false);
    expect(isRouteErrorResponse(null)).toBe(false);
  });

  test("ErrorResponse carries status data", () => {
    const err = new ErrorResponse(418, "Teapot", { why: "short" });
    expect(err.status).toBe(418);
    expect(err.statusText).toBe("Teapot");
    expect(err.data).toEqual({ why: "short" });
    expect(err.message).toBe("418 Teapot");
  });
});
