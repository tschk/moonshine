import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildProjectIsolated } from "../../compiler/test/build-in-subprocess";

test("React Node artifact runs relocated without sources or packages", async () => {
  const project = join(import.meta.dir, `.tmp-node-react-${process.pid}`);
  const standalone = await mkdtemp(join(tmpdir(), "moonshine-node-react-"));
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const routes = join(project, "src/routes");
    await mkdir(join(routes, "hello"), { recursive: true });
    await mkdir(join(project, "public"), { recursive: true });
    await writeFile(join(project, "public/hello.txt"), "public asset");
    await writeFile(
      join(routes, "+layout.tsx"),
      `import { useId } from "react";
export default function Layout({ children }) { return <main data-id={useId()}>{children}</main>; }
`,
    );
    await writeFile(
      join(routes, "hello/[name].tsx"),
      `import { useState } from "react";
export function loader({ params }) { return { name: params.name }; }
export default function Hello({ data }) {
  const [prefix] = useState("hello");
  return <h1>{prefix} {Object.values(data)[0].name}</h1>;
}
`,
    );
    await buildProjectIsolated({ projectDir: project, runtime: "node" });
    const out = join(project, ".moonshine");
    const builder = Bun.spawn(
      [
        process.execPath,
        "-e",
        `const { nodeAdapter } = await import(process.argv[1]);
const out = process.argv[2];
await nodeAdapter.build(await Bun.file(out + "/manifest.json").json(), out);`,
        resolve(import.meta.dir, "../src/index.ts"),
        out,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [builderOut, builderErr, builderCode] = await Promise.all([
      new Response(builder.stdout).text(),
      new Response(builder.stderr).text(),
      builder.exited,
    ]);
    expect(builderCode, builderOut + builderErr).toBe(0);
    await cp(join(out, "server.mjs"), join(standalone, "server.mjs"));
    await cp(join(out, "public"), join(standalone, "public"), {
      recursive: true,
    });
    await rm(project, { recursive: true, force: true });
    child = Bun.spawn([Bun.which("node")!, join(standalone, "server.mjs")], {
      cwd: standalone,
      env: { ...process.env, PORT: "0" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
    const first = await Promise.race([
      reader.read(),
      child.exited.then(async (code) => {
        throw new Error(
          `Node exited ${code}: ${await new Response(child!.stderr as ReadableStream<Uint8Array>).text()}`,
        );
      }),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error("Node startup timed out")),
          10000,
        );
      }),
    ]);
    reader.releaseLock();
    expect(first.value).toBeDefined();
    const url = new TextDecoder().decode(first.value).trim();
    const response = await fetch(new URL("/hello/Node", url));
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(
      /<main data-id="[^"]+"><h1>hello<!-- --> <!-- -->Node<\/h1><\/main>/,
    );
    const asset = await fetch(new URL("/hello.txt", url));
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("public asset");
    expect((await fetch(new URL("/missing", url))).status).toBe(404);
  } finally {
    clearTimeout(deadline);
    child?.kill();
    await child?.exited;
    await rm(project, { recursive: true, force: true });
    await rm(standalone, { recursive: true, force: true });
  }
}, 120_000);
