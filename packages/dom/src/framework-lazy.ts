import type { Renderer } from "@tschk/moonshine-framework";

async function load(): Promise<Renderer> {
  // Source compatibility only: bundled deployments use framework-native.
  const { sourceRenderer } = await import(
    new URL("./framework-source.ts", import.meta.url).href
  );
  return sourceRenderer;
}

/** Compatibility name; pages use native server factories, not legacy React View IR. */
export const crepusRenderer: Renderer = {
  name: "crepus",
  async prerender(context) {
    return (await load()).prerender(context);
  },
  async render(context) {
    return (await load()).render(context);
  },
};
