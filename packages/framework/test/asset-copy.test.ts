import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyAsset, copyAssets } from "../src/build";

test("public asset storage remains literal and cannot overwrite the server bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-copy-assets-"));
  try {
    await mkdir(join(root, "public/dist"), { recursive: true });
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/server.js"), "PRIVATE");
    const names = ["dist/server.js", "100%.svg", "a%20b.svg", "a b.svg"];
    const assets = names.map((name) => ({
      file: `public/${name}`,
      path: "/" + name.split("/").map(encodeURIComponent).join("/"),
    }));
    for (const name of names) await writeFile(join(root, "public", name), name);
    for (const asset of assets)
      expect(await copyAsset(asset, root)).toBe(asset.file);
    await copyAssets(assets, root);
    expect(await readFile(join(root, "dist/server.js"), "utf8")).toBe(
      "PRIVATE",
    );
    for (const name of names)
      expect(await readFile(join(root, "public", name), "utf8")).toBe(name);
    expect(await Bun.file(join(root, "a%2520b.svg")).exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("copyAsset rejects when source realpath fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-copy-broken-"));
  try {
    await symlink(join(root, "nonexistent"), join(root, "broken"));
    await expect(
      copyAsset({ file: join(root, "broken"), path: "/broken" }, root),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("public symlinks cannot alias private files", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-copy-link-"));
  try {
    await mkdir(join(root, "public"));
    await writeFile(join(root, "server.js"), "PRIVATE");
    await symlink(join(root, "server.js"), join(root, "public/alias.js"));
    await expect(
      copyAsset({ file: "public/alias.js", path: "/alias.js" }, root),
    ).rejects.toThrow("escapes");
    expect(await Bun.file(join(root, "alias.js")).exists()).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy external registrations still copy to their declared destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "moonshine-copy-legacy-"));
  try {
    await writeFile(join(root, "source.css"), "css");
    expect(
      await copyAsset(
        { file: join(root, "source.css"), path: "/app.css" },
        root,
      ),
    ).toBe("app.css");
    expect(await readFile(join(root, "app.css"), "utf8")).toBe("css");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
