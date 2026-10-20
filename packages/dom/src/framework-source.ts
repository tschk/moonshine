/** Source-file compatibility renderer for Bun/Node; deployed bundles use framework-native. */
import type { RenderContext, Renderer } from "@tschk/moonshine-framework";
import { createNativeRenderer } from "./framework-native";

async function load(context: RenderContext): Promise<Renderer> {
  if (context.route.mode === "island")
    throw new Error("Native island hydration is not implemented");
  const modules: Parameters<typeof createNativeRenderer>[0] =
    Object.create(null);
  if (context.route.mode !== "api" && context.route.mode !== "spa") {
    const files = Array.from(
      new Set([context.route.file, ...(context.route.layouts ?? [])]),
    );
    const imported = await Promise.all(files.map((file) => import(file)));
    for (let i = 0; i < files.length; i++) {
      modules[files[i]!] = imported[i]!;
    }
  }
  return createNativeRenderer(modules);
}

export const sourceRenderer: Renderer = {
  name: "native",
  async prerender(context) {
    return (await load(context)).prerender(context);
  },
  async render(context) {
    return (await load(context)).render(context);
  },
};
