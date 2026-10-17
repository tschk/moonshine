import type { ComponentContext } from "@tschk/moonshine-dom/component";
export const rawSSRRegistrar = /* @__PURE__ */ Symbol(
  "raw SSR consumer lifecycle",
);
export type Registrar = {
  consumer: ComponentContext;
  register(fn: () => void): void;
};
