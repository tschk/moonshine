import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

type Renderer = "react" | "solid" | "crepus";
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
    "@tschk/moonshine-next": "packages/adapter-next",
    "@tschk/moonshine-react-router": "packages/adapter-react-router",
    "@tschk/moonshine-tanstack": "packages/adapter-tanstack",
    "@tschk/moonshine-waku": "packages/adapter-waku",
    "@tschk/moonshine-framework": "packages/framework",
    "@tschk/moonshine-compiler": "packages/compiler",
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

function runtimeForAdapter(adapter: Adapter): string {
  switch (adapter) {
    case "node":
      return "node";
    case "cloudflare":
      return "cloudflare";
    case "vercel":
      return "vercel-edge";
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
    if (a === "--react") renderer = "react";
    else if (a === "--solid") renderer = "solid";
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
      "Usage: moonshine new <name> [--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]",
    );
    process.exit(1);
  }
  return { name, renderer, adapter, vite };
}

function writePackageJson(
  dir: string,
  name: string,
  root: string | null,
  renderer: Renderer | undefined,
  adapter: Adapter,
): void {
  const dependencies: Record<string, string> = {
    "@tschk/moonshine": packagePath("@tschk/moonshine", root)!,
    "@tschk/moonshine-framework": packagePath(
      "@tschk/moonshine-framework",
      root,
    )!,
    "@tschk/moonshine-compiler": packagePath(
      "@tschk/moonshine-compiler",
      root,
    )!,
    "@tschk/moonshine-server": packagePath("@tschk/moonshine-server", root)!,
  };
  dependencies[`@tschk/moonshine-deploy-${adapter}`] = packagePath(
    `@tschk/moonshine-deploy-${adapter}`,
    root,
  )!;

  const devDependencies: Record<string, string> = {
    "@types/bun": "^1.3.14",
    typescript: "~7.0.0",
  };

  if (renderer === "react") {
    dependencies["@tschk/moonshine-react"] = packagePath(
      "@tschk/moonshine-react",
      root,
    )!;
    dependencies.react = "^19.1.0";
    dependencies["react-dom"] = "^19.1.0";
    devDependencies["@types/react"] = "^19.1.0";
    devDependencies["@types/react-dom"] = "^19.1.0";
  } else if (renderer === "solid") {
    dependencies["@tschk/moonshine-solid"] = packagePath(
      "@tschk/moonshine-solid",
      root,
    )!;
    dependencies["solid-js"] = "^1.9.14";
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

  writeFileSync(
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
        },
        dependencies,
        devDependencies,
      },
      null,
      2,
    ) + "\n",
  );
}

function writeTsconfig(dir: string, renderer: Renderer | undefined): void {
  const compilerOptions: Record<string, unknown> = {
    target: "ES2024",
    module: "ESNext",
    moduleResolution: "Bundler",
    jsx: renderer === "solid" ? "preserve" : "react-jsx",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: ["bun"],
    lib: ["ES2024", "DOM"],
  };
  if (renderer === "solid") {
    compilerOptions.jsxImportSource = "solid-js";
  }
  writeFileSync(
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

function writeConfig(
  dir: string,
  renderer: Renderer | undefined,
  adapter: Adapter,
): void {
  const runtime = runtimeForAdapter(adapter);
  const entries: Record<string, unknown> = { runtime, adapter };
  if (renderer) entries.renderer = renderer;
  writeFileSync(
    join(dir, "moonshine.config.ts"),
    `import { defineConfig } from "@tschk/moonshine-framework";

export default defineConfig(${JSON.stringify(entries)});
`,
  );
}

function writeRoute(dir: string, renderer: Renderer | undefined): void {
  mkdirSync(join(dir, "src", "routes"), { recursive: true });
  if (renderer === "react") {
    writeFileSync(
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
  } else if (renderer === "solid") {
    writeFileSync(
      join(dir, "src", "routes", "index.ts"),
      `import h from "@tschk/moonshine-solid/h";

export default function Home({ data }: { data?: unknown }) {
  const d = (data ?? {}) as Record<string, string>;
  return h(
    "main",
    { "data-moonshine-mode": d.mode ?? "default" },
    h("h1", null, "Moonshine"),
  );
}
`,
    );
  } else if (renderer === "crepus") {
    writeFileSync(join(dir, "src", "routes", "index.ts"), "\n");
  } else {
    writeFileSync(
      join(dir, "src", "routes", "index.server.ts"),
      `export function loader() {
  return { ok: true };
}
`,
    );
  }
}

function writeReadme(
  dir: string,
  name: string,
  renderer: Renderer | undefined,
  adapter: Adapter,
): void {
  const runtime = runtimeForAdapter(adapter);
  let body = `# ${name}\n\nMoonshine on **${adapter}** (${runtime}).\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n`;
  if (!renderer)
    body += `\nAdd \`--react\`, \`--solid\`, or \`--crepus\` for a UI renderer.\n`;
  writeFileSync(join(dir, "README.md"), body);
}

function writeViteApp(dir: string, name: string, root: string | null): void {
  mkdirSync(join(dir, "src"), { recursive: true });

  writeFileSync(
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
        dependencies: {
          "@tschk/moonshine": dep(root, "packages/core"),
          react: "^19.1.0",
          "react-dom": "^19.1.0",
        },
        devDependencies: {
          "@types/react": "^19.1.0",
          "@types/react-dom": "^19.1.0",
          "@vitejs/plugin-react": "^4.5.0",
          typescript: "~7.0.0",
          vite: "^6.3.5",
        },
      },
      null,
      2,
    ) + "\n",
  );

  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
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
  );

  writeFileSync(
    join(dir, "vite.config.ts"),
    `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
  );

  writeFileSync(
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
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  );

  writeFileSync(
    join(dir, "src/main.tsx"),
    `import { createSignal, useSignal, createApp } from "@tschk/moonshine/react";

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
  );

  writeFileSync(
    join(dir, "README.md"),
    `# ${name}\n\nVite + moonshine signals (client SPA).\n\n\`\`\`bash\nbun install\nbun run dev\n\`\`\`\n\nFull-stack Bun (server + static + hydrate): \`moonshine new app --bun\`.\n`,
  );
}

function writeBunApp(
  dir: string,
  name: string,
  root: string | null,
  renderer: Renderer | undefined,
  adapter: Adapter,
): void {
  mkdirSync(join(dir, "src", "routes"), { recursive: true });

  writePackageJson(dir, name, root, renderer, adapter);
  writeTsconfig(dir, renderer);
  writeConfig(dir, renderer, adapter);
  writeRoute(dir, renderer);
  writeReadme(dir, name, renderer, adapter);
}

export async function newCommand(args: string[]): Promise<void> {
  const { name, renderer, adapter, vite } = parseArgs(args);
  if (vite && (renderer === "solid" || renderer === "crepus")) {
    console.error("--vite only supports React scaffolds");
    process.exit(1);
  }
  const root = detectMoonshineRoot();
  const dir = resolve(process.cwd(), name);
  if (existsSync(dir)) {
    console.error(`Refusing to overwrite existing directory: ${dir}`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  if (vite) writeViteApp(dir, name, root);
  else writeBunApp(dir, name, root, renderer, adapter);

  console.log(`Created ${name}/ (${vite ? "vite" : adapter})`);
  if (root) console.log(`Linked moonshine from ${root}`);
  console.log(`\n  cd ${name} && bun install && bun run dev\n`);
}
