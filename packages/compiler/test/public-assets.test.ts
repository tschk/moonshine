import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { preparePublicAssets } from "../src/build";
import { readManifest } from "../src/manifest";
import { buildProjectIsolated } from "./build-in-subprocess";
import { createRequestHandler } from "@tschk/moonshine-server";

async function fixture() {
  const root = await mkdtemp(join(import.meta.dir, "fixtures/public-assets-"));
  await mkdir(join(root, "src/routes"), { recursive: true });
  await mkdir(join(root, "node_modules/@tschk"), { recursive: true });
  await symlink(
    resolve(import.meta.dir, "../../dom"),
    join(root, "node_modules/@tschk/moonshine-dom"),
  );
  await writeFile(
    join(root, "src/routes/index.ts"),
    "export default () => null;",
  );
  return root;
}

test("public assets retain literal names, hashed manifests and HTTP URLs across rebuilds", async () => {
  const root = await fixture();
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    await mkdir(join(root, "public/nested"), { recursive: true });
    const names = [
      "logo.svg",
      "nested/space name.svg",
      "nested/literal%2F.svg",
    ];
    for (const name of names)
      await writeFile(join(root, "public", name), `<svg>${name}</svg>`);
    const options = {
      projectDir: root,
      renderer: "native" as const,
      mode: "ssr" as const,
    };
    await buildProjectIsolated(options);
    const manifest = await readManifest(join(root, ".moonshine/manifest.json"));
    const firstHash = manifest.assets.find(
      (entry) => entry.path === "/logo.svg",
    )!.integrity;
    const handler = createRequestHandler({
      routes: [],
      staticDir: join(root, ".moonshine/public"),
    });
    server = Bun.serve({ port: 0, fetch: handler });
    for (const name of names) {
      const url = "/" + name.split("/").map(encodeURIComponent).join("/");
      const asset = manifest.assets.find((entry) => entry.path === url)!;
      expect(asset.file).toBe(`public/${name}`);
      const bytes = await Bun.file(
        join(root, ".moonshine", asset.file),
      ).bytes();
      expect(asset.integrity).toBe(
        `sha256-${new Bun.CryptoHasher("sha256").update(bytes).digest("base64")}`,
      );
      const response = await fetch(new URL(url, server.url));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(`<svg>${name}</svg>`);
    }
    await writeFile(join(root, "public/logo.svg"), "changed");
    await rm(join(root, "public/nested"), { recursive: true });
    await buildProjectIsolated(options);
    const rebuilt = await readManifest(join(root, ".moonshine/manifest.json"));
    expect(
      rebuilt.assets.find((asset) => asset.path === "/logo.svg")!.integrity,
    ).not.toBe(firstHash);
    expect(
      await Bun.file(join(root, ".moonshine/public/logo.svg")).text(),
    ).toBe("changed");
    expect(
      rebuilt.assets.some((asset) => asset.path?.includes("nested/")),
    ).toBe(false);
    expect(
      await Bun.file(
        join(root, ".moonshine/public/nested/space name.svg"),
      ).exists(),
    ).toBe(false);
  } finally {
    await server?.stop(true);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("public preflight rejects source/output overlap and symlinks without changing inputs", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "public"));
    await writeFile(join(root, "public/logo.svg"), "source");
    for (const output of [
      join(root, "public"),
      join(root, "public/build"),
      parse(root).root,
      root,
    ])
      await expect(preparePublicAssets(root, output)).rejects.toThrow(
        "must not overlap",
      );
    await mkdir(join(root, ".moonshine"));
    await writeFile(join(root, ".moonshine/keep"), "previous artifact");
    await symlink(
      join(root, "src/routes/index.ts"),
      join(root, "public/private.ts"),
    );
    await expect(
      buildProjectIsolated({ projectDir: root, renderer: "native" }),
    ).rejects.toThrow("symlinks are unsupported");
    expect(await readFile(join(root, ".moonshine/keep"), "utf8")).toBe(
      "previous artifact",
    );
    expect(await readFile(join(root, "public/logo.svg"), "utf8")).toBe(
      "source",
    );
    await rm(join(root, "public"), { recursive: true });
    await mkdir(join(root, "assets"));
    await symlink(join(root, "assets"), join(root, "public"));
    await expect(
      preparePublicAssets(root, join(root, ".moonshine")),
    ).rejects.toThrow("not a symlink");
    expect(await readFile(join(root, ".moonshine/keep"), "utf8")).toBe(
      "previous artifact",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("public URL and generated destination collisions fail before any public files copy", async () => {
  for (const name of ["dist/server.js", "client.js", "client.js/nested.svg"]) {
    const root = await fixture();
    try {
      await mkdir(
        join(
          root,
          "public",
          name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "",
        ),
        { recursive: true },
      );
      await writeFile(
        join(root, "public", name),
        "must not overwrite generated code",
      );
      await writeFile(join(root, "public/a-safe.svg"), "safe source");
      await writeFile(
        join(root, "src/client.ts"),
        'import {h} from "@tschk/moonshine-dom/dom";export default()=>h("p",null,"client");',
      );
      await expect(
        buildProjectIsolated({
          projectDir: root,
          renderer: "native",
          programmatic: [
            {
              id: "index",
              path: "/",
              file: "src/routes/index.ts",
              mode: "spa",
              clientFile: "src/client.ts",
            },
          ],
        }),
      ).rejects.toThrow("collides with generated output");
      expect(
        await Bun.file(join(root, ".moonshine/public/a-safe.svg")).exists(),
      ).toBe(false);
      expect(await Bun.file(join(root, "public", name)).text()).toBe(
        "must not overwrite generated code",
      );
      expect(
        await Bun.file(join(root, ".moonshine/dist/server.js")).text(),
      ).not.toBe("must not overwrite generated code");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}, 30_000);

test("missing public input produces an empty plan", async () => {
  const root = await fixture();
  try {
    expect(await preparePublicAssets(root, join(root, ".moonshine"))).toEqual(
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("public assets use the same manifest contract for legacy renderer builds", async () => {
  for (const renderer of ["react", "solid", "crepus"] as const) {
    const root = await fixture();
    try {
      await mkdir(join(root, "public"));
      await writeFile(join(root, "public/logo.svg"), "legacy public asset");
      await buildProjectIsolated({ projectDir: root, renderer, mode: "ssr" });
      const manifest = await readManifest(
        join(root, ".moonshine/manifest.json"),
      );
      const asset = manifest.assets.find(
        (entry) => entry.path === "/logo.svg",
      )!;
      expect(asset.file).toBe("public/logo.svg");
      expect(await Bun.file(join(root, ".moonshine", asset.file)).text()).toBe(
        "legacy public asset",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}, 30_000);
