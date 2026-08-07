import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createBunServer } from "@tschk/moonshine-deploy-bun";
import { readManifest } from "@tschk/moonshine-compiler";
import {
  createRequestHandler,
  type RouteModule,
} from "@tschk/moonshine-server";
import {
  PUBLIC_DIR,
  type MoonshineManifest,
  type Renderer,
  type RouteArtifact,
} from "@tschk/moonshine-framework";
import { findConfig, loadConfig, type MoonshineCliConfig } from "./config.js";

export type PreviewHandle = {
  url: URL;
  port: number;
  stop: () => Promise<void>;
};

function resolveManifest(
  projectDir: string,
  manifest: MoonshineManifest,
): MoonshineManifest {
  function abs(p: string | undefined): string | undefined {
    return p ? resolve(projectDir, p) : undefined;
  }
  return {
    ...manifest,
    routes: manifest.routes.map((route: RouteArtifact) => ({
      ...route,
      file: abs(route.file)!,
      dataFile: abs(route.dataFile),
      layouts: route.layouts?.map(abs).filter(Boolean) as string[] | undefined,
      middleware: route.middleware?.map(abs).filter(Boolean) as
        string[] | undefined,
      errorBoundary: abs(route.errorBoundary),
    })),
  };
}

async function loadConfigMaybe(
  projectDir: string,
): Promise<MoonshineCliConfig> {
  const path = findConfig(projectDir);
  return path ? await loadConfig(path) : {};
}

async function resolveRenderer(
  name: string | undefined,
): Promise<Renderer | undefined> {
  switch (name) {
    case "solid":
      return (await import("@tschk/moonshine-solid")).solidRenderer;
    case "crepus":
      return (await import("@tschk/crepus-moonshine")).crepusRenderer;
    case "react":
    default:
      return (await import("@tschk/moonshine-react")).reactRenderer;
  }
}

export async function startPreview(options: {
  projectDir: string;
  port?: number;
  manifestPath?: string;
}): Promise<PreviewHandle> {
  const projectDir = resolve(options.projectDir);
  const manifestPath = options.manifestPath
    ? resolve(options.manifestPath)
    : resolve(projectDir, ".moonshine", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const raw = await readManifest(manifestPath);
  const manifest = resolveManifest(projectDir, raw);
  const config = await loadConfigMaybe(projectDir);
  const renderer = await resolveRenderer(config.renderer);
  const staticDir = resolve(projectDir, ".moonshine", PUBLIC_DIR);
  const serverBundlePath = resolve(
    projectDir,
    ".moonshine",
    raw.entries.server ?? "dist/server.js",
  );
  // A missing or broken server bundle used to be swallowed here, leaving an
  // empty module map: preview then booted happily and every server-rendered
  // route 500'd with "cannot find module <source path>", pointing at a file
  // that was never supposed to be loaded at runtime. Say which bundle failed
  // and why, once, instead of making the user infer it from the wreckage.
  let modules: Record<string, RouteModule> = {};
  try {
    const bundle = (await import(serverBundlePath)) as {
      modules?: Record<string, RouteModule>;
    };
    modules = bundle.modules ?? {};
  } catch (error) {
    console.warn(
      `moonshine preview: could not load ${serverBundlePath}\n` +
        `  ${error instanceof Error ? error.message : String(error)}\n` +
        `  Server-rendered routes will fail. Run \`moonshine build\` first.`,
    );
  }
  const fetch = createRequestHandler({
    manifest,
    modules,
    renderer,
    staticDir,
  });
  const server = createBunServer({
    fetch,
    port: options.port ?? 0,
    staticDir,
  });

  return {
    url: server.url,
    port: server.port,
    stop: async () => {
      await server.stop(true);
    },
  };
}

export async function previewCommand(args: string[]): Promise<void> {
  let projectDir = "";
  let port = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--port") {
      port = Number(args[++i]) || 0;
    } else if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else if (!projectDir) {
      projectDir = arg;
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }

  const preview = await startPreview({
    projectDir: projectDir || process.cwd(),
    port,
  });
  console.log(`Preview on http://localhost:${preview.port}/`);

  const stopAndExit = async () => {
    await preview.stop();
    process.exit(0);
  };
  process.on("SIGINT", stopAndExit);
  process.on("SIGTERM", stopAndExit);

  await new Promise(() => {});
}
