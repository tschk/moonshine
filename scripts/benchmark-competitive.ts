import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

type SizeRow = {
  name: string;
  bytes: number;
  note: string;
};

type LatencyRow = {
  name: string;
  p50: number;
  p95: number;
  note: string;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx]!;
}

async function bundleSize(
  entry: string,
  outDir: string,
  external: string[] = [],
  root?: string,
): Promise<number> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: outDir,
    minify: true,
    format: "esm",
    target: "browser",
    splitting: false,
    external,
    ...(root ? { root } : {}),
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`bundle failed: ${entry}`);
  }
  let bytes = 0;
  for (const output of result.outputs) {
    if (output.path.endsWith(".js")) {
      bytes += (await Bun.file(output.path).arrayBuffer()).byteLength;
    }
  }
  return bytes;
}

async function measureMoonshineCore(): Promise<SizeRow> {
  const scratch = await mkdtemp(join(tmpdir(), "ms-core-"));
  try {
    const entry = resolve(
      import.meta.dir,
      "..",
      "packages",
      "core",
      "src",
      "index.ts",
    );
    const bytes = await bundleSize(entry, scratch);
    return {
      name: "Moonshine kernel (signals only)",
      bytes,
      note: "packages/core/src/index.ts, minified ESM, browser target",
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function measureReactClient(): Promise<SizeRow> {
  const repoRoot = resolve(import.meta.dir, "..");
  const scratch = join(repoRoot, ".bench-react");
  await mkdir(scratch, { recursive: true });
  try {
    const entry = join(scratch, "entry.tsx");
    await writeFile(
      entry,
      `import { useState } from "react";\nimport { createRoot } from "react-dom/client";\nfunction App() { const [n] = useState(0); return <div>{n}</div>; }\ncreateRoot(document.body).render(<App/>);\n`,
    );
    const outDir = join(scratch, "out");
    await mkdir(outDir, { recursive: true });
    const bytes = await bundleSize(entry, outDir, [], repoRoot);
    return {
      name: "React 19 + react-dom client (tiny fixture)",
      bytes,
      note: "react@19.1.0 + react-dom@19.1.0, minified ESM, browser target, bundled",
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function measureSolidClient(): Promise<SizeRow> {
  const repoRoot = resolve(import.meta.dir, "..");
  const scratch = join(repoRoot, ".bench-solid");
  await mkdir(scratch, { recursive: true });
  try {
    const entry = join(scratch, "entry.tsx");
    await writeFile(
      entry,
      `import { createSignal } from "solid-js";\nimport { render } from "solid-js/web";\nfunction App() { const [n] = createSignal(0); return <div>{n()}</div>; }\nrender(() => <App/>, document.body);\n`,
    );
    const outDir = join(scratch, "out");
    await mkdir(outDir, { recursive: true });
    const bytes = await bundleSize(entry, outDir, [], repoRoot);
    return {
      name: "Solid 1.9 client (tiny fixture)",
      bytes,
      note: "solid-js@1.9.14 + solid-js/web, minified ESM, browser target, bundled",
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function measureMoonshineIslandClient(): Promise<SizeRow> {
  const repoRoot = resolve(import.meta.dir, "..");
  const scratch = await mkdir(join(repoRoot, ".bench-island"), {
    recursive: true,
  }).then(() => join(repoRoot, ".bench-island"));
  try {
    const entry = join(scratch, "entry.tsx");
    await writeFile(
      entry,
      `import { createSignal } from "@tschk/moonshine";\nimport { useSignal } from "@tschk/moonshine/react";\nfunction Counter() { const n = useSignal(createSignal(0)); return <div>{n}</div>; }\n`,
    );
    const outDir = join(scratch, "out");
    await mkdir(outDir, { recursive: true });
    const bytes = await bundleSize(
      entry,
      outDir,
      ["react", "react-dom"],
      repoRoot,
    );
    return {
      name: "Moonshine island (signals + react bridge, react external)",
      bytes,
      note: "island fixture using @tschk/moonshine + react bridge; react/react-dom external; built inside repo so workspace resolves",
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function measureBareBunBaseline(runs: number): Promise<LatencyRow> {
  const samples: number[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      new Response("ok", { headers: { "content-type": "text/plain" } }),
  });
  const url = `http://localhost:${server.port}/`;
  for (let i = 0; i < runs + 5; i++) {
    const t = performance.now();
    await fetch(url);
    samples.push(performance.now() - t);
  }
  server.stop(true);
  samples.splice(0, 5);
  return {
    name: "Bare Bun.serve text response",
    p50: median(samples),
    p95: percentile(samples, 95),
    note: `${runs} runs, warmup 5, localhost, single-process`,
  };
}

async function measureMoonshineStaticRequest(
  runs: number,
): Promise<LatencyRow> {
  const { createRequestHandler } = await import("@tschk/moonshine-server");
  const { reactRenderer } = await import("@tschk/moonshine-react");
  const { createRouteGraph } = await import("@tschk/moonshine-router");
  const handler = createRequestHandler({
    routes: [{ id: "home", path: "/", file: "x.tsx" }],
    renderer: reactRenderer,
    modules: {
      "x.tsx": {
        loader: async () => ({ title: "Home" }),
      },
    },
  });
  const server = Bun.serve({ port: 0, fetch: handler });
  const url = `http://localhost:${server.port}/`;
  const samples: number[] = [];
  for (let i = 0; i < runs + 5; i++) {
    const t = performance.now();
    await fetch(url);
    samples.push(performance.now() - t);
  }
  server.stop(true);
  samples.splice(0, 5);
  return {
    name: "Moonshine static route (loader + reactRenderer prerender)",
    p50: median(samples),
    p95: percentile(samples, 95),
    note: `${runs} runs, warmup 5, localhost, single-process`,
  };
}

async function measureMoonshineSsrRequest(runs: number): Promise<LatencyRow> {
  const { createRequestHandler } = await import("@tschk/moonshine-server");
  const { reactRenderer } = await import("@tschk/moonshine-react");
  const handler = createRequestHandler({
    routes: [{ id: "ssr", path: "/ssr", file: "x.tsx" }],
    renderer: reactRenderer,
    modules: {
      "x.tsx": {
        loader: async (ctx) => ({ id: ctx.params.id ?? "x" }),
      },
    },
  });
  const server = Bun.serve({ port: 0, fetch: handler });
  const url = `http://localhost:${server.port}/ssr`;
  const samples: number[] = [];
  for (let i = 0; i < runs + 5; i++) {
    const t = performance.now();
    await fetch(url);
    samples.push(performance.now() - t);
  }
  server.stop(true);
  samples.splice(0, 5);
  return {
    name: "Moonshine SSR route (loader + stream render)",
    p50: median(samples),
    p95: percentile(samples, 95),
    note: `${runs} runs, warmup 5, localhost, single-process`,
  };
}

async function main(): Promise<void> {
  const runs = 50;
  const sizeRows: SizeRow[] = [];
  sizeRows.push(await measureMoonshineCore());
  sizeRows.push(await measureMoonshineIslandClient());
  sizeRows.push(await measureReactClient());
  sizeRows.push(await measureSolidClient());

  const latencyRows: LatencyRow[] = [];
  latencyRows.push(await measureBareBunBaseline(runs));
  latencyRows.push(await measureMoonshineStaticRequest(runs));
  latencyRows.push(await measureMoonshineSsrRequest(runs));

  const env = [
    `bun: ${process.versions.bun ?? "unknown"}`,
    `os: ${process.platform} ${process.arch}`,
    `date: ${new Date().toISOString()}`,
    `runs per latency measurement: ${runs} (warmup 5, median + p95)`,
  ];

  const sizeHeader = "| bundle | bytes | KiB | note |";
  const sizeSep = "|--------|------:|----:|------|";
  const sizeLines = [sizeHeader, sizeSep];
  for (const row of sizeRows) {
    sizeLines.push(
      `| ${row.name} | ${row.bytes} | ${(row.bytes / 1024).toFixed(2)} | ${row.note} |`,
    );
  }

  const latHeader = "| handler | p50 (ms) | p95 (ms) | note |";
  const latSep = "|---------|---------:|---------:|------|";
  const latLines = [latHeader, latSep];
  for (const row of latencyRows) {
    latLines.push(
      `| ${row.name} | ${row.p50.toFixed(3)} | ${row.p95.toFixed(3)} | ${row.note} |`,
    );
  }

  const out = resolve(
    import.meta.dir,
    "..",
    "docs",
    "audits",
    "competitive-benchmarks.md",
  );
  await mkdir(dirname(out), { recursive: true });

  const body = `# Competitive size and speed benchmarks

Measured locally on the development host. Numbers are reproducible by running
\`bun scripts/benchmark-competitive.ts\`.

## Environment

${env.map((line) => `- ${line}`).join("\n")}

## Bundle size (minified ESM, browser target)

${sizeLines.join("\n")}

## Request latency (localhost, single process, Bun.serve)

${latLines.join("\n")}

## Methodology

- Bundle size: each fixture is built with \`Bun.build({ minify: true, format: "esm", target: "browser" })\` and the emitted \`.js\` bytes are summed. Externalized deps (e.g. \`react\`, \`react-dom\`) are not counted toward the bundle that ships to the browser for the island fixture; for the React and Solid fixtures all deps are bundled so the comparison reflects what a tiny client app would ship.
- Request latency: each handler runs under \`Bun.serve({ port: 0 })\` on localhost. After a 5-request warmup, \`fetch\` round-trip time is recorded for ${runs} runs. p50 and p95 are reported.
- The bare Bun.serve baseline is the floor: a single \`new Response("ok")\` with no framework code on the hot path.

## What this does NOT prove

- These numbers do not compare full applications across Astro / Next.js / SvelteKit / Waku / SolidStart. Those frameworks are not installed in this workspace and were not measured here. Cross-framework apples-to-apples comparisons would require equivalent fixtures and the same Bun runtime, which is out of scope for this script.
- The React and Solid "tiny fixture" sizes reflect a minimal client app, not a full site. They are included as reference points for what each renderer adds on top of the Moonshine kernel when you opt in.
- Server latency is measured in a single process on localhost and excludes network and TLS overhead. Production numbers will differ.
- No claim is made about throughput under concurrent load; this is a cold-path latency snapshot.

## Source

- \`scripts/benchmark-competitive.ts\` — this script.
- \`scripts/check-size.ts\` — kernel budget gate (12 KiB).
- \`scripts/benchmark.ts\` — internal discovery / classify / build / startup benchmarks.
`;

  await writeFile(out, body);
  console.log(`Competitive benchmarks written to ${out}`);
  console.log("\nSize:");
  for (const row of sizeRows) {
    console.log(
      `  ${row.name}: ${row.bytes} bytes (${(row.bytes / 1024).toFixed(2)} KiB)`,
    );
  }
  console.log("\nLatency:");
  for (const row of latencyRows) {
    console.log(
      `  ${row.name}: p50 ${row.p50.toFixed(3)} ms, p95 ${row.p95.toFixed(3)} ms`,
    );
  }
}

await main();
