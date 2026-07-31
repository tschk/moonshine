#!/usr/bin/env bun
/**
 * Builds a fixture in its own process and prints the bundle.
 *
 * Bun registers build plugins globally, so two alias plugins loaded into one
 * test process corrupt each other's module resolution. Each build gets a fresh
 * process instead.
 *
 * Usage: bun test/build-fixture.ts <plugin-export> <fixture>
 */
const [pluginName, fixture] = process.argv.slice(2);
const aliases = (await import("../src/aliases")) as Record<string, unknown>;
const plugin = aliases[pluginName!] as () => import("bun").BunPlugin;

const built = await Bun.build({
  entrypoints: [new URL(fixture!, import.meta.url).pathname],
  plugins: [plugin()],
  target: "browser",
  external: ["react", "react-dom"],
});

if (!built.success) {
  console.error(built.logs.join("\n"));
  process.exit(1);
}
process.stdout.write(await built.outputs[0]!.text());
