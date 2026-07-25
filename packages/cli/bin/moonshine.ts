#!/usr/bin/env bun
import { buildCommand } from "../src/build";
import { compileCommand } from "../src/compile";
import { devCommand } from "../src/dev";
import { newCommand } from "../src/new";

const [cmd, ...args] = Bun.argv.slice(2);

function usage(code = 0): never {
  console.error(`moonshine — Bun-first hyperminimal UI

Usage:
  moonshine new <name>           Scaffold a Vite + React TSX app
  moonshine compile [file]       .crepus / View IR JSON → .tsx
  moonshine dev                  Run vite (bunx)
  moonshine build                Build with vite (bunx)
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
  case "dev":
    await devCommand(args);
    break;
  case "build":
    await buildCommand(args);
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
