import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestHandler } from "@tschk/moonshine-server";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

test("compiled request helpers share the bundled scope across concurrent SSR and API requests", async () => {
  const root = await mkdtemp(
    join(import.meta.dir, "fixtures/request-context-"),
  );
  try {
    await mkdir(join(root, "src/routes"), { recursive: true });
    await mkdir(join(root, "node_modules/@tschk"), { recursive: true });
    for (const [name, directory] of [
      ["moonshine-framework", "framework"],
      ["moonshine-next", "adapter-next"],
      ["moonshine-dom", "dom"],
    ]) {
      await symlink(
        resolve(import.meta.dir, "../../", directory!),
        join(root, "node_modules/@tschk", name!),
      );
    }
    await writeFile(
      join(root, "src/page.ts"),
      `
import {headers,cookies} from '@tschk/moonshine-next/headers';
import {h} from '@tschk/moonshine-dom/ssr';
export async function loader(){
  const id=headers().get('x-id');
  await new Promise(resolve=>setTimeout(resolve,id==='alpha'?15:0));
  return {id:headers().get('x-id'),cookie:cookies().get('session')?.value};
}
export default function Page({data}) {
  return h('p',null,headers().get('x-id')+':'+cookies().get('session')?.value+':'+data.page.id+':'+data.page.cookie);
}`,
    );
    await writeFile(
      join(root, "src/api.ts"),
      `
import {headers,cookies} from '@tschk/moonshine-next/headers';
export async function GET(){await new Promise(resolve=>setTimeout(resolve,1));return Response.json({id:headers().get('x-id'),cookie:cookies().get('session')?.value});}
`,
    );
    const routes = [
      { id: "page", path: "/", file: "src/page.ts", mode: "ssr" as const },
      { id: "api", path: "/api", file: "src/api.ts", mode: "api" as const },
    ];
    await buildProjectIsolated({
      projectDir: root,
      renderer: "native",
      requestContext: true,
      programmatic: routes,
    });
    const manifest = await readManifest(join(root, ".moonshine/manifest.json"));
    expect(manifest.requestContext).toBe(true);
    const bundle = await import(
      pathToFileURL(join(root, ".moonshine/dist/server.js")).href
    );
    expect(typeof bundle.requestScope).toBe("function");
    const handler = createRequestHandler({
      manifest,
      modules: bundle.modules,
      renderer: bundle.renderer,
      requestScope: bundle.requestScope,
    });
    const request = (id: string, path = "/") =>
      new Request("http://localhost" + path, {
        headers: { "x-id": id, cookie: "session=" + id + "-cookie" },
      });
    const responses = await Promise.all([
      handler(request("alpha")),
      handler(request("beta")),
    ]);
    expect(await responses[0]!.text()).toContain(
      "<p>alpha:alpha-cookie:alpha:alpha-cookie</p>",
    );
    expect(await responses[1]!.text()).toContain(
      "<p>beta:beta-cookie:beta:beta-cookie</p>",
    );
    const api = await handler(request("api", "/api"));
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ id: "api", cookie: "api-cookie" });
    const previousManifest = await Bun.file(
      join(root, ".moonshine/manifest.json"),
    ).text();
    await expect(
      buildProjectIsolated({
        projectDir: root,
        renderer: "react",
        requestContext: true,
        runtime: "cloudflare",
        programmatic: routes,
      }),
    ).rejects.toThrow("only Bun and Node");
    await expect(
      buildProjectIsolated({
        projectDir: root,
        renderer: "native",
        requestContext: true,
        programmatic: [{ ...routes[0]!, runtime: "node" }],
      }),
    ).rejects.toThrow("match the configured server runtime");
    await writeFile(
      join(root, "moonshine.config.ts"),
      `export default {renderer:'react',adapter:'cloudflare',runtime:'cloudflare',requestContext:true};`,
    );
    const invalid = Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, "../../cli/bin/moonshine.ts"),
        "build",
        root,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [exit, diagnostic] = await Promise.all([
      invalid.exited,
      new Response(invalid.stderr).text(),
    ]);
    expect(exit).not.toBe(0);
    expect(diagnostic).toContain(
      "Request context supports only matching Bun or Node",
    );
    expect(await Bun.file(join(root, ".moonshine/manifest.json")).text()).toBe(
      previousManifest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
