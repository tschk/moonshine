import { expect, test } from "bun:test";
import { join } from "node:path";
import { bunAdapter } from "../src/index";
import { prepareNativeArtifact, startNativeArtifact } from "./native-fixture";

test("native Bun artifact serves relocated SSR, static and SPA without host packages", async () => {
  const prepared = await prepareNativeArtifact();
  let server: Awaited<ReturnType<typeof startNativeArtifact>> | undefined;
  try {
    const entry = await Bun.file(join(prepared.artifact, "server.ts")).text();
    expect(entry).not.toContain("moonshine-react");
    expect(entry).not.toContain("requestScope");
    for (const name of [
      "react",
      "solid-js",
      "@tschk/moonshine-solid",
      "@tschk/crepuscularity-wasm",
    ]) {
      expect(
        await Bun.file(
          join(prepared.artifact, "node_modules", name, "package.json"),
        ).exists(),
      ).toBe(false);
    }
    server = await startNativeArtifact(prepared.artifact);
    const logo = await fetch(new URL("/logo.svg", server.url));
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toContain("image/svg+xml");
    expect(await logo.text()).toContain("<circle");
    for (const [path, text] of [
      ["/files/a%20b%25.txt", "public percent and space"],
      ["/files/literal%2520.txt", "literal percent escape"],
    ]) {
      const response = await fetch(new URL(path!, server.url));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(text!);
      const head = await fetch(new URL(path!, server.url), { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
    }
    const responses = await Promise.all(
      ["alice", "bob", "<img src=x>"].map((name) =>
        fetch(new URL(`/?name=${encodeURIComponent(name)}`, server!.url)),
      ),
    );
    const html = await Promise.all(
      responses.map((response) => response.text()),
    );
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("x-native-layout")).toBe("yes");
      expect(response.headers.get("x-native-middleware")).toBe("yes");
    }
    expect(html[0]).toContain("<title>hello, alice</title>");
    expect(html[0]).toContain(
      '<meta name="description" content="Independent Moonshine server and browser rendering.">',
    );
    expect(html[1]).toContain("<title>hello, bob</title>");
    expect(html[2]).toContain("<title>hello, &lt;img src=x&gt;</title>");
    expect(html[0]).toContain("hello, alice");
    expect(html[0]).not.toContain("bob");
    expect(html[1]).toContain("hello, bob");
    expect(html[2]).toContain("&lt;img src=x&gt;");
    expect(html[2]).not.toContain("<img src=x>");
    expect(html[0]).toContain("moonshine native");
    expect(html[0]).not.toContain("<script");
    const stylesheet = (document: string) =>
      document.match(/<link rel="stylesheet" href="([^"]+)"/u)![1]!;
    const homeCss = await (
      await fetch(new URL(stylesheet(html[0]!), server.url))
    ).text();
    expect(homeCss).toContain("theme");
    expect(homeCss).toContain("screen");
    expect(homeCss).toContain("data:image/svg+xml");
    expect(homeCss).not.toContain("NATIVE_SERVER_ONLY_MARKER");
    expect(homeCss).not.toContain(prepared.directory);
    const submission = await fetch(server.url, {
      method: "POST",
      body: new URLSearchParams({ name: "<Alice & Bob>" }),
      redirect: "manual",
    });
    expect(submission.status).toBe(303);
    expect(submission.headers.get("location")).toBe(
      "/?name=%3CAlice%20%26%20Bob%3E",
    );
    const greeting = await fetch(
      new URL(submission.headers.get("location")!, server.url),
    );
    expect(await greeting.text()).toContain("hello, &lt;Alice &amp; Bob&gt;");
    for (const name of ["", " ", "x".repeat(81)]) {
      const invalid = await fetch(server.url, {
        method: "POST",
        body: new URLSearchParams({ name }),
      });
      expect(invalid.status).toBe(400);
    }
    expect((await fetch(server.url, { method: "DELETE" })).status).toBe(405);
    const about = await fetch(new URL("/about", server.url));
    expect(about.status).toBe(200);
    const aboutStyle = stylesheet(await about.text());
    expect(aboutStyle).not.toBe(stylesheet(html[0]!));
    const aboutCss = await (
      await fetch(new URL(aboutStyle, server.url))
    ).text();
    expect(aboutCss).not.toContain("data:image/svg+xml");
    const shell = await (await fetch(new URL("/counter", server.url))).text();
    expect(shell).toContain("<title>counter</title>");
    expect(shell).toContain('data-moonshine-app="counter"');
    expect(shell).toContain('"counter":{"start":2}');
    const script = shell.match(/<script type="module" src="([^"]+)"/u)![1]!;
    const client = await (await fetch(new URL(script, server.url))).text();
    const clientHead = await fetch(new URL(script, server.url), {
      method: "HEAD",
    });
    expect(clientHead.status).toBe(200);
    expect(clientHead.headers.get("content-length")).toBe(
      String(Buffer.byteLength(client)),
    );
    expect(await clientHead.text()).toBe("");
    expect(client).not.toContain("NATIVE_SERVER_ONLY_MARKER");
    expect(client).not.toContain("react-dom");
    expect(client).not.toContain("solid-js");
    expect(client).not.toContain("OTHER_PAGE_ONLY_MARKER");
    const otherShell = await (
      await fetch(new URL("/other", server.url))
    ).text();
    const otherScript = otherShell.match(
      /<script type="module" src="([^"]+)"/u,
    )![1]!;
    expect(otherScript).not.toBe(script);
    const otherClient = await (
      await fetch(new URL(otherScript, server.url))
    ).text();
    expect(otherClient).toContain("OTHER_PAGE_ONLY_MARKER");
    expect(otherClient).not.toContain("native counter");
    const counterStyle = stylesheet(shell);
    const otherStyle = stylesheet(otherShell);
    expect(counterStyle).not.toBe(otherStyle);
    const counterCss = await (
      await fetch(new URL(counterStyle, server.url))
    ).text();
    const otherCss = await (
      await fetch(new URL(otherStyle, server.url))
    ).text();
    expect(counterCss).toMatch(/h1\s*\{/u);
    expect(counterCss).not.toMatch(/button\s*\{/u);
    expect(otherCss).toMatch(/button\s*\{/u);
    expect(otherCss).not.toMatch(/h1\s*\{/u);
    expect((await fetch(new URL("/dist/server.js", server.url))).status).toBe(
      404,
    );
  } finally {
    await server?.stop();
    await prepared.cleanup();
  }
}, 30000);

test("native Bun deployment injects its bundled request runner", async () => {
  const prepared = await prepareNativeArtifact();
  let server: Awaited<ReturnType<typeof startNativeArtifact>> | undefined;
  try {
    const bundlePath = join(prepared.artifact, "dist/server.js");
    await Bun.write(
      bundlePath,
      (await Bun.file(bundlePath).text()) +
        `
import {getRequest,getResponseHeaders,runWithRequest} from "@tschk/moonshine-framework/request";
import {cookies} from "@tschk/moonshine-next/headers";
export {runWithRequest as requestScope};
modules.home.loader=async()=>{
  const request=getRequest();
  await new Promise(resolve=>setTimeout(resolve,2));
  if(getRequest()!==request)throw new Error("Request scope leaked");
  getResponseHeaders().set("x-request-name", request.headers.get("x-name") ?? "anonymous");
  cookies().set("request", request.headers.get("x-name") ?? "anonymous", {httpOnly:true});
  return {name:request.headers.get("x-name")};
};
`,
    );
    const manifest = await Bun.file(
      join(prepared.artifact, "manifest.json"),
    ).json();
    manifest.requestContext = true;
    await bunAdapter.build(manifest, prepared.artifact);
    server = await startNativeArtifact(prepared.artifact);
    const results = await Promise.all(
      ["left", "right"].map(async (name) => {
        const response = await fetch(server!.url, {
          headers: { "x-name": name },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("x-request-name")).toBe(name);
        expect(response.headers.getSetCookie()).toEqual([
          `request=${name}; Path=/; HttpOnly`,
        ]);
        return response.text();
      }),
    );
    expect(results[0]).toContain("hello, left");
    expect(results[1]).toContain("hello, right");
  } finally {
    await server?.stop();
    await prepared.cleanup();
  }
}, 30000);
