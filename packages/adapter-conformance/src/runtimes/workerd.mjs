// Runs a built Cloudflare Worker artifact in workerd through Miniflare, as
// configured by the wrangler.jsonc the adapter wrote, and prints its URL.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Miniflare } from "miniflare";

const dir = process.argv[2];
const config = JSON.parse(await readFile(join(dir, "wrangler.jsonc"), "utf8"));
const mf = new Miniflare({
  // The adapter emits one bundled module, which is what Wrangler uploads.
  modulesRoot: dir,
  modules: [{ type: "ESModule", path: join(dir, config.main) }],
  // The adapter stamps the build date; pin one this workerd release supports.
  compatibilityDate: "2026-07-01",
  compatibilityFlags: config.compatibility_flags ?? [],
  ...(config.assets && {
    assets: {
      directory: join(dir, config.assets.directory),
      binding: config.assets.binding,
      routerConfig: {
        has_user_worker: true,
        invoke_user_worker_ahead_of_assets: config.assets.run_worker_first,
      },
    },
  }),
  port: 0,
});
const url = await mf.ready;
console.log(url.href);
process.on("SIGTERM", () => {
  mf.dispose().finally(() => process.exit(0));
});
