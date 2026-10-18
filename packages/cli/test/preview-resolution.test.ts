import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startPreview } from "../src/preview";

async function app(root: string, renderer?: string) {
  await mkdir(join(root, ".moonshine/dist"), { recursive: true });
  await writeFile(
    join(root, ".moonshine/manifest.json"),
    JSON.stringify({
      version: 1,
      frameworkVersion: "test",
      ...(renderer ? { renderer } : {}),
      routes: [
        {
          id: "index",
          path: "/",
          file: "page.ts",
          mode: "ssr",
          runtime: "bun",
          decision: "test",
          clientEntries: [],
        },
      ],
      assets: [],
      entries: { server: "dist/server.js" },
      capabilities: [],
    }),
  );
  await writeFile(
    join(root, ".moonshine/dist/server.js"),
    'export const modules={}; export const renderer={name:"native",render:async()=>new Response("native fixture"),prerender:async()=>""};',
  );
}

async function fakeRenderer(
  root: string,
  name: string,
  exported: string,
  code?: string,
) {
  const directory = join(root, "node_modules/@tschk", name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: `@tschk/${name}`,
      type: "module",
      exports: "./index.ts",
    }),
  );
  await writeFile(
    join(directory, "index.ts"),
    code ??
      `export const ${exported}={name:"project",render:async()=>new Response(${JSON.stringify(name)}),prerender:async()=>""};`,
  );
}

test("legacy previews prefer application renderers, including default React", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-renderer-resolution-"));
  try {
    for (const [renderer, name, exported] of [
      [undefined, "moonshine-react", "reactRenderer"],
      ["react", "moonshine-react", "reactRenderer"],
      ["solid", "moonshine-solid", "solidRenderer"],
      ["crepus", "crepus-moonshine", "crepusRenderer"],
    ] as const) {
      const project = join(root, String(renderer));
      await app(project, renderer);
      await fakeRenderer(project, name, exported);
      const preview = await startPreview({ projectDir: project });
      try {
        expect(await (await fetch(preview.url)).text()).toBe(name);
      } finally {
        await preview.stop();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("native preview never imports installed host renderers", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-native-no-host-"));
  try {
    await app(root, "native");
    await writeFile(
      join(root, "moonshine.config.ts"),
      'export default {renderer:"solid"};',
    );
    for (const name of [
      "moonshine-react",
      "moonshine-solid",
      "crepus-moonshine",
    ])
      await fakeRenderer(
        root,
        name,
        "unused",
        'throw new Error("host renderer must not load");',
      );
    const preview = await startPreview({ projectDir: root });
    try {
      expect(await (await fetch(preview.url)).text()).toBe("native fixture");
    } finally {
      await preview.stop();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("missing optional renderers explain the application dependency to install", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-optional-renderer-"));
  try {
    const cli = join(root, "cli");
    await cp(resolve(import.meta.dir, "../src"), join(cli, "src"), {
      recursive: true,
    });
    await mkdir(join(cli, "node_modules/@tschk"), { recursive: true });
    for (const [name, path] of [
      ["moonshine-compiler", "compiler"],
      ["moonshine-deploy-bun", "deploy-bun"],
      ["moonshine-server", "server"],
      ["moonshine-framework", "framework"],
    ])
      await symlink(
        resolve(import.meta.dir, "../..", path!),
        join(cli, "node_modules/@tschk", name!),
      );
    for (const [renderer, name] of [
      ["react", "moonshine-react"],
      ["solid", "moonshine-solid"],
      ["crepus", "crepus-moonshine"],
    ]) {
      const project = join(root, renderer!);
      await app(project, renderer);
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          `import {startPreview} from ${JSON.stringify(join(cli, "src/preview.ts"))};try{await startPreview({projectDir:process.argv[1]});process.exit(2);}catch(error){console.error(error.message);process.exit(1);}`,
          project,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          cwd: root,
        },
      );
      const error = await new Response(child.stderr).text();
      expect(await child.exited, error).toBe(1);
      expect(error).toContain(
        `Renderer package @tschk/${name} is not installed`,
      );
      expect(error).toContain(`bun add @tschk/${name} in ${project}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("native and legacy previews select opt-in HTTP data transport", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-preview-data-http-"));
  try {
    for (const renderer of ["native", "react"]) {
      const project = join(root, renderer);
      await app(project, renderer);
      const manifestPath = join(project, ".moonshine/manifest.json");
      const manifest = await Bun.file(manifestPath).json();
      manifest.dataRequests = true;
      await writeFile(manifestPath, JSON.stringify(manifest));
      await writeFile(
        join(project, ".moonshine/dist/server.js"),
        `let value=0;
export const modules={index:{loader:()=>value,action:async({request})=>{value=Number(await request.text());return {saved:value}}}};
export const renderer={name:"native",render:async()=>new Response("native fixture"),prerender:async()=>""};`,
      );
      if (renderer === "react")
        await fakeRenderer(project, "moonshine-react", "reactRenderer");
      const preview = await startPreview({ projectDir: project });
      try {
        const headers = { "x-moonshine-data": "1" };
        const load = () => fetch(preview.url, { headers });
        expect(await (await load()).json()).toEqual({ data: { index: 0 } });
        const saved = await fetch(preview.url, {
          method: "POST",
          headers,
          body: "7",
        });
        expect(saved.headers.get("x-moonshine-data")).toBe("1");
        expect(await saved.json()).toEqual({ data: { saved: 7 } });
        expect(await (await load()).json()).toEqual({ data: { index: 7 } });
        const denied = await fetch(preview.url, {
          method: "POST",
          body: "99",
          headers: { ...headers, origin: "http://evil.test" },
        });
        expect(denied.status).toBe(403);
        expect(await (await load()).json()).toEqual({ data: { index: 7 } });
        const document = await fetch(preview.url);
        expect(document.headers.get("vary")).toContain("x-moonshine-data");
        expect(await document.text()).toBe(
          renderer === "native" ? "native fixture" : "moonshine-react",
        );
      } finally {
        await preview.stop();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
