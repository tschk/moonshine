export type PackageEntry = {
  name: string;
  role: string;
  group: "core" | "adapter" | "deploy";
};

/** Mirrors `packages/*` in the moonshine repository, one row per manifest. */
export const PACKAGES: PackageEntry[] = [
  {
    name: "@tschk/moonshine",
    role: "Signal-only kernel: signals, memos, stores, resources",
    group: "core",
  },
  {
    name: "@tschk/moonshine-router",
    role: "Renderer-neutral route graph and matcher",
    group: "core",
  },
  {
    name: "@tschk/moonshine-server",
    role: "Request pipeline: loaders, actions, middleware, static files",
    group: "core",
  },
  {
    name: "@tschk/moonshine-compiler",
    role: "Filesystem discovery, module analysis, bundles, manifest",
    group: "core",
  },
  {
    name: "@tschk/moonshine-framework",
    role: "Public contracts: routes, manifest, renderer, adapter, config",
    group: "core",
  },
  {
    name: "@tschk/moonshine-react",
    role: "React SSR, streaming, islands, hydration, signal hooks",
    group: "core",
  },
  {
    name: "@tschk/crepus-moonshine",
    role: ".crepus parsing via the Rust parser in WASM, and View IR rendering",
    group: "core",
  },
  {
    name: "@tschk/moonshine-cli",
    role: "new, adopt, compile, build, inspect, preview, dev",
    group: "core",
  },
  {
    name: "@tschk/moonshine-shaders",
    role: "Optional WebGL fragment shader helpers for React apps",
    group: "core",
  },
  {
    name: "@tschk/moonshine-next",
    role: "Next.js API surface, reimplemented — drop next, keep the imports",
    group: "adapter",
  },
  {
    name: "@tschk/moonshine-react-router",
    role: "react-router / Remix client API, reimplemented",
    group: "adapter",
  },
  {
    name: "@tschk/moonshine-tanstack",
    role: "TanStack Router / Start client API, reimplemented",
    group: "adapter",
  },
  {
    name: "@tschk/moonshine-waku",
    role: "Waku client router API, reimplemented",
    group: "adapter",
  },
  {
    name: "@tschk/moonshine-solid",
    role: "Solid renderer, solid-js re-exports, and signal bridges",
    group: "adapter",
  },
  {
    name: "@tschk/moonshine-adapter-conformance",
    role: "Shared deployment contract suite every deploy adapter passes",
    group: "adapter",
  },
  {
    name: "@tschk/moonshine-deploy-bun",
    role: "Bun server deployment",
    group: "deploy",
  },
  {
    name: "@tschk/moonshine-deploy-node",
    role: "Node HTTP deployment",
    group: "deploy",
  },
  {
    name: "@tschk/moonshine-deploy-cloudflare",
    role: "Cloudflare Workers deployment — what serves this site",
    group: "deploy",
  },
  {
    name: "@tschk/moonshine-deploy-vercel",
    role: "Vercel functions, edge, and static output",
    group: "deploy",
  },
];

export const GROUP_LABELS: Record<PackageEntry["group"], string> = {
  core: "Core",
  adapter: "Host adapters",
  deploy: "Deployment adapters",
};
