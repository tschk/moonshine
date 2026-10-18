import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createBunServer } from "@tschk/moonshine-deploy-bun";
import {
  PUBLIC_DIR,
  type MoonshineManifest,
  type Renderer,
} from "@tschk/moonshine-framework";
import {
  createRequestHandler,
  type RouteModule,
} from "@tschk/moonshine-server";
import type { PreviewHandle } from "./preview";

export type NativePreviewOptions = {
  projectDir: string;
  manifestPath: string;
  port?: number;
};

export async function startNativeServer(
  options: NativePreviewOptions,
): Promise<PreviewHandle> {
  const manifest = (await Bun.file(
    options.manifestPath,
  ).json()) as MoonshineManifest;
  const path = resolve(
    options.projectDir,
    ".moonshine",
    manifest.entries.server ?? "dist/server.js",
  );
  const bundle = (await import(pathToFileURL(path).href)) as {
    modules?: Record<string, RouteModule>;
    renderer?: Renderer;
    requestScope?: Parameters<typeof createRequestHandler>[0]["requestScope"];
  };
  if (!bundle.renderer)
    throw new Error(
      "Native renderer missing from server bundle; rebuild the project",
    );
  if (manifest.requestContext && typeof bundle.requestScope !== "function")
    throw new Error(
      "Request context runner missing from server bundle; rebuild the project",
    );
  const staticDir = resolve(options.projectDir, ".moonshine", PUBLIC_DIR);
  const makeHandler = manifest.dataRequests
    ? (await import("@tschk/moonshine-server/data-http")).createRequestHandler
    : createRequestHandler;
  const server = createBunServer({
    fetch: makeHandler({
      manifest,
      modules: bundle.modules ?? {},
      renderer: bundle.renderer,
      ...(manifest.requestContext ? { requestScope: bundle.requestScope } : {}),
      staticDir,
    }),
    port: options.port ?? 0,
  });
  return {
    url: server.url,
    port: server.port,
    stop: async () => {
      await server.stop(true);
    },
  };
}

/** A fresh Bun process avoids both ESM and filesystem caches across rebuilds. */
export function startNativePreview(
  options: NativePreviewOptions,
): Promise<PreviewHandle> {
  return new Promise((resolveReady, reject) => {
    let settled = false;
    let stopping: Promise<void> | undefined;
    let child: ReturnType<typeof Bun.spawn>;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      void child.exited.then(() => reject(error));
    };
    const timer = setTimeout(
      () => fail(new Error("Native preview startup timed out")),
      10_000,
    );
    try {
      child = Bun.spawn(
        [
          process.execPath,
          resolve(import.meta.dir, "preview-worker.ts"),
          JSON.stringify(options),
        ],
        {
          stdout: "inherit",
          stderr: "inherit",
          ipc(message: unknown) {
            if (settled || !message || typeof message !== "object") return;
            if (
              "type" in message &&
              message.type === "moonshine:error" &&
              "error" in message &&
              typeof message.error === "string"
            ) {
              fail(new Error(message.error));
            } else if (
              "type" in message &&
              message.type === "moonshine:ready" &&
              "url" in message &&
              typeof message.url === "string"
            ) {
              settled = true;
              clearTimeout(timer);
              const url = new URL(message.url);
              resolveReady({
                url,
                port: Number(url.port),
                stop: () =>
                  (stopping ??= (async () => {
                    if (child.exitCode !== null) return;
                    try {
                      child.send({ type: "moonshine:stop" });
                    } catch {
                      child.kill("SIGKILL");
                    }
                    const shutdownTimer = setTimeout(
                      () => child.kill("SIGKILL"),
                      1_000,
                    );
                    try {
                      await child.exited;
                    } finally {
                      clearTimeout(shutdownTimer);
                    }
                  })()),
              });
            }
          },
        },
      );
      void child.exited.then((code) =>
        fail(new Error(`Native preview exited before readiness (${code})`)),
      );
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  });
}
