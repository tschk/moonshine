import { expect, test } from "bun:test";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prepareNativeArtifact } from "../../deploy-bun/test/native-fixture";

test("native artifact runs in actual Node without runtime packages", async () => {
  const prepared = await prepareNativeArtifact();
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await symlink(
      resolve(import.meta.dir, ".."),
      join(prepared.artifact, "node_modules/@tschk/moonshine-deploy-node"),
    );
    const bundlePath = join(prepared.artifact, "dist/server.js");
    await writeFile(
      bundlePath,
      (await readFile(bundlePath, "utf8")) +
        `
import { getRequest, getResponseHeaders, runWithRequest } from "@tschk/moonshine-framework/request";
export { runWithRequest as requestScope };
modules.home.loader = async () => {
  const request = getRequest();
  await new Promise(resolve => setTimeout(resolve, 2));
  if (getRequest() !== request) throw new Error("Request scope leaked");
  getResponseHeaders().set("x-request-name", request.headers.get("x-name") ?? "anonymous");
  getResponseHeaders().append("set-cookie", "request=" + (request.headers.get("x-name") ?? "anonymous") + "; Path=/; HttpOnly");
  return {name: request.headers.get("x-name") ?? new URL(request.url).searchParams.get("name") ?? "world"};
};
`,
    );
    const builder = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
const {nodeAdapter}=await import(process.argv[1]);
const out=process.argv[2];
const manifest=await Bun.file(out+'/manifest.json').json();
for(const route of manifest.routes)route.runtime='node';
manifest.requestContext=true;
await nodeAdapter.build(manifest,out);
`,
        resolve(import.meta.dir, "../src/index.ts"),
        prepared.artifact,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const error = await new Response(builder.stderr).text();
    expect(await builder.exited, error).toBe(0);
    const standalone = join(prepared.directory, "standalone");
    await mkdir(standalone);
    await cp(
      join(prepared.artifact, "server.js"),
      join(standalone, "server.mjs"),
    );
    await cp(join(prepared.artifact, "public"), join(standalone, "public"), {
      recursive: true,
    });
    const code = await readFile(join(standalone, "server.mjs"), "utf8");
    expect(code).not.toContain('from "react"');
    expect(code).not.toContain('from "solid-js"');
    child = Bun.spawn([Bun.which("node")!, join(standalone, "server.mjs")], {
      cwd: standalone,
      env: { ...process.env, PORT: "0" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
    try {
      const first = await Promise.race([
        reader.read(),
        child.exited.then(async (exitCode) => {
          throw new Error(
            `Node exited ${exitCode}: ${await new Response(child!.stderr as ReadableStream<Uint8Array>).text()}`,
          );
        }),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Node startup timed out")),
            10000,
          );
        }),
      ]);
      if (!first.value)
        throw new Error(
          `Node produced no URL: ${await new Response(child.stderr as ReadableStream<Uint8Array>).text()}`,
        );
      const url = new TextDecoder().decode(first.value).trim();
      const logo = await fetch(new URL("/logo.svg", url));
      expect(logo.status).toBe(200);
      expect(logo.headers.get("content-type")).toContain("image/svg+xml");
      expect(await logo.text()).toContain("<circle");
      for (const [path, text] of [
        ["/files/a%20b%25.txt", "public percent and space"],
        ["/files/literal%2520.txt", "literal percent escape"],
      ]) {
        const response = await fetch(new URL(path!, url));
        expect(response.status).toBe(200);
        expect(await response.text()).toBe(text!);
        const head = await fetch(new URL(path!, url), { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
      }
      const home = await fetch(new URL("/?name=Node", url));
      expect(home.status).toBe(200);
      const homeHtml = await home.text();
      expect(homeHtml).toContain("hello, Node");
      expect(homeHtml).toContain("<title>hello, Node</title>");
      const concurrent = await Promise.all(
        ["left", "right"].map(async (name) => {
          const response = await fetch(new URL("/", url), {
            headers: { "x-name": name },
          });
          expect(response.headers.get("x-request-name")).toBe(name);
          expect(response.headers.getSetCookie()).toEqual([
            `request=${name}; Path=/; HttpOnly`,
          ]);
          return response.text();
        }),
      );
      expect(concurrent[0]).toContain("<title>hello, left</title>");
      expect(concurrent[1]).toContain("<title>hello, right</title>");
      expect(concurrent[0]).toContain("hello, left");
      expect(concurrent[1]).toContain("hello, right");
      const about = await fetch(new URL("/about", url));
      expect(about.status).toBe(200);
      expect(await about.text()).toContain("a static route");
      const counter = await fetch(new URL("/counter", url));
      const html = await counter.text();
      expect(counter.status).toBe(200);
      expect(html).toContain('data-moonshine-app="counter"');
      const script = /<script type="module" src="([^"]+)"/.exec(html)![1]!;
      const asset = await fetch(new URL(script, url));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toContain("javascript");
      const head = await fetch(new URL(script, url), { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(deadline);
    child?.kill();
    await child?.exited;
    await prepared.cleanup();
  }
}, 30000);
