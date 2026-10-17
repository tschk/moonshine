#!/usr/bin/env bun
// oxlint-disable-next-line unicorn/require-module-specifiers -- Top-level await requires an explicit module.
export {};

const [cmd, ...args] = Bun.argv.slice(2);

function usage(code = 0): never {
  console.error(`moonshine — Bun-first hyperminimal UI runtime

Usage:
  moonshine new <name> [--native|--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]
      --native    independent runtime (default; server uses Bun)
      --react     add React renderer
      --solid     alias for the independent native app
      --crepus    add Crepus renderer
      --adapter   deployment target (default: bun)
      --vite      client-only Vite SPA (native or --react)
  moonshine adopt [dir]          Convert the app you are standing in to moonshine
      --dry-run   print the plan, write nothing
      --yes, -y   skip the confirmation prompt
      --force     rewrite an existing moonshine.config.ts
      --compiler <path>   Crepus compiler for native template adoption
  moonshine compile <source>     Crepus frontend → independent .dom.ts
      --ssr       emit .ssr.ts instead
      --react     explicit legacy React output (.tsx); accepts JSON IR
      --compiler <path>   Crepus compiler (default: crepus on PATH)
      --site <root>       source root for imports outside the entry directory
  moonshine build [dir]          Build project into .moonshine/manifest.json
      --adapter bun|node|cloudflare|vercel
  moonshine inspect [path]       Inspect build manifest
      --json  print manifest JSON unchanged
  moonshine preview [dir]        Run built manifest on port 0
      --port <n>
  moonshine dev [dir]            Build and preview with watch
      --vite  run vite (bunx) instead
`);
  process.exit(code);
}

switch (cmd) {
  case "new": {
    const { newCommand } = await import("../src/new");
    await newCommand(args);
    break;
  }
  case "adopt": {
    const { adoptCommand } = await import("../src/adopt");
    const result = await adoptCommand(args);
    if (result.code !== 0) process.exit(result.code);
    break;
  }
  case "compile": {
    const { compileCommand } = await import("../src/compile");
    await compileCommand(args);
    break;
  }
  case "build": {
    const { buildCommand } = await import("../src/build");
    await buildCommand(args);
    break;
  }
  case "inspect": {
    const { inspectCommand } = await import("../src/inspect");
    await inspectCommand(args);
    break;
  }
  case "preview": {
    const { previewCommand } = await import("../src/preview");
    await previewCommand(args);
    break;
  }
  case "dev": {
    const { devCommand } = await import("../src/dev");
    await devCommand(args);
    break;
  }
  case "-h":
  case "--help":
  case "help":
    usage(0);
    break;
  case undefined:
    usage(1);
    break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    usage(1);
}
