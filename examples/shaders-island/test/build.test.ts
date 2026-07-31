import { describe, expect, test } from "bun:test";
import { join } from "node:path";

describe("shaders-island", () => {
  test("client builds", async () => {
    const cwd = join(import.meta.dir, "..");
    const proc = Bun.spawn(
      [
        "bun",
        "build",
        "./src/client.tsx",
        "--outdir=public",
        "--target=browser",
        "--format=esm",
      ],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );
    expect(await proc.exited).toBe(0);
    const js = Bun.file(join(cwd, "public/client.js"));
    expect(await js.exists()).toBe(true);
    const text = await js.text();
    expect(text.length).toBeGreaterThan(200);
  });
});
