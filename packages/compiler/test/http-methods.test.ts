import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createRequestHandler } from "@tschk/moonshine-server";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

let project: string;
let request: (request: Request) => Promise<Response>;
const sources = {
  named: `export const GET = () => new Response("get", { headers: { "x-method": "get" } });
    export const HEAD = () => new Response("discard", { headers: { "x-method": "head" } });
    ${["POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((method) => `export const ${method} = request => new Response(request.method);`).join("\n")}`,
  writes: `${["PUT", "PATCH", "DELETE"].map((method) => `export const ${method} = request => new Response(request.method);`).join("\n")}`,
  mixed: `export const GET = () => new Response("named");
    export const handler = request => new Response("fallback:" + request.method);`,
  limited: `export const methods = ["GET"];
    export const handler = request => new Response(request.method);`,
  genericplain: `let calls = 0; export const handler = () => ({ calls: ++calls });`,
  nameddata: `export const GET = () => new Response("route");`,
  post: `export const POST = request => new Response(request.method);`,
  get: `export const GET = request => new Response(request.method, { headers: { "x-method": "get" } });`,
  generic: `let calls = 0; export const handler = request => new Response(request.method + ":" + (++calls));`,
  postplain: `let calls = 0; export const POST = () => ({ calls: ++calls });`,
  plain: `let calls = 0; export const GET = () => { throw Error("GET must not run after POST"); };
    export const POST = () => ({ calls: ++calls });`,
  explicit: `export const loader = () => { throw Error("route loader must lose to data"); };
    export const action = () => { throw Error("route action must lose to data"); };
    export const GET = () => { throw Error("named GET must lose to loader"); };
    export const POST = () => { throw Error("named POST must lose to action"); };`,
  head: `export const HEAD = () => new Response(null, { headers: { "x-head": "only" } });`,
  loader: `export const loader = context => new Response("explicit:" + context.request.method);
    export const POST = request => new Response(request.method);`,
  action: `export const action = context => new Response("explicit:" + context.request.method);
    export const GET = request => new Response(request.method);`,
};

beforeAll(async () => {
  project = await mkdtemp(join(import.meta.dir, "fixtures/http-methods-"));
  await mkdir(join(project, "src/routes"), { recursive: true });
  for (const [id, source] of Object.entries(sources)) {
    await Bun.write(join(project, "src", `${id}.ts`), source);
  }
  await Bun.write(
    join(project, "src/data.ts"),
    `
    export const loader = context => new Response("data-loader:" + context.request.method);
    export const action = context => new Response("data-action:" + context.request.method);`,
  );
  await Bun.write(
    join(project, "src/handlers-data.ts"),
    `export const GET = () => new Response("data");`,
  );
  await buildProjectIsolated({
    projectDir: project,
    programmatic: Object.keys(sources).map((id) => ({
      id,
      path: `/${id}`,
      file: `src/${id}.ts`,
      mode: "api" as const,
      ...(id === "explicit"
        ? { dataFile: "src/data.ts" }
        : id === "nameddata"
          ? { dataFile: "src/handlers-data.ts" }
          : {}),
    })),
  });
  const manifest = await readManifest(
    join(project, ".moonshine/manifest.json"),
  );
  const bundle = await import(join(project, ".moonshine/dist/server.js"));
  request = createRequestHandler({ manifest, modules: bundle.modules });
});
afterAll(async () => {
  if (project) await rm(project, { recursive: true, force: true });
});
const send = (id: string, method = "GET") =>
  request(new Request(`http://test/${id}`, { method }));

test("named handlers dispatch exact methods, including explicit OPTIONS and HEAD", async () => {
  for (const method of [
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]) {
    const response = await send("named", method);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      method === "GET" ? "get" : method === "HEAD" ? "" : method,
    );
    if (method === "HEAD")
      expect(response.headers.get("x-method")).toBe("head");
  }
});

test("POST-only exports reject other verbs with an accurate Allow", async () => {
  for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await send("post", method);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  }
  expect(await (await send("post", "POST")).text()).toBe("POST");
});

test("HEAD falls back to GET; HEAD-only does not enable GET", async () => {
  const head = await send("get", "HEAD");
  expect(head.status).toBe(200);
  expect(head.headers.get("x-method")).toBe("get");
  expect(head.body).toBeNull();
  const unsupported = await send("get", "OPTIONS");
  expect(unsupported.status).toBe(405);
  expect(unsupported.headers.get("allow")).toBe("GET, HEAD");
  const get = await send("head");
  expect(get.status).toBe(405);
  expect(get.headers.get("allow")).toBe("HEAD");
});

test("generic Response handlers run once for read and write requests", async () => {
  let calls = 0;
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    expect(await (await send("generic", method)).text()).toBe(
      `${method}:${++calls}`,
    );
  }
});

test("plain-object POST results preserve envelopes and do not rerun read handlers", async () => {
  expect(await (await send("postplain", "POST")).json()).toEqual({
    postplain: { calls: 1 },
  });
  expect(await (await send("plain", "POST")).json()).toEqual({
    __action: { calls: 1 },
  });
  expect(await (await send("plain", "POST")).json()).toEqual({
    __action: { calls: 2 },
  });
});

test("explicit loader/action and separate data exports retain precedence", async () => {
  expect(await (await send("explicit")).text()).toBe("data-loader:GET");
  expect(await (await send("explicit", "POST")).text()).toBe(
    "data-action:POST",
  );
  expect(await (await send("explicit", "DELETE")).text()).toBe(
    "data-action:DELETE",
  );
  const loader405 = await send("loader", "PUT");
  expect(loader405.status).toBe(405);
  expect(loader405.headers.get("allow")).toBe("GET, HEAD, POST");
  expect(await (await send("loader")).text()).toBe("explicit:GET");
  expect(await (await send("action", "DELETE")).text()).toBe("explicit:DELETE");
});

test("write-only exports are served without advertising synthetic read methods", async () => {
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    expect(await (await send("writes", method)).text()).toBe(method);
  }
  for (const method of ["GET", "HEAD", "POST", "OPTIONS"]) {
    const response = await send("writes", method);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("PUT, PATCH, DELETE");
  }
});

test("named dispatch precedes generic fallback and explicit methods constrain generic handlers", async () => {
  expect(await (await send("mixed")).text()).toBe("named");
  expect(await (await send("mixed", "PUT")).text()).toBe("fallback:PUT");
  expect(await (await send("mixed", "PROPFIND")).text()).toBe(
    "fallback:PROPFIND",
  );
  // Bun normalizes prototype-named methods to GET when constructing a Request.
  const custom = new Request("http://test/mixed");
  Object.defineProperty(custom, "method", { value: "constructor" });
  expect(await (await request(custom)).text()).toBe("fallback:constructor");
  const rejected = await send("limited", "POST");
  expect(rejected.status).toBe(405);
  expect(rejected.headers.get("allow")).toBe("GET");
  expect(await (await send("genericplain", "POST")).json()).toEqual({
    __action: { calls: 1 },
  });
  expect(await (await send("genericplain", "PUT")).json()).toEqual({
    __action: { calls: 2 },
  });
});

test("data-file named handlers override route named handlers and OPTIONS is not automatic", async () => {
  expect(await (await send("nameddata")).text()).toBe("data");
  const options = await send("action", "OPTIONS");
  expect(options.status).toBe(405);
  expect(options.headers.get("allow")).toBe(
    "GET, HEAD, POST, PUT, PATCH, DELETE",
  );
});
