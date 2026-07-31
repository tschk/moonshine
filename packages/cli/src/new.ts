import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function detectMoonshineRoot(): string | null {
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

type Stack = "bun" | "vite";

function parseArgs(args: string[]): { name: string; stack: Stack } {
  let stack: Stack = "bun";
  const positional: string[] = [];
  for (const a of args) {
    if (a === "--bun") stack = "bun";
    else if (a === "--vite") stack = "vite";
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      console.error("Usage: moonshine new <name> [--bun|--vite]");
      process.exit(1);
    } else positional.push(a);
  }
  const name = positional[0];
  if (!name) {
    console.error("Usage: moonshine new <name> [--bun|--vite]");
    console.error("  --bun   full-stack Bun server + hydrate (default)");
    console.error("  --vite  client-only Vite SPA");
    process.exit(1);
  }
  return { name, stack };
}

function dep(root: string | null, rel: string, version = "^0.2.0"): string {
  return root ? `file:${join(root, rel)}` : version;
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
    `# ${name}

Vite + moonshine signals (client SPA).

\`\`\`bash
bun install
bun run dev
\`\`\`

Full-stack Bun (server + static + hydrate): \`moonshine new app --bun\`.
`,
  );
}

function writeBunApp(dir: string, name: string, root: string | null): void {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "public"), { recursive: true });

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          "build:client":
            "bun build ./src/client.tsx --outdir=public --target=browser --format=esm --minify",
          dev: "bun run build:client && bun run --watch src/server.ts",
          start: "bun run build:client && bun run src/server.ts",
        },
        dependencies: {
          "@tschk/moonshine": dep(root, "packages/core"),
          react: "^19.1.0",
          "react-dom": "^19.1.0",
        },
        devDependencies: {
          "@types/bun": "^1.3.14",
          "@types/react": "^19.1.0",
          "@types/react-dom": "^19.1.0",
          typescript: "~7.0.0",
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
          types: ["bun"],
          lib: ["ES2024", "DOM"],
        },
        include: ["src"],
      },
      null,
      2,
    ) + "\n",
  );

  writeFileSync(
    join(dir, "src/server.ts"),
    `import { join } from "node:path";
import {
  createMoonshineServer,
  definePage,
  type MoonshineRequest,
} from "@tschk/moonshine/server";

const publicDir = join(import.meta.dir, "..", "public");

function shell(body: string, title = ${JSON.stringify(name)}): string {
  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>\${title}</title>
  <link rel="stylesheet" href="/app.css" />
</head>
<body>
\${body}
</body>
</html>\`;
}

const server = createMoonshineServer({
  port: Number(process.env.PORT) || 3000,
  staticDir: publicDir,
  pages: {
    "/": definePage({
      render: () =>
        shell(\`
  <main>
    <h1>${name}</h1>
    <p>Bun-native moonshine: pages + static + hydrate island.</p>
    <ul>
      <li><a href="/about">about</a></li>
      <li><a href="/api/hello">api/hello</a></li>
    </ul>
    <div id="counter"><p class="muted">loading…</p></div>
    <script type="module" src="/client.js"></script>
  </main>
\`),
    }),
    "/about": definePage({
      render: () =>
        shell(
          \`
  <main>
    <h1>about</h1>
    <p><code>createMoonshineServer</code> → <code>Bun.serve</code>. No metaframework.</p>
    <p><a href="/">home</a></p>
  </main>
\`,
          "about",
        ),
    }),
    "/api/hello": definePage({
      render: (req: MoonshineRequest) => ({
        ok: true,
        path: req.pathname,
        method: req.method,
      }),
    }),
  },
  notFound: (req) =>
    new Response(
      shell(
        \`<main><h1>404</h1><p>\${req.pathname}</p><p><a href="/">home</a></p></main>\`,
        "404",
      ),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    ),
});

const handle = server.listen() as { port?: number } | undefined;
console.log(\`${name} → http://localhost:\${handle?.port ?? server.port}\`);
`,
  );

  writeFileSync(
    join(dir, "src/client.tsx"),
    `import { createApp, createSignal, useSignal } from "@tschk/moonshine/react";

const count = createSignal(0);

function Counter() {
  const n = useSignal(count);
  return (
    <div className="card">
      <p>
        count: <strong>{n}</strong>
      </p>
      <button type="button" onClick={() => count.set((c) => c + 1)}>
        +1
      </button>
      <button type="button" onClick={() => count.set(0)}>
        reset
      </button>
    </div>
  );
}

createApp({ root: Counter }).mount("#counter");
`,
  );

  writeFileSync(
    join(dir, "public/app.css"),
    `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
body { margin: 0; }
main { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
a { color: #358ff3; }
code {
  background: color-mix(in srgb, CanvasText 12%, transparent);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.card {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-top: 1.25rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
  border-radius: 10px;
}
.card p { margin: 0; flex: 1 1 100%; }
button {
  font: inherit;
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
  background: Canvas;
  cursor: pointer;
}
.muted { color: color-mix(in srgb, CanvasText 55%, transparent); }
`,
  );

  writeFileSync(
    join(dir, "README.md"),
    `# ${name}

Full-stack moonshine on **Bun** (no Next/Vite host).

| Piece | Path |
|-------|------|
| HTTP + pages | \`src/server.ts\` |
| Static CSS | \`public/app.css\` |
| Hydrate island | \`src/client.tsx\` → \`public/client.js\` |

\`\`\`bash
bun install
bun run dev
# → http://localhost:3000
\`\`\`

Client-only SPA: \`moonshine new app --vite\`.
`,
  );
}

export async function newCommand(args: string[]): Promise<void> {
  const { name, stack } = parseArgs(args);
  const root = detectMoonshineRoot();
  const dir = resolve(process.cwd(), name);
  if (existsSync(dir)) {
    console.error(`Refusing to overwrite existing directory: ${dir}`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  if (stack === "vite") writeViteApp(dir, name, root);
  else writeBunApp(dir, name, root);

  console.log(`Created ${name}/ (${stack})`);
  if (root) console.log(`Linked moonshine from ${root}`);
  console.log(`\n  cd ${name} && bun install && bun run dev\n`);
}
