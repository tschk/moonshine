import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { connect } from "node:net";
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
