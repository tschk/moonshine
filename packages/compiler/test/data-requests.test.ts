import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

for (const runtime of ["bun", "node"] as const) {
  test(`data requests survive ${runtime} builds only when explicitly enabled`, async () => {
    const root = await mkdtemp(
      join(import.meta.dir, "fixtures/data-requests-"),
    );
    try {
      await mkdir(join(root, "src/routes"), { recursive: true });
      await mkdir(join(root, "node_modules/@tschk"), { recursive: true });
      await symlink(
        resolve(import.meta.dir, "../../dom"),
        join(root, "node_modules/@tschk/moonshine-dom"),
      );
      await writeFile(
        join(root, "src/routes/index.ts"),
        'export const loader=()=>({count:1});export default function Page(){return "document";}',
      );
      const options = {
        projectDir: root,
        renderer: "native" as const,
        runtime,
        mode: "ssr" as const,
      };
      await buildProjectIsolated({ ...options, dataRequests: true });
      expect(
        (await readManifest(join(root, ".moonshine/manifest.json")))
          .dataRequests,
      ).toBe(true);
      const publicOrigin = { origin: "HTTPS://Public.test:443/" };
      await buildProjectIsolated({ ...options, dataRequests: publicOrigin });
      expect(
        (await readManifest(join(root, ".moonshine/manifest.json")))
          .dataRequests,
      ).toEqual({ origin: "https://public.test" });
      await buildProjectIsolated({ ...options, dataRequests: false });
      expect(
        Object.hasOwn(
          await readManifest(join(root, ".moonshine/manifest.json")),
          "dataRequests",
        ),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("data requests refuse unsupported and mixed deployment runtimes before output", async () => {
  await expect(
    buildProjectIsolated({
      projectDir: "/nonexistent-data-request-project",
      runtime: "cloudflare",
      dataRequests: true,
    }),
  ).rejects.toThrow("only Bun and Node");
  const root = await mkdtemp(
    join(import.meta.dir, "fixtures/data-requests-mixed-"),
  );
  try {
    await mkdir(join(root, "src/routes"), { recursive: true });
    await writeFile(
      join(root, "src/routes/index.ts"),
      'export default function Page(){return "document";}',
    );
    await expect(
      buildProjectIsolated({
        projectDir: root,
        runtime: "bun",
        dataRequests: true,
        programmatic: [
          {
            id: "page",
            path: "/mixed",
            file: "src/routes/index.ts",
            runtime: "node",
          },
        ],
      }),
    ).rejects.toThrow("must match the configured server runtime");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid data-request public origins reject before project/output access", async () => {
  await expect(
    buildProjectIsolated({
      projectDir: "/nonexistent-data-origin-project",
      dataRequests: { origin: "https://public.test/path" },
    }),
  ).rejects.toThrow("without credentials, path, query or hash");
});

test("untyped data request flags fail before project access", async () => {
  for (const dataRequests of [
    "false",
    1,
    null,
    [],
    { origin: "https://public.test", extra: "private" },
  ]) {
    const options = JSON.parse(
      JSON.stringify({
        projectDir: "/nonexistent-data-request-config-project",
        dataRequests,
      }),
    );
    await expect(buildProjectIsolated(options)).rejects.toThrow(
      "dataRequests must",
    );
  }
});
