import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildCommand } from "../src/build";
import { inspectCommand } from "../src/inspect";
import { newCommand } from "../src/new";
import { startPreview } from "../src/preview";

const tmp = join(import.meta.dir, ".tmp-cli-workflow");
const project = join(tmp, "workflow");

function clean() {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

beforeAll(clean);
afterAll(clean);

function captureStdout(): { output: string[]; restore: () => void } {
  const output: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ..._rest: unknown[]
  ): boolean => {
    output.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  };
  return {
    output,
    restore: () => {
      process.stdout.write = original;
    },
  };
}

describe("moonshine workflow", () => {
  test("scaffolds, builds, inspects, previews, and stops cleanly", async () => {
    const prev = process.cwd();
    try {
      await Bun.write(join(tmp, ".keep"), "");
      process.chdir(tmp);
      await newCommand(["workflow", "--react", "--adapter", "bun"]);

      process.chdir(project);
      await buildCommand([]);

      const { output, restore } = captureStdout();
      try {
        await inspectCommand([]);
      } finally {
        restore();
      }
      const inspection = output.join("");
      expect(inspection).toContain("static");
      expect(inspection).toContain("/");
      expect(inspection).toContain("deterministic build-time route");

      const preview = await startPreview({ projectDir: project, port: 0 });
      const res = await fetch(new Request(new URL("/", preview.url).href));
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("data-moonshine-mode");

      await preview.stop();
      expect(true).toBe(true);
    } finally {
      process.chdir(prev);
      clean();
    }
  });
});
