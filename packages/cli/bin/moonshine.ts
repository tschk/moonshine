#!/usr/bin/env bun
import { buildCommand } from "../src/build";
import { compileCommand } from "../src/compile";
import { devCommand } from "../src/dev";
import { inspectCommand } from "../src/inspect";
import { newCommand } from "../src/new";

const [cmd, ...args] = Bun.argv.slice(2);

function usage(code = 0): never {
  console.error(`moonshine — Bun-first hyperminimal UI runtime

Usage:
  moonshine new <name> [--bun|--vite]
      --bun   full-stack Bun server + static + hydrate (default)
      --vite  client-only Vite SPA
  moonshine compile [file]       .crepus / View IR JSON → .tsx
  moonshine build [dir]          Build project into .moonshine/manifest.json
  moonshine inspect [path]       Inspect build manifest
      --json  print manifest JSON unchanged
  moonshine dev                  Run vite (bunx) — SPA apps
`);
  process.exit(code);
}

switch (cmd) {
  case "new":
    await newCommand(args);
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
