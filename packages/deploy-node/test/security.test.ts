import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createNodeHandler } from "../src";

describe("createNodeHandler security", () => {
  const handler = createNodeHandler({
    fetch: async (request) => {
      const seen = Object.fromEntries(request.headers.entries());
      return new Response(null, {
        status: 200,
        headers: { "x-seen": JSON.stringify(seen) },
      });
    },
  });

  const server = createServer(handler);
  let port = 0;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        server.listen(0, () => {
          const address = server.address() as { port: number };
          port = address.port;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  test("removes hop-by-hop and framing headers from request", async () => {
    const raw = await new Promise<string>((resolve, reject) => {
      const socket = connect({ port }, () => {
        socket.write(
          "POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 5\r\nX-Custom: ok\r\n\r\nhello",
        );
      });
      let data = "";
      socket.on("data", (chunk) => {
        data += chunk.toString();
      });
      socket.on("error", reject);
      socket.on("end", () => resolve(data));
      setTimeout(() => socket.end(), 500);
    });

    const match = raw.match(/x-seen: (.+)\r\n/);
    expect(match).toBeTruthy();
    const seen = JSON.parse(match![1]!) as Record<string, string>;
    expect(seen["x-custom"]).toBe("ok");
    expect(seen["content-length"]).toBeUndefined();
    expect(seen["transfer-encoding"]).toBeUndefined();
    expect(seen["connection"]).toBeUndefined();
  });
});

describe("createNodeHandler static serving", () => {
  const tmpDir = mkdtempSync(resolve(tmpdir(), "ms-node-sec-"));
  const staticDir = resolve(tmpDir, "public");

  const handler = createNodeHandler({
    fetch: async () => new Response("app", { status: 200 }),
    staticDir,
  });
  const server = createServer(handler);
  let port = 0;

  beforeAll(async () => {
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(resolve(staticDir, "ok.txt"), "ok");
    writeFileSync(resolve(tmpDir, "secret.txt"), "secret");
    writeFileSync(resolve(staticDir, ".env"), "TOKEN=redacted");
    symlinkSync(
      resolve(tmpDir, "secret.txt"),
      resolve(staticDir, "escape.txt"),
    );
    await new Promise<void>((done) => {
      server.listen(0, () => {
        port = (server.address() as { port: number }).port;
        done();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((done, reject) =>
      server.close((err) => (err ? reject(err) : done())),
    );
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("serves contained files with nosniff", async () => {
    const res = await fetch(`http://localhost:${port}/ok.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("does not follow a symlink escaping the static root", async () => {
    const res = await fetch(`http://localhost:${port}/escape.txt`);
    expect(await res.text()).toBe("app");
  });

  test("does not serve dotfiles", async () => {
    const res = await fetch(`http://localhost:${port}/.env`);
    expect(await res.text()).toBe("app");
  });
});
