import { plugin } from "bun";
import { compile } from "svelte/compiler";

export const sveltePlugin = (generate: "server" | "client") => ({
  name: "moonshine-svelte",
  setup(build: any) {
    build.onLoad({ filter: /\.svelte$/ }, async (args: any) => {
      const source = await Bun.file(args.path).text();
      const { js } = compile(source, {
        filename: args.path,
        generate,
        runes: true,
      });
      return { contents: js.code, loader: "js" };
    });
  },
});

plugin(sveltePlugin("server"));
