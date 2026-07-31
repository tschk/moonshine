import type { RenderMode, RuntimeTarget } from "./routes";

export type MoonshineConfig = {
  mode?: RenderMode;
  runtime?: RuntimeTarget;
};

export function defineConfig<T extends MoonshineConfig>(config: T): T {
  return config;
}
