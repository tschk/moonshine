import { defineConfig } from "@tschk/moonshine-framework";

const shared = {
  layouts: ["src/layout.ts"],
  middleware: ["src/middleware.ts"],
};

export default defineConfig({
  renderer: "native",
  runtime: "bun",
  routes: [
    {
      ...shared,
      id: "home",
      path: "/",
      file: "src/routes/home.ts",
      mode: "ssr",
    },
    {
      ...shared,
      id: "about",
      path: "/about",
      file: "src/routes/about.ts",
      mode: "static",
    },
    {
      ...shared,
      id: "counter",
      path: "/counter",
      file: "src/routes/counter.ts",
      clientFile: "src/client/counter.ts",
      mode: "spa",
    },
  ],
});
