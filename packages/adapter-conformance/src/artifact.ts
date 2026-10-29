import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DeploymentAdapter } from "@tschk/moonshine-framework";

/** A deploy target that runs a built artifact the way its platform does. */
export type ArtifactRuntime = {
  name: string;
  /**
   * The deployable part of the build output. When set, only these paths are
   * copied to a fresh directory, and the source project is deleted, before
   * the runtime starts, so the artifact cannot lean on either.
   */
  files?: string[];
  start(dir: string): Promise<RunningArtifact>;
};

export type RunningArtifact = { url: URL; stop(): Promise<void> };

const fixtureApp = resolve(import.meta.dir, "fixtures/app");
const scratch = resolve(import.meta.dir, "../.cache/artifacts");
const cli = fileURLToPath(
  import.meta.resolve("@tschk/moonshine-cli/bin/moonshine.ts"),
);

/** Waits for the first stdout line, which each artifact prints as its URL. */
async function spawnArtifact(
  cmd: string[],
  cwd: string,
): Promise<RunningArtifact> {
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, PORT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let text = "";
    while (!text.includes("\n")) {
      const chunk = await Promise.race([
        reader.read(),
        child.exited.then(async (code) => {
          throw new Error(
            `${cmd.join(" ")} exited ${code}: ${await new Response(child.stderr).text()}`,
          );
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${cmd.join(" ")} did not start`)),
            20_000,
          );
        }),
      ]);
      clearTimeout(timer);
      if (chunk.done)
        throw new Error(
          `${cmd.join(" ")} printed no URL: ${await new Response(child.stderr).text()}`,
        );
      text += new TextDecoder().decode(chunk.value);
    }
    return {
      url: new URL(text.split("\n")[0]!.trim()),
      stop: async () => {
        child.kill();
        await child.exited;
      },
    };
  } catch (error) {
    child.kill();
    await child.exited;
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function node(): string {
  const path = Bun.which("node");
  if (!path) throw new Error("Node.js is required to run deploy artifacts");
  return path;
}

const runtimeScript = (name: string) =>
  resolve(import.meta.dir, "runtimes", name);

export const bunRuntime: ArtifactRuntime = {
  name: "Bun",
  start: (dir) =>
    spawnArtifact(
      [
        process.execPath,
        "-e",
        "const {server}=await import(process.argv[1]); console.log(server.url.href);",
        join(dir, "server.ts"),
      ],
      dir,
    ),
};

export const nodeRuntime: ArtifactRuntime = {
  name: "Node.js",
  files: ["server.js", "public"],
  start: (dir) => spawnArtifact([node(), "server.js"], dir),
};

export const workerdRuntime: ArtifactRuntime = {
  name: "workerd",
  files: ["server.js", "wrangler.jsonc", "public"],
  start: (dir) =>
    spawnArtifact([node(), runtimeScript("workerd.mjs"), dir], dir),
};

export const vercelRuntime: ArtifactRuntime = {
  name: "Vercel Build Output (Node.js + workerd)",
  files: [".vercel/output"],
  start: (dir) =>
    spawnArtifact(
      [node(), runtimeScript("vercel.mjs"), join(dir, ".vercel/output")],
      dir,
    ),
};

/** Bare specifiers left in a bundle would resolve only beside node_modules. */
async function unbundledImports(dir: string, files: string[]) {
  const found: string[] = [];
  const glob = new Bun.Glob("**/*.{js,mjs}");
  for (const entry of files) {
    const root = join(dir, entry);
    const paths = (await stat(root)).isDirectory()
      ? await Array.fromAsync(glob.scan({ cwd: root, absolute: true }))
      : glob.match(entry)
        ? [root]
        : [];
    for (const path of paths) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(
        /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"'./][^"']*)["']/g,
      )) {
        if (!/^(node|cloudflare|workerd):/.test(match[1]!))
          found.push(`${relative(dir, path)}: ${match[1]}`);
      }
    }
  }
  return found;
}

const route = (
  id: string,
  path: string,
  file: string,
  mode: string,
  extra = "",
) =>
  `{ id: ${JSON.stringify(id)}, path: ${JSON.stringify(path)}, file: "pages/${file}", mode: "${mode}"${extra} }`;

/**
 * Builds a real React project with `moonshine build --adapter <name>` and runs
 * the output on the adapter's own runtime — never on the Bun process running
 * the tests — then checks it over HTTP.
 *
 * `adapterDir` is the adapter package directory; the fixture installs it the
 * way an app would, so the CLI resolves the adapter under test.
 */
export function artifactConformance(
  adapter: DeploymentAdapter,
  runtime: ArtifactRuntime,
  adapterDir: string,
): void {
  const revalidates = adapter.capabilities.includes("revalidation");
  const edge = adapter.runtimes.includes("vercel-edge");
  const base = adapter.runtimes[0]!;

  describe(`${adapter.name} artifact on ${runtime.name}`, () => {
    let work: string;
    let deployDir: string;
    let app: RunningArtifact | undefined;
    const url = (path: string) => new URL(path, app!.url);

    beforeAll(async () => {
      await mkdir(scratch, { recursive: true });
      work = await mkdtemp(join(scratch, `${adapter.name}-`));
      const project = join(work, "project");
      await cp(fixtureApp, project, { recursive: true });
      await mkdir(join(project, "src/routes"), { recursive: true });
      await mkdir(join(project, "node_modules/@tschk"), { recursive: true });
      await symlink(
        adapterDir,
        join(project, `node_modules/@tschk/moonshine-deploy-${adapter.name}`),
      );
      const routes = [
        route("home", "/", "home.tsx", "static"),
        route("hello", "/hello/:name", "hello.tsx", "ssr"),
        route("echo", "/api/echo", "echo.ts", "api"),
        route("old", "/old", "old.tsx", "ssr"),
        route("dashboard", "/dashboard/*", "dashboard.tsx", "spa"),
        ...(revalidates
          ? [
              route(
                "clock",
                "/clock",
                "clock.tsx",
                "ssr",
                ", cache: { revalidate: 1 }",
              ),
            ]
          : []),
        ...(edge
          ? [
              route(
                "edge",
                "/edge/*",
                "edge.tsx",
                "ssr",
                ', runtime: "vercel-edge"',
              ),
            ]
          : []),
      ];
      await Bun.write(
        join(project, "moonshine.config.ts"),
        `export default { runtime: ${JSON.stringify(base)}, routes: [\n  ${routes.join(",\n  ")},\n] };\n`,
      );
      // A child process, as `moonshine build` runs for real; in-process
      // Bun.build also races other test files that bundle.
      const build = Bun.spawn(
        [process.execPath, cli, "build", "--adapter", adapter.name, project],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [code, stderr] = await Promise.all([
        build.exited,
        new Response(build.stderr).text(),
      ]);
      if (code !== 0)
        throw new Error(`moonshine build exited ${code}: ${stderr}`);
      const output = join(project, ".moonshine");
      deployDir = output;
      if (runtime.files) {
        deployDir = join(work, "deploy");
        for (const file of runtime.files) {
          await mkdir(dirname(join(deployDir, file)), { recursive: true });
          await cp(join(output, file), join(deployDir, file), {
            recursive: true,
          });
        }
        await rm(project, { recursive: true, force: true });
      }
      app = await runtime.start(deployDir);
    }, 120_000);

    afterAll(async () => {
      await app?.stop();
      if (work) await rm(work, { recursive: true, force: true });
    });

    if (runtime.files) {
      test("deploys a self-contained bundle", async () => {
        expect(await unbundledImports(deployDir, runtime.files!)).toEqual([]);
      });
    }

    test("serves public assets", async () => {
      const res = await fetch(url("/app.css"));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/css");
      expect(await res.text()).toBe(
        await readFile(join(fixtureApp, "public/app.css"), "utf8"),
      );
    });

    test("renders a static route with its loader data", async () => {
      const res = await fetch(url("/"));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain("<h1>Home from loader</h1>");
    });

    test("server-renders a component that uses hooks", async () => {
      const res = await fetch(url("/hello/world"));
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<p>hello world</p>");
    });

    test("handles API reads and writes", async () => {
      const read = await fetch(url("/api/echo"), {
        headers: { "x-test": "42" },
      });
      expect(read.status).toBe(200);
      expect(read.headers.get("x-moonshine")).toBe("ok");
      expect(await read.json()).toEqual({ method: "GET", header: "42" });
      const write = await fetch(url("/api/echo"), {
        method: "POST",
        body: "payload",
      });
      expect(write.status).toBe(200);
      expect(await write.json()).toEqual({ method: "POST", body: "payload" });
    });

    test("preserves loader redirects", async () => {
      const res = await fetch(url("/old"), { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/new");
    });

    test("returns 404 for unknown paths", async () => {
      const res = await fetch(url("/missing"));
      expect(res.status).toBe(404);
      await res.body?.cancel();
    });

    test("serves the SPA shell and its client bundle", async () => {
      const res = await fetch(url("/dashboard/a/b"));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('data-moonshine-app="dashboard"');
      const src = /<script type="module" src="([^"]+)"/.exec(html)?.[1];
      expect(src).toBeDefined();
      const script = await fetch(url(src!));
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toContain("javascript");
      await script.body?.cancel();
    });

    if (revalidates) {
      test("reuses a response until its revalidate window passes", async () => {
        const first = await fetch(url("/clock"));
        expect(first.headers.get("cache-control")).toContain("s-maxage=1");
        const body = await first.text();
        expect(body).toMatch(/render (<!-- -->)?\d+/);
        expect(await (await fetch(url("/clock"))).text()).toBe(body);
        await Bun.sleep(1_200);
        expect(await (await fetch(url("/clock"))).text()).not.toBe(body);
      });
    }

    if (edge) {
      test("runs Edge routes in the Edge function", async () => {
        // A splat route, so its regex must also match the bare prefix.
        for (const path of ["/edge", "/edge/a/b"]) {
          const res = await fetch(url(path));
          expect(res.status).toBe(200);
          expect(await res.text()).toContain("edge function");
        }
      });
    }
  });
}
