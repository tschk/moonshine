#!/usr/bin/env bun
import { adoptCommand } from "../src/adopt";
import { buildCommand } from "../src/build";
import { compileCommand } from "../src/compile";
import { devCommand } from "../src/dev";
import { inspectCommand } from "../src/inspect";
import { newCommand } from "../src/new";
import { previewCommand } from "../src/preview";

const [cmd, ...args] = Bun.argv.slice(2);

function usage(code = 0): never {
  console.error(`moonshine — Bun-first hyperminimal UI runtime

Usage:
  moonshine new <name> [--react|--solid|--crepus] [--adapter bun|node|cloudflare|vercel] [--vite]
      --react     add React renderer
      --solid     add Solid renderer
      --crepus    add Crepus renderer
      --adapter   deployment target (default: bun)
      --vite      client-only Vite SPA
  moonshine adopt [dir]          Convert an existing Next/React app to moonshine
      --dry-run   print the plan, write nothing
      --force     rewrite an existing moonshine.config.ts
  moonshine compile [file]       .crepus / View IR JSON → .tsx
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
  case "new":
    await newCommand(args);
    break;
  case "adopt":
    await adoptCommand(args);
    break;
  case "compile":
    await compileCommand(args);
    break;
  case "build":
    await buildCommand(args);
    break;
  case "inspect":
    await inspectCommand(args);
    break;
  case "preview":
    await previewCommand(args);
    break;
  case "dev":
    await devCommand(args);
    break;
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
