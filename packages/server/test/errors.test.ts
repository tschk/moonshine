import { describe, expect, test } from "bun:test";
import { Redirect, redirect, json, errorResponse } from "../src/errors";

describe("errors module", () => {
  describe("Redirect", () => {
    test("creates a Redirect error with default status", () => {
      const err = new Redirect("/login");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("Redirect");
      expect(err.location).toBe("/login");
      expect(err.status).toBe(302);
      expect(err.message).toBe("Redirect to /login");
    });

    test("creates a Redirect error with custom status", () => {
      const err = new Redirect("/login", 301);
      expect(err.status).toBe(301);
    });
  });

  describe("redirect", () => {
    test("throws a Redirect error", () => {
      expect(() => {
        redirect("/dashboard");
      }).toThrow(Redirect);

      try {
        redirect("/dashboard");
      } catch (err) {
        expect(err).toBeInstanceOf(Redirect);
        expect((err as Redirect).location).toBe("/dashboard");
        expect((err as Redirect).status).toBe(302);
      }
    });

    test("throws a Redirect error with custom status", () => {
      try {
        redirect("/dashboard", 308);
      } catch (err) {
        expect((err as Redirect).status).toBe(308);
      }
    });
  });

  describe("json", () => {
    test("creates a Response with JSON data", async () => {
      const response = json({ hello: "world" });
      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");

      const data = await response.json();
      expect(data).toEqual({ hello: "world" });
    });

    test("creates a Response with custom init options", async () => {
      const response = json({ hello: "world" }, { status: 201, headers: { "x-custom": "test" } });
      expect(response.status).toBe(201);
      expect(response.headers.get("x-custom")).toBe("test");
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    });

    test("does not overwrite existing content-type", () => {
      const response = json({ hello: "world" }, { headers: { "content-type": "application/vnd.api+json" } });
      expect(response.headers.get("content-type")).toBe("application/vnd.api+json");
    });
  });

  describe("errorResponse", () => {
    test("returns generic 500 error in production", async () => {
      const err = new Error("Secret database error");
      const response = errorResponse(err, "production"); // or undefined mode

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Internal Server Error" });
    });

    test("returns generic 500 error when mode is undefined", async () => {
      const err = new Error("Secret database error");
      const response = errorResponse(err);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Internal Server Error" });
    });

    test("returns detailed error in development (Error object)", async () => {
      const err = new Error("Detailed dev error");
      const response = errorResponse(err, "development");

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Detailed dev error");
      expect(data.stack).toBeDefined();
      expect(typeof data.stack).toBe("string");
    });

    test("returns detailed error in development (String error)", async () => {
      const err = "String error message";
      const response = errorResponse(err, "development");

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("String error message");
      expect(data.stack).toBeUndefined();
    });
  });
});
