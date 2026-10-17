import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Solid bridge unsubscribes once when its owner is disposed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "moonshine-solid-bridge-"));
  try {
    const entry = join(dir, "fixture.ts");
    await Bun.write(
      entry,
      `
              import { createRoot } from ${JSON.stringify(resolve(import.meta.dir, "../../dom/src/reactive.ts"))};
              import { fromMoonshineSignal } from ${JSON.stringify(resolve(import.meta.dir, "../src/index.ts"))};
              let value = 1;
              let subscriptions = 0;
              let unsubscriptions = 0;
              let reads = 0;
              const listeners = new Set();
              const source = Object.assign(() => { reads++; return value; }, {
                subscribe(listener) { subscriptions++; listeners.add(listener); return () => { unsubscriptions++; listeners.delete(listener); }; },
                set(next) { value = typeof next === "function" ? next(value) : next; for (const listener of listeners) listener(); }
              });
              let dispose, get, set;
              createRoot(stop => { dispose = stop; [get, set] = fromMoonshineSignal(source); });
              if (subscriptions !== 1) throw Error("effect did not subscribe");
              source.set(2);
              if (get() !== 2) throw Error("bridge did not update");
              dispose(); dispose();
              if (unsubscriptions !== 1 || listeners.size !== 0) throw Error("subscription leaked or disposed twice");
              const before = reads;
              source.set(3);
              if (reads !== before || get() !== 2) throw Error("disposed bridge still updated");
              if (set(4) !== 4 || value !== 4 || get() !== 2) throw Error("disposed bridge setter contract");
              console.log("bridge disposed");
            `,
    );
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
    });
    expect(result.success, result.logs.join("\n")).toBe(true);
    const file = join(dir, "fixture.js");
    await Bun.write(file, result.outputs[0]!);
    const child = Bun.spawn([process.execPath, file], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, stderr).toBe(0);
    expect(stdout).toContain("bridge disposed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
