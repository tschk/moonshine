import { describe, expect, test, spyOn } from "bun:test";
import {
  toMoonshineRequest,
  resolvePage,
  handleMoonshineRequest,
  createMoonshineServer,
  definePage,
  type MoonshinePageModule,
} from "../src/server.js";
import * as serverModule from "@tschk/moonshine-server";
describe("toMoonshineRequest", () => {
  test("extracts request details into MoonshineRequest", () => {
    const req = new Request("http://localhost:3000/api/users?id=123", {
      method: "POST",
      headers: { "x-custom": "value" },
    });
    const mReq = toMoonshineRequest(req);
    expect(mReq.url).toBe("http://localhost:3000/api/users?id=123");
    expect(mReq.method).toBe("POST");
    expect(mReq.headers.get("x-custom")).toBe("value");
    expect(mReq.pathname).toBe("/api/users");
    expect(mReq.searchParams.get("id")).toBe("123");
  });
  test("normalizes trailing slash in pathname", () => {
    const req = new Request("http://localhost/path/");
    const mReq = toMoonshineRequest(req);
    expect(mReq.pathname).toBe("/path");
  });
  test("handles root pathname", () => {
    const req = new Request("http://localhost/");
    const mReq = toMoonshineRequest(req);
    expect(mReq.pathname).toBe("/");
  });
});
describe("resolvePage", () => {
  const pages: Record<string, MoonshinePageModule> = {
    "/": { render: () => "home" },
    "/about": { render: () => "about" },
    "/api/*": { render: () => "api splat" },
    "/api/v1/*": { render: () => "api v1 splat" },
  };
  test("resolves exact match", () => {
    expect(resolvePage(pages, "/about")).toBe(pages["/about"]);
    expect(resolvePage(pages, "/")).toBe(pages["/"]);
  });
  test("resolves splat match", () => {
    expect(resolvePage(pages, "/api/users")).toBe(pages["/api/*"]);
    expect(resolvePage(pages, "/api")).toBe(pages["/api/*"]);
  });
  test("resolves longest splat match", () => {
    expect(resolvePage(pages, "/api/v1/users")).toBe(pages["/api/v1/*"]);
    expect(resolvePage(pages, "/api/v1")).toBe(pages["/api/v1/*"]);
  });
  test("returns null for no match", () => {
    expect(resolvePage(pages, "/contact")).toBeNull();
  });
});
const notFound = () => new Response("Custom 404", { status: 404 });
describe("handleMoonshineRequest", () => {
  const pages = {
    "/": { render: () => "<h1>Home</h1>" },
    "/json": { render: () => ({ message: "Hello" }) },
    "/response": { render: () => new Response("Custom", { status: 201 }) },
  };
  test("renders string as html", async () => {
    const req = new Request("http://localhost/");
    const res = await handleMoonshineRequest(req, { pages });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>Home</h1>");
  });
  test("renders object as json", async () => {
    const req = new Request("http://localhost/json");
    const res = await handleMoonshineRequest(req, { pages });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ message: "Hello" });
  });
  test("returns Response directly", async () => {
    const req = new Request("http://localhost/response");
    const res = await handleMoonshineRequest(req, { pages });
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("Custom");
  });
  test("returns 404 for unmatched route", async () => {
    const req = new Request("http://localhost/missing");
    const res = await handleMoonshineRequest(req, { pages });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not Found");
  });
  test("uses custom notFound handler", async () => {
    const req = new Request("http://localhost/missing");
    const res = await handleMoonshineRequest(req, { pages, notFound });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Custom 404");
  });
});
describe("handleMoonshineRequest with staticDir", () => {
  test("serves static file if it exists", async () => {
    const mockServeStatic = spyOn(
      serverModule,
      "tryServeStatic",
    ).mockImplementation(async (dir, p) => {
      if (p === "/test.txt") return new Response("static file content");
      return null;
    });
    try {
      const req = new Request("http://localhost/test.txt");
      const res = await handleMoonshineRequest(req, {
        pages: {},
        staticDir: "./public",
      });
      expect(mockServeStatic).toHaveBeenCalledWith("./public", "/test.txt");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("static file content");
    } finally {
      mockServeStatic.mockRestore();
    }
  });
  test("falls back to page if static file returns null", async () => {
    const mockServeStatic = spyOn(
      serverModule,
      "tryServeStatic",
    ).mockResolvedValue(null);
    try {
      const req = new Request("http://localhost/test.txt");
      const res = await handleMoonshineRequest(req, {
        pages: { "/test.txt": { render: () => "page content" } },
        staticDir: "./public",
      });
      expect(mockServeStatic).toHaveBeenCalledWith("./public", "/test.txt");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("page content");
    } finally {
      mockServeStatic.mockRestore();
    }
  });
  test("does not serve static file for POST requests", async () => {
    const mockServeStatic = spyOn(
      serverModule,
      "tryServeStatic",
    ).mockResolvedValue(new Response("static"));
    try {
      const req = new Request("http://localhost/test.txt", { method: "POST" });
      const res = await handleMoonshineRequest(req, {
        pages: {},
        staticDir: "./public",
      });
      expect(mockServeStatic).not.toHaveBeenCalled();
      expect(res.status).toBe(404);
    } finally {
      mockServeStatic.mockRestore();
    }
  });
  test("does not serve static file for root pathname", async () => {
    const mockServeStatic = spyOn(
      serverModule,
      "tryServeStatic",
    ).mockResolvedValue(new Response("static"));
    try {
      const req = new Request("http://localhost/");
      const res = await handleMoonshineRequest(req, {
        pages: { "/": { render: () => "root page" } },
        staticDir: "./public",
      });
      expect(mockServeStatic).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("root page");
    } finally {
      mockServeStatic.mockRestore();
    }
  });
});
describe("createMoonshineServer", () => {
  test("creates server object with fetch and listen", () => {
    const server = createMoonshineServer({
      pages: { "/": { render: () => "Home" } },
    });
    expect(typeof server.fetch).toBe("function");
    expect(typeof server.listen).toBe("function");
    expect(server.port).toBe(3000); // default port
  });
  test("respects custom port", () => {
    const server = createMoonshineServer({
      pages: {},
      port: 8080,
    });
    expect(server.port).toBe(8080);
  });
  test("listen calls Bun.serve", () => {
    const originalServe = Bun.serve;
    let serveOptions: any;
    // @ts-ignore
    Bun.serve = (opts) => {
      serveOptions = opts;
      return { port: opts.port } as any;
    };
    try {
      const server = createMoonshineServer({ pages: {}, port: 4000 });
      const res = server.listen();
      expect(serveOptions.port).toBe(4000);
      expect(serveOptions.fetch).toBe(server.fetch);
      // @ts-ignore
      expect(res.port).toBe(4000);
    } finally {
      Bun.serve = originalServe;
    }
  });
  test("fetch returns response from handleMoonshineRequest", async () => {
    const server = createMoonshineServer({
      pages: { "/": { render: () => "Fetch Home" } },
    });
    const req = new Request("http://localhost/");
    const res = await server.fetch(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Fetch Home");
  });
});
describe("definePage", () => {
  test("returns the input object unchanged", () => {
    const page = { render: () => "test" };
    expect(definePage(page)).toBe(page);
  });
});
