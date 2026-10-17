import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildProjectIsolated } from "../../compiler/test/build-in-subprocess";
import { startPreview } from "../src/preview";

test("native preview loads rebuilt server content at the same output path", async () => {
  const projectDir = await mkdtemp(
    join(tmpdir(), "moonshine preview rebuild-"),
  );
  try {
    await mkdir(join(projectDir, "src/routes"), { recursive: true });
    await mkdir(join(projectDir, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../dom"),
      join(projectDir, "node_modules/@tschk/moonshine-dom"),
    );
    await writeFile(
      join(projectDir, "moonshine.config.ts"),
      'export default {renderer: "native"};',
    );
    for (const version of ["first", "second"]) {
      await writeFile(
        join(projectDir, "src/routes/index.ts"),
        `
export function loader() { return {version: ${JSON.stringify(version)}}; }
export default function Page({data}) { return "page " + data.index.version; }
`,
      );
      await buildProjectIsolated({ projectDir, renderer: "native" });
      const preview = await startPreview({ projectDir });
      try {
        const response = await fetch(preview.url);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(`page ${version}`);
      } finally {
        await preview.stop();
        await preview.stop();
        const rebound = Bun.serve({
          port: preview.port,
          fetch: () => new Response("released"),
        });
        expect(await (await fetch(rebound.url)).text()).toBe("released");
        await rebound.stop(true);
        if (version === "second") {
          let ready!: () => void;
          const readiness = new Promise<void>((resolveReady) => {
            ready = resolveReady;
          });
          const child = Bun.spawn(
            [
              process.execPath,
              resolve(import.meta.dir, "../src/preview-worker.ts"),
              JSON.stringify({
                projectDir,
                manifestPath: join(projectDir, ".moonshine/manifest.json"),
              }),
            ],
            {
              stdout: "inherit",
              stderr: "inherit",
              ipc(message: unknown) {
                if (
                  message &&
                  typeof message === "object" &&
                  "type" in message &&
                  message.type === "moonshine:ready"
                )
                  ready();
              },
            },
          );
          const deadline = setTimeout(() => child.kill("SIGKILL"), 10_000);
          try {
            await Promise.race([
              readiness,
              child.exited.then(() => {
                throw new Error("Worker exited before readiness");
              }),
            ]);
            child.disconnect();
            expect(await child.exited).toBe(0);
          } finally {
            clearTimeout(deadline);
            if (child.exitCode === null) child.kill("SIGKILL");
            await child.exited;
          }
        }
      }
    }
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}, 30_000);

test("native preview rejects a missing bundle and releases its child", async () => {
  const projectDir = await mkdtemp(
    join(tmpdir(), "moonshine preview missing-"),
  );
  try {
    await mkdir(join(projectDir, ".moonshine"));
    await writeFile(
      join(projectDir, ".moonshine/manifest.json"),
      JSON.stringify({
        renderer: "native",
        entries: { server: "dist/missing.js" },
        routes: [],
        assets: [],
        capabilities: [],
      }),
    );
    await expect(startPreview({ projectDir })).rejects.toThrow("missing.js");
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}, 30_000);

test("preview rejects an opted-in bundle without its request context runner", async () => {
  for (const renderer of ["native", "react"]) {
    const projectDir = await mkdtemp(
      join(tmpdir(), "moonshine preview scope-"),
    );
    try {
      await mkdir(join(projectDir, ".moonshine/dist"), { recursive: true });
      await writeFile(
        join(projectDir, ".moonshine/manifest.json"),
        JSON.stringify({
          renderer,
          requestContext: true,
          entries: { server: "dist/server.js" },
          routes: [],
          assets: [],
          capabilities: [],
        }),
      );
      await writeFile(
        join(projectDir, ".moonshine/dist/server.js"),
        "export const modules = {}; export const renderer = {render: async () => new Response('ok')};",
      );
      await expect(startPreview({ projectDir })).rejects.toThrow(
        "Request context runner missing",
      );
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  }
}, 30_000);

test("native preview uses the compiled request runner for concurrent loaders", async () => {
  const projectDir = await mkdtemp(
    join(tmpdir(), "moonshine preview requests-"),
  );
  try {
    await mkdir(join(projectDir, "src/routes"), { recursive: true });
    await mkdir(join(projectDir, "node_modules/@tschk"), { recursive: true });
    for (const [name, directory] of [
      ["moonshine-dom", "dom"],
      ["moonshine-framework", "framework"],
    ]) {
      await symlink(
        resolve(import.meta.dir, "../../", directory!),
        join(projectDir, "node_modules/@tschk", name!),
      );
    }
    await writeFile(
      join(projectDir, "src/routes/index.ts"),
      `
import {getRequest} from "@tschk/moonshine-framework/request";
export async function loader() {
  const request=getRequest();
  await new Promise(resolve=>setTimeout(resolve,2));
  if(getRequest()!==request)throw new Error("Request scope leaked");
  return {name:request.headers.get("x-name")};
}
export default function Page({data}) {return "hello, "+data.index.name;}
`,
    );
    await buildProjectIsolated({
      projectDir,
      renderer: "native",
      requestContext: true,
    });
    const preview = await startPreview({ projectDir });
    try {
      const results = await Promise.all(
        ["left", "right"].map(async (name) => {
          const response = await fetch(preview.url, {
            headers: { "x-name": name },
          });
          expect(response.status).toBe(200);
          return response.text();
        }),
      );
      expect(results[0]).toContain("hello, left");
      expect(results[1]).toContain("hello, right");
    } finally {
      await preview.stop();
    }
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}, 30000);
