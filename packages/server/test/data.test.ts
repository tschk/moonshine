import { describe, expect, test, mock } from "bun:test";
import { createRouteContext, callLoader, callAction, type RouteContext } from "../src/data";

describe("data", () => {
  describe("createRouteContext", () => {
    test("creates a RouteContext correctly", () => {
      const abortController = new AbortController();
      const request = new Request("http://localhost/", {
        signal: abortController.signal,
      });
      const params = { id: "123" };

      const context = createRouteContext(request, params);

      expect(context.request).toBe(request);
      expect(context.params).toBe(params);
      expect(context.signal).toBe(request.signal);
      expect(context.data).toEqual({});
    });
  });

  describe("callLoader", () => {
    const dummyContext: RouteContext = {
      request: new Request("http://localhost/"),
      params: {},
      signal: new AbortController().signal,
      data: {},
    };

    test("works with a synchronous loader", async () => {
      const mockLoader = mock((context: RouteContext) => {
        expect(context).toBe(dummyContext);
        return { foo: "bar" };
      });

      const result = await callLoader(mockLoader, dummyContext);

      expect(mockLoader).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ foo: "bar" });
    });

    test("works with an asynchronous loader", async () => {
      const mockLoader = mock(async (context: RouteContext) => {
        expect(context).toBe(dummyContext);
        return { foo: "async" };
      });

      const result = await callLoader(mockLoader, dummyContext);

      expect(mockLoader).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ foo: "async" });
    });
  });

  describe("callAction", () => {
    const dummyContext: RouteContext = {
      request: new Request("http://localhost/"),
      params: {},
      signal: new AbortController().signal,
      data: {},
    };

    test("works with a synchronous action", async () => {
      const mockAction = mock((context: RouteContext) => {
        expect(context).toBe(dummyContext);
        return { success: true };
      });

      const result = await callAction(mockAction, dummyContext);

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true });
    });

    test("works with an asynchronous action", async () => {
      const mockAction = mock(async (context: RouteContext) => {
        expect(context).toBe(dummyContext);
        return { success: "async" };
      });

      const result = await callAction(mockAction, dummyContext);

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: "async" });
    });

    test("works with an action returning a Response", async () => {
      const mockResponse = new Response("ok", { status: 200 });
      const mockAction = mock(async (context: RouteContext) => {
        expect(context).toBe(dummyContext);
        return mockResponse;
      });

      const result = await callAction(mockAction, dummyContext);

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResponse);
    });
  });
});
