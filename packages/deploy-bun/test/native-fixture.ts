import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dir, "../../..");

/** Build a source copy, then keep only deployable output and host-free runtime packages. */
export async function prepareNativeArtifact() {
  const directory = await mkdtemp(join(tmpdir(), "moonshine-native-release-"));
  try {
    const source = join(directory, "source");
    const example = join(root, "examples/native-app");
    await cp(join(example, "src"), join(source, "src"), { recursive: true });
    await cp(join(example, "public"), join(source, "public"), {
      recursive: true,
    });
    await Bun.write(
      join(source, "public/files/a b%.txt"),
      "public percent and space",
    );
    await Bun.write(
      join(source, "public/files/literal%20.txt"),
      "literal percent escape",
    );
    await cp(
      join(example, "moonshine.config.ts"),
      join(source, "moonshine.base.ts"),
    );
    // A second SPA page makes cross-route downloads observable in the portable fixture.
    await Bun.write(
      join(source, "moonshine.config.ts"),
      `
import base from './moonshine.base';
export default { ...base, routes: [...base.routes, {
  id: 'other', path: '/other', file: 'src/other.ts',
  clientFile: 'src/other-client.ts', mode: 'spa'
}] };
`,
    );
    await Bun.write(
      join(source, "src/other.ts"),
      `
export const loader = () => ({ label: 'other page' });
export default function Page() { throw Error('SPA server must not render'); }
`,
    );
    await Bun.write(
      join(source, "src/other-client.ts"),
      `
import './other.css';
import { h } from '@tschk/moonshine-dom/dom';
import { createSignal } from '@tschk/moonshine-dom/reactive';
export default function Page() {
  const [count, setCount] = createSignal(0);
  return h('button', { onClick: () => setCount(count() + 1) },
    () => 'OTHER_PAGE_ONLY_MARKER ' + count());
}
`,
    );
    await Bun.write(
      join(source, "src/other.css"),
      "button { color: rgb(90, 80, 70); }",
    );
    const counterClient = join(source, "src/client/counter.ts");
    await Bun.write(
      counterClient,
      `import './counter.css';\n${await Bun.file(counterClient).text()}`,
    );
    await Bun.write(
      join(source, "src/client/counter.css"),
      "h1 { color: rgb(10, 20, 30); }",
    );
    for (const [file, css] of [
      ["src/layout.ts", "shared-fixture.css"],
      ["src/routes/home.ts", "home-fixture.css"],
      ["src/routes/about.ts", "about-fixture.css"],
    ]) {
      const path = join(source, file!);
      await Bun.write(
        path,
        `import './${css}';\n${await Bun.file(path).text()}`,
      );
    }
    await Bun.write(
      join(source, "src/shared-fixture.css"),
      "body { background-color: rgb(240, 245, 250); }",
    );
    await Bun.write(
      join(source, "src/routes/home-fixture.css"),
      `@import './home-layer.css' layer(theme) screen; p { background-image: url('./pixel.svg'); }`,
    );
    await Bun.write(
      join(source, "src/routes/home-layer.css"),
      "h1 { color: rgb(70, 20, 90); }",
    );
    await Bun.write(
      join(source, "src/routes/about-fixture.css"),
      "h1 { color: rgb(20, 90, 70); }",
    );
    await Bun.write(
      join(source, "src/routes/pixel.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path fill="red" d="M0 0h1v1H0z"/></svg>',
    );
    await mkdir(join(source, "node_modules/@tschk"), { recursive: true });
    for (const [name, folder] of [
      ["moonshine-dom", "dom"],
      ["moonshine-framework", "framework"],
    ]) {
      await symlink(
        join(root, "packages", folder!),
        join(source, "node_modules/@tschk", name!),
      );
    }
    const build = Bun.spawn(
      [
        Bun.which("bun")!,
        join(root, "packages/cli/bin/moonshine.ts"),
        "build",
        source,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const stderr = await new Response(build.stderr).text();
    if (await build.exited) throw Error(stderr);
    const artifact = join(directory, "artifact");
    await mkdir(artifact);
    for (const file of ["server.ts", "manifest.json", "dist", "public"]) {
      await cp(join(source, ".moonshine", file), join(artifact, file), {
        recursive: true,
      });
    }
    await rm(source, { recursive: true, force: true });
    for (const [name, folder] of [
      ["moonshine", "core"],
      ["moonshine-framework", "framework"],
      ["moonshine-router", "router"],
      ["moonshine-server", "server"],
      ["moonshine-deploy-bun", "deploy-bun"],
      ["moonshine-next", "adapter-next"],
    ]) {
      const target = join(artifact, "node_modules/@tschk", name!);
      await cp(join(root, "packages", folder!, "src"), join(target, "src"), {
        recursive: true,
      });
      await cp(
        join(root, "packages", folder!, "package.json"),
        join(target, "package.json"),
      );
    }
    return {
      directory,
      artifact,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function startNativeArtifact(artifact: string) {
  const child = Bun.spawn(
    [
      Bun.which("bun")!,
      "-e",
      "const {server}=await import(process.argv[1]); console.log(server.url.href);",
      join(artifact, "server.ts"),
    ],
    {
      cwd: artifact,
      env: { ...process.env, PORT: "0" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const reader = child.stdout.getReader();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const first = await Promise.race([
      reader.read(),
      child.exited.then(async (code) => {
        throw Error(
          `Native server exited ${code}: ${await new Response(child.stderr).text()}`,
        );
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(Error("Native server startup timed out")),
          10000,
        );
      }),
    ]);
    if (!first.value) throw Error("Native server produced no URL");
    return {
      url: new TextDecoder().decode(first.value).trim(),
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
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
