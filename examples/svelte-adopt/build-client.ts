import { sveltePlugin } from "./src/svelte-plugin";

const result = await Bun.build({
  entrypoints: ["./src/client.ts"],
  outdir: "./public",
  target: "browser",
  format: "esm",
  naming: "client.js",
  conditions: ["browser"],
  plugins: [sveltePlugin("client") as never],
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
console.log("client bundle ok");
