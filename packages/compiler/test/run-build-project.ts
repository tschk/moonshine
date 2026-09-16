#!/usr/bin/env bun
import { buildProject, type BuildOptions } from "../src/manifest";

const options = (await new Response(Bun.stdin).json()) as BuildOptions;
await buildProject(options);
