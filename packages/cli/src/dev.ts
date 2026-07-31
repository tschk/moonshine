import { watch } from "node:fs";
import { resolve } from "node:path";
import { buildCommand } from "./build.js";
import { startPreview, type PreviewHandle } from "./preview.js";

export async function devCommand(args: string[]): Promise<void> {
  const vite = args.includes("--vite");
  if (vite) {
    const proc = Bun.spawn(
      ["bunx", "vite", ...args.filter((a) => a !== "--vite")],
      {
        cwd: process.cwd(),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    process.exit(await proc.exited);
  }

  let projectDir = "";
  for (const arg of args) {
    if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    } else if (!projectDir) {
      projectDir = arg;
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }

  const root = resolve(projectDir || process.cwd());
  const srcDir = resolve(root, "src");
  let preview: PreviewHandle | undefined;
  let watcher: ReturnType<typeof watch> | undefined;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

  async function runBuildAndPreview(): Promise<void> {
    if (preview) {
      await preview.stop();
      preview = undefined;
    }
    try {
      await buildCommand([root]);
      preview = await startPreview({ projectDir: root, port: 0 });
      console.log(`Dev server on http://localhost:${preview.port}/`);
    } catch (error) {
      console.error(error);
    }
  }

  await runBuildAndPreview();

  if (watcher) {
    watcher.close();
  }

  watcher = watch(srcDir, { recursive: true }, () => {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      void runBuildAndPreview();
    }, 100);
  });

  const stop = async () => {
    if (rebuildTimer) clearTimeout(rebuildTimer);
    if (watcher) {
      watcher.close();
      watcher = undefined;
    }
    if (preview) {
      await preview.stop();
      preview = undefined;
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  await new Promise(() => {});
}
