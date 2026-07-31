import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function detectMoonshineRoot(): string | null {
  if (process.env.MOONSHINE_PATH) return resolve(process.env.MOONSHINE_PATH);
  // Walk up from cwd for monorepo root (has packages/core + packages/cli)
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

export async function newCommand(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("Usage: moonshine new <name>");
    process.exit(1);
  }

  const root = detectMoonshineRoot();
  const dir = resolve(process.cwd(), name);
  if (existsSync(dir)) {
    console.error(`Refusing to overwrite existing directory: ${dir}`);
    process.exit(1);
  }

  mkdirSync(join(dir, "src"), { recursive: true });

  const moonshineDep = root
    ? `file:${join(root, "packages/core")}`
    : "^0.2.0";
  const crepusDep = root
    ? `file:${join(root, "packages/crepus-moonshine")}`
    : "^0.2.0";
  const componentsDep = root
    ? `file:${join(root, "components")}`
    : "^0.2.0";

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
          "@tschk/moonshine": moonshineDep,
          "@tschk/crepus-moonshine": crepusDep,
          "@tschk/moonshine-components": componentsDep,
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
      <h1>moonshine</h1>
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

Greenfield moonshine app (Vite + signals). No Next/metaframework.

\`\`\`bash
bun install
bun run dev
\`\`\`

HTTP without a host framework: see monorepo \`examples/bun-server\`.
`,
  );

  console.log(`Created ${name}/`);
  if (root) {
    console.log(`Linked moonshine from ${root}`);
  }
  console.log(`\n  cd ${name} && bun install && bun run dev\n`);
}
