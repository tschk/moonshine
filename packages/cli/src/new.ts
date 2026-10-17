import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type Renderer = "native" | "react" | "crepus";
type Adapter = "bun" | "node" | "cloudflare" | "vercel";

export function detectMoonshineRoot(): string | null {
  if (process.env.MOONSHINE_PATH) return resolve(process.env.MOONSHINE_PATH);
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, "packages/core/package.json")) &&
      existsSync(join(dir, "packages/cli/package.json"))
    ) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function dep(root: string | null, rel: string, version = "^0.2.0"): string {
  return root ? `file:${join(root, rel)}` : version;
}

export function packagePath(
  name: string,
  root: string | null,
  version = "^0.2.0",
): string | undefined {
  const map: Record<string, string> = {
    "@tschk/moonshine": "packages/core",
    "@tschk/moonshine-dom": "packages/dom",
    "@tschk/moonshine-next": "packages/adapter-next",
    "@tschk/moonshine-react-router": "packages/adapter-react-router",
    "@tschk/moonshine-tanstack": "packages/adapter-tanstack",
    "@tschk/moonshine-waku": "packages/adapter-waku",
    "@tschk/moonshine-framework": "packages/framework",
    "@tschk/moonshine-compiler": "packages/compiler",
    "@tschk/moonshine-cli": "packages/cli",
    "@tschk/moonshine-server": "packages/server",
    "@tschk/moonshine-react": "packages/react",
    "@tschk/moonshine-solid": "packages/adapter-solid",
    "@tschk/crepus-moonshine": "packages/crepus-moonshine",
    "@tschk/moonshine-deploy-bun": "packages/deploy-bun",
    "@tschk/moonshine-deploy-node": "packages/deploy-node",
    "@tschk/moonshine-deploy-cloudflare": "packages/deploy-cloudflare",
    "@tschk/moonshine-deploy-vercel": "packages/deploy-vercel",
  };
  const rel = map[name];
  return rel ? dep(root, rel, version) : undefined;
}

/** Keep transitive local package references off the registry while developing Moonshine. */
export async function localOverrides(
  root: string | null,
): Promise<Record<string, string> | undefined> {
  if (!root) return undefined;
  const overrides: Record<string, string> = {};
  for (const entry of await readdir(join(root, "packages"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, "packages", entry.name);
    const manifestFile = Bun.file(join(directory, "package.json"));
    if (!(await manifestFile.exists())) continue;
    const manifest = (await manifestFile.json()) as { name?: string };
    if (manifest.name) overrides[manifest.name] = `file:${directory}`;
  }
  return overrides;
}

function runtimeForAdapter(adapter: Adapter, renderer?: Renderer): string {
  switch (adapter) {
    case "node":
      return "node";
    case "cloudflare":
      return "cloudflare";
    case "vercel":
      return renderer === "native" ? "node" : "vercel-edge";
    case "bun":
    default:
      return "bun";
  }
}

function parseArgs(args: string[]): {
  name: string;
  renderer?: Renderer;
  adapter: Adapter;
  vite: boolean;
} {
  let name = "";
  let renderer: Renderer | undefined;
  let adapter: Adapter = "bun";
  let vite = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--native") renderer = "native";
    else if (a === "--react") renderer = "react";
    else if (a === "--solid") renderer = "native";
    else if (a === "--crepus") renderer = "crepus";
    else if (a === "--adapter") {
      const next = args[++i];
      if (next && ["bun", "node", "cloudflare", "vercel"].includes(next)) {
        adapter = next as Adapter;
      } else {
        console.error(`Invalid --adapter: ${next}`);
        process.exit(1);
      }
    } else if (a === "--vite") vite = true;
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else if (!name) {
      name = a;
    } else {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    }
  }
  if (!name) {
    console.error(
      "Usage: moonshine new <name> [--native|--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]",
    );
    process.exit(1);
  }
  return { name, renderer: renderer ?? "native", adapter, vite };
}

async function writePackageJson(
  dir: string,
  name: string,
  root: string | null,
  renderer: Renderer | undefined,
  adapter: Adapter,
): Promise<void> {
  const dependencies: Record<string, string> =
    renderer === "native"
      ? {
          "@tschk/moonshine-dom": packagePath(
            "@tschk/moonshine-dom",
            root,
            "^0.4.2",
          )!,
          "@tschk/moonshine-framework": packagePath(
            "@tschk/moonshine-framework",
            root,
            "^0.4.2",
          )!,
          "@tschk/moonshine-server": packagePath(
            "@tschk/moonshine-server",
            root,
            "^0.4.2",
          )!,
        }
      : {
          "@tschk/moonshine": packagePath("@tschk/moonshine", root)!,
          "@tschk/moonshine-framework": packagePath(
            "@tschk/moonshine-framework",
            root,
          )!,
          "@tschk/moonshine-compiler": packagePath(
            "@tschk/moonshine-compiler",
            root,
          )!,
          "@tschk/moonshine-server": packagePath(
            "@tschk/moonshine-server",
            root,
          )!,
        };
  dependencies[`@tschk/moonshine-deploy-${adapter}`] = packagePath(
    `@tschk/moonshine-deploy-${adapter}`,
    root,
    renderer === "native" ? "^0.4.2" : "^0.2.0",
  )!;

  const devDependencies: Record<string, string> = {
    "@types/bun": "^1.3.14",
    typescript: "~7.0.0",
  };

  if (renderer === "native") {
    devDependencies["@tschk/moonshine-cli"] = root
      ? dep(root, "packages/cli")
      : "^0.4.2";
  } else if (renderer === "react") {
    dependencies["@tschk/moonshine-react"] = packagePath(
      "@tschk/moonshine-react",
      root,
    )!;
    dependencies.react = "^19.1.0";
    dependencies["react-dom"] = "^19.1.0";
    devDependencies["@types/react"] = "^19.1.0";
    devDependencies["@types/react-dom"] = "^19.1.0";
  } else if (renderer === "crepus") {
    dependencies["@tschk/crepus-moonshine"] = packagePath(
      "@tschk/crepus-moonshine",
      root,
    )!;
    dependencies["@tschk/moonshine-react"] = packagePath(
      "@tschk/moonshine-react",
      root,
    )!;
    dependencies.react = "^19.1.0";
    dependencies["react-dom"] = "^19.1.0";
    devDependencies["@types/react"] = "^19.1.0";
    devDependencies["@types/react-dom"] = "^19.1.0";
  }

  await writeFile(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          build: "moonshine build",
          dev: "moonshine dev",
          preview: "moonshine preview",
          ...(renderer === "native" && adapter === "node"
            ? { start: "node .moonshine/server.js" }
            : {}),
        },
        dependencies,
        devDependencies,
        ...(renderer === "native" && root
          ? { overrides: await localOverrides(root) }
          : {}),
      },
      null,
      2,
    ) + "\n",
  );
}

async function writeTsconfig(
  dir: string,
  renderer: Renderer | undefined,
): Promise<void> {
  const compilerOptions: Record<string, unknown> = {
    target: "ES2024",
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: "react-jsx",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["bun"],
    lib: ["ES2024", "DOM"],
  };
  if (renderer === "native") delete compilerOptions.jsx;
  await writeFile(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions,
        include: ["src"],
      },
      null,
      2,
    ) + "\n",
  );
}

async function writeConfig(
  dir: string,
  renderer: Renderer | undefined,
  adapter: Adapter,
): Promise<void> {
  const runtime = runtimeForAdapter(adapter, renderer);
  const entries: Record<string, unknown> = { runtime, adapter };
  if (renderer) entries.renderer = renderer;
  if (renderer === "native")
    entries.routes = [
      { id: "home", path: "/", file: "src/routes/home.ts", mode: "ssr" },
      {
        id: "counter",
        path: "/counter",
        file: "src/routes/counter.ts",
        clientFile: "src/client/counter.ts",
        mode: "spa",
      },
    ];
  await writeFile(
    join(dir, "moonshine.config.ts"),
    `import { defineConfig } from "@tschk/moonshine-framework";

export default defineConfig(${JSON.stringify(entries)});
`,
  );
}

async function writeRoute(
  dir: string,
  renderer: Renderer | undefined,
): Promise<void> {
  await mkdir(join(dir, "src", "routes"), { recursive: true });
  if (renderer === "native") {
    await writeNativeRoutes(dir);
  } else if (renderer === "react") {
    await writeFile(
      join(dir, "src", "routes", "index.tsx"),
      `export default function Home({ data }: { data?: unknown }) {
  const d = (data ?? {}) as Record<string, string>;
  return (
    <main data-moonshine-mode={d.mode ?? "default"}>
      <h1>Moonshine</h1>
    </main>
  );
}
`,
    );
  } else if (renderer === "crepus") {
    await writeFile(join(dir, "src", "routes", "index.ts"), "\n");
  } else {
    await writeFile(
      join(dir, "src", "routes", "index.server.ts"),
      `export function loader() {
  return { ok: true };
}
`,
    );
  }
}

async function writeNativeRoutes(dir: string): Promise<void> {
  await mkdir(join(dir, "src/client"), { recursive: true });
  await Promise.all([
    writeFile(
      join(dir, "src/routes/home.ts"),
      `import { h } from "@tschk/moonshine-dom/ssr";

export function loader({ request }: { request: Request }) {
  return { name: new URL(request.url).searchParams.get("name") ?? "world" };
}

export default function Home({ data }: { data: { home: ReturnType<typeof loader> } }) {
  return h("main", null,
    h("h1", null, "hello, ", data.home.name),
    h("a", { href: "/counter" }, "open counter"),
  );
}
`,
    ),
    writeFile(
      join(dir, "src/routes/counter.ts"),
      `export function loader() {
  return { start: 0 };
}
`,
    ),
    writeFile(
      join(dir, "src/client/counter.ts"),
      `import { h } from "@tschk/moonshine-dom/dom";
import { createSignal } from "@tschk/moonshine-dom/reactive";

export default function Counter({ data }: { data: { counter: { start: number } } }) {
  const [count, setCount] = createSignal(data.counter.start);
  return h("main", null,
    h("a", { href: "/" }, "home"),
    h("h1", null, "Moonshine"),
    h("button", { type: "button", onClick: () => setCount(count() + 1) }, () => "count " + count()),
  );
}
`,
    ),
  ]);
}

async function writeReadme(
  dir: string,
  name: string,
  renderer: Renderer | undefined,
  adapter: Adapter,
): Promise<void> {
  const runtime = runtimeForAdapter(adapter, renderer);
  let body = `# ${name}\n\nMoonshine on **${adapter}** (${runtime}).\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n`;
  if (renderer === "native")
    body +=
      "\nThe home page renders on the server. `/counter` mounts the independent DOM runtime.\nServer and browser entries are authored separately; hydration and islands are not supported.\n";
  if (!renderer)
    body += `\nAdd \`--react\` or \`--crepus\` for a legacy UI renderer.\n`;
  await writeFile(join(dir, "README.md"), body);
}

async function writeViteApp(
  dir: string,
  name: string,
  root: string | null,
  renderer: Renderer,
): Promise<void> {
  await mkdir(join(dir, "src"), { recursive: true });

  await Promise.all([
    writeFile(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name,
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "vite build",
            preview: "vite preview",
          },
          ...(renderer === "native" && root
            ? { overrides: await localOverrides(root) }
            : {}),
          dependencies:
            renderer === "native"
              ? {
                  "@tschk/moonshine-dom": packagePath(
                    "@tschk/moonshine-dom",
                    root,
                    "^0.4.2",
                  )!,
                }
              : {
                  "@tschk/moonshine": dep(root, "packages/core"),
                  react: "^19.1.0",
                  "react-dom": "^19.1.0",
                },
          devDependencies: {
            ...(renderer === "react"
              ? {
                  "@types/react": "^19.1.0",
                  "@types/react-dom": "^19.1.0",
                  "@vitejs/plugin-react": "^4.5.0",
                }
              : {}),
            typescript: "~7.0.0",
            vite: "^6.3.5",
          },
        },
        null,
        2,
      ) + "\n",
    ),
    writeFile(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2024",
            module: "ESNext",
            moduleResolution: "Bundler",
            ...(renderer === "react" ? { jsx: "react-jsx" } : {}),
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            types: ["vite/client"],
          },
          include: ["src"],
        },
        null,
        2,
      ) + "\n",
    ),
    writeFile(
      join(dir, "vite.config.ts"),
      renderer === "native"
        ? `import { defineConfig } from "vite";
export default defineConfig({});
`
        : `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    ),
    writeFile(
      join(dir, "index.html"),
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.${renderer === "native" ? "ts" : "tsx"}"></script>
  </body>
</html>
`,
    ),
    writeFile(
      join(dir, renderer === "native" ? "src/main.ts" : "src/main.tsx"),
      renderer === "native"
        ? `import { h, render } from "@tschk/moonshine-dom/dom";
import { createSignal } from "@tschk/moonshine-dom/reactive";

render(() => {
  const [count, setCount] = createSignal(0);
  return h("main", null,
    h("h1", null, "Moonshine"),
    h("button", { type: "button", onClick: () => setCount(count() + 1) }, () => "count " + count()),
  );
}, document.querySelector("#app")!);
`
        : `import { createSignal, useSignal, createApp } from "@tschk/moonshine/react";

const count = createSignal(0);

function App() {
  const n = useSignal(count);
  return (
    <main style={{ fontFamily: "system-ui", padding: 32 }}>
      <h1>${name}</h1>
      <p>count: {n}</p>
      <button type="button" onClick={() => count.set((c) => c + 1)}>
        +1
      </button>
    </main>
  );
}

createApp({ root: App }).mount("#app");
`,
    ),
    writeFile(
      join(dir, "README.md"),
      `# ${name}\n\nVite + Moonshine ${renderer === "native" ? "independent DOM runtime" : "signals"} (client SPA).\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n\nFull-stack Bun (SSR and separate browser entries; no hydration): \`moonshine new app\`.\n`,
    ),
  ]);
}

async function writeBunApp(
  dir: string,
  name: string,
  root: string | null,
  renderer: Renderer | undefined,
  adapter: Adapter,
): Promise<void> {
  await mkdir(join(dir, "src", "routes"), { recursive: true });

  await Promise.all([
    writePackageJson(dir, name, root, renderer, adapter),
    writeTsconfig(dir, renderer),
    writeConfig(dir, renderer, adapter),
    writeRoute(dir, renderer),
    writeReadme(dir, name, renderer, adapter),
  ]);
}

export async function newCommand(args: string[]): Promise<void> {
  const { name, renderer, adapter, vite } = parseArgs(args);
  if (vite && renderer !== "react" && renderer !== "native") {
    console.error("--vite supports --native or --react scaffolds");
    process.exit(1);
  }

  const root = detectMoonshineRoot();
  const dir = resolve(process.cwd(), name);
  if (existsSync(dir)) {
    console.error(`Refusing to overwrite existing directory: ${dir}`);
    process.exit(1);
  }

  await mkdir(dir, { recursive: true });
  if (vite) await writeViteApp(dir, name, root, renderer!);
  else await writeBunApp(dir, name, root, renderer, adapter);

  console.log(`Created ${name}/ (${vite ? "vite" : adapter})`);
  if (root) console.log(`Linked moonshine from ${root}`);
  console.log(`\n  cd ${name} && bun install && bun run dev\n`);
}
