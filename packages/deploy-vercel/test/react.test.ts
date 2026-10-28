import { afterAll, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildProjectIsolated } from "../../compiler/test/build-in-subprocess";

/**
 * A React build must deploy as Build Output Vercel can run: static routes
 * prerendered into `static/`, everything else served by one self-contained
 * Node function rendered through the server bundle's own React.
 */

// Inside the monorepo so `react` resolves at build time.
const projectDir = join(import.meta.dir, `.tmp-react-vercel-${process.pid}`);
let standalone: string | undefined;

afterAll(async () => {
  await rm(projectDir, { recursive: true, force: true });
  if (standalone) await rm(standalone, { recursive: true, force: true });
});

test("React Vercel output runs relocated without host packages", async () => {
  const routes = join(projectDir, "src", "routes");
  await mkdir(join(routes, "hello"), { recursive: true });
  await writeFile(
    join(routes, "+layout.tsx"),
    `import { useId, type ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return <main data-layout={useId()}>{children}</main>;
}
`,
  );
  await writeFile(
    join(routes, "index.tsx"),
    `import { useState } from "react";
export default function Home() {
  const [label] = useState("home page");
  return <h1>{label}</h1>;
}
`,
  );
  await writeFile(
    join(routes, "about.tsx"),
    "export default function About() { return <h1>about page</h1>; }\n",
  );
  // Interactive, so an island route: still prerendered.
  await writeFile(
    join(routes, "contact.tsx"),
    "export default function Contact() { return <button onClick={() => {}}>contact page</button>; }\n",
  );
  await writeFile(
    join(routes, "hello", "[name].tsx"),
    `export function loader({ params }: { params: { name: string } }) {
  return { name: params.name };
}
// Loader data arrives keyed by the module that loaded it.
export default function Hello({ data }: { data: Record<string, { name: string }> }) {
  return <h1>hello {Object.values(data)[0]?.name}</h1>;
}
`,
  );
  await buildProjectIsolated({ projectDir, runtime: "node" });

  const outDir = join(projectDir, ".moonshine");
  // Bun.build is not safe to overlap with other test files in one process.
  const builder = Bun.spawn(
    [
      process.execPath,
      "-e",
      `const { vercelAdapter } = await import(process.argv[1]);
const out = process.argv[2];
await vercelAdapter.build(await Bun.file(out + "/manifest.json").json(), out);`,
      resolve(import.meta.dir, "../src/index.ts"),
      outDir,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const error = await new Response(builder.stderr).text();
  expect(await builder.exited, error).toBe(0);

  const output = join(outDir, ".vercel/output");
  const config = await Bun.file(join(output, "config.json")).json();
  expect(config.routes).toEqual([
    { handle: "filesystem" },
    { src: "/.*", dest: "/moonshine" },
  ]);
  expect(config.overrides).toEqual({
    "about.html": { path: "about" },
    "contact.html": { path: "contact" },
  });
  expect(await Bun.file(join(output, "static/contact.html")).text()).toContain(
    "contact page</button>",
  );
  expect(await Bun.file(join(output, "static/index.html")).text()).toMatch(
    /<main data-layout="[^"]+"><h1>home page<\/h1><\/main>/,
  );
  expect(await Bun.file(join(output, "static/about.html")).text()).toContain(
    "<h1>about page</h1>",
  );

  // No project sources or node_modules next to the function.
  standalone = await mkdtemp(join(tmpdir(), "moonshine-vercel-react-"));
  await cp(output, standalone, { recursive: true });
  const runner = Bun.spawn(
    [
      Bun.which("node")!,
      "--input-type=module",
      "-e",
      `
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
const root = process.argv[1];
const { default: handler } = await import(pathToFileURL(root + "/functions/moonshine.func/index.mjs"));
const server = createServer((req, res) => handler(req, res));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const base = "http://127.0.0.1:" + server.address().port;
  const hello = await fetch(base + "/hello/Vercel");
  assert.equal(hello.status, 200);
  assert.match(await hello.text(), /<main data-layout="[^"]+"><h1>hello <!-- -->Vercel<\\/h1><\\/main>/);
  assert.equal((await fetch(base + "/missing/page")).status, 404);
  console.log("React Vercel function passed");
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
`,
      standalone,
    ],
    { cwd: standalone, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(runner.stdout).text(),
    new Response(runner.stderr).text(),
    runner.exited,
  ]);
  expect(code, stdout + stderr).toBe(0);
  expect(stdout).toContain("React Vercel function passed");
}, 120_000);
