/** Which hosts moonshine knows, and how each one's specifiers map onto it. */
import { readJson } from "./scan.js";
import { dirname, join } from "node:path";
import {
  nextAliases,
  resolveAlias as resolveNextAlias,
} from "@tschk/moonshine-next/aliases";
import {
  reactRouterAliases,
  resolveAlias as resolveReactRouterAlias,
} from "@tschk/moonshine-react-router/aliases";
import {
  tanstackAliases,
  resolveAlias as resolveTanstackAlias,
} from "@tschk/moonshine-tanstack/aliases";
import {
  wakuAliases,
  resolveAlias as resolveWakuAlias,
} from "@tschk/moonshine-waku/aliases";

export type Framework =
  | "next-app"
  | "next-pages"
  | "react-router"
  | "tanstack"
  | "waku"
  | "svelte"
  | "vue"
  | "astro"
  | "angular"
  | "vite-react"
  | "react"
  | "unknown";

/**
 * Frameworks adopted by compiling their templates to View IR, not by aliasing
 * imports, and the globs whose files crepuscularity's dispatcher claims.
 *
 * Angular is keyed on the Angular CLI's `*.component.html`, on `*.ng.html` and
 * on a bare `.ng`. Plain `.html` is deliberately absent: the dispatcher does not
 * claim it, so a project's `index.html` must not be swept in here either.
 */
const TEMPLATE_FRAMEWORKS: Readonly<Record<string, readonly string[]>> = {
  svelte: ["**/*.svelte"],
  vue: ["**/*.vue"],
  astro: ["**/*.astro"],
  angular: ["**/*.component.html", "**/*.ng.html", "**/*.ng"],
};

export function templateGlobs(
  framework: Framework,
): readonly string[] | undefined {
  return TEMPLATE_FRAMEWORKS[framework];
}

/**
 * A sample only the real frontend compiles into control flow. The dispatcher
 * falls back to generic markup for an extension it does not know, and that
 * fallback is silent — it yields plausible-looking IR with the framework's own
 * constructs quietly dropped. Probing for the structural node proves the
 * installed parser build actually carries the frontend.
 */
const FRONTEND_PROBES: Readonly<
  Record<string, { file: string; source: string }>
> = {
  astro: { file: "probe.astro", source: "{ok && <p>y</p>}" },
  angular: { file: "probe.ng.html", source: "@if (a) { <p>y</p> }" },
};

/** Version of the parser build actually loaded, for the refusal message. */
export async function parserVersion(): Promise<string | undefined> {
  try {
    const entry = Bun.resolveSync(
      "@tschk/crepuscularity-wasm",
      import.meta.dir,
    );
    const pkg = readJson<{ version?: string }>(
      join(dirname(entry), "package.json"),
    );
    return pkg?.version;
  } catch {
    return undefined;
  }
}

export async function hasFrontend(framework: Framework): Promise<boolean> {
  const probe = FRONTEND_PROBES[framework];
  if (!probe) return true;
  try {
    const { parseTemplate } = await import("@tschk/crepuscularity-wasm");
    const ir = parseTemplate(probe.source, probe.file);
    return (ir.root ?? []).some((node) => node.kind === "if");
  } catch {
    return false;
  }
}

/** A host package moonshine reimplements, and how its specifiers map to files. */
export type HostAdapter = {
  /** Package the aliases resolve into. */
  pkg: string;
  /** Bare specifier → adapter subpath. */
  aliases: Readonly<Record<string, string>>;
  resolveAlias: (specifier: string) => string | undefined;
  /** A specifier whose backing file sits directly in `src/`, used to locate it. */
  reference: string;
  /** Specifiers in the source that belong to this host, aliasable or not. */
  imports: RegExp;
};

const ADAPTERS = {
  next: {
    pkg: "@tschk/moonshine-next",
    aliases: nextAliases,
    resolveAlias: resolveNextAlias,
    reference: "next/link",
    imports: /^next(?:\/.*)?$/,
  },
  "react-router": {
    pkg: "@tschk/moonshine-react-router",
    aliases: reactRouterAliases,
    resolveAlias: resolveReactRouterAlias,
    reference: "react-router",
    imports: /^(?:react-router|react-router-dom|@remix-run\/[^/]+)$/,
  },
  tanstack: {
    pkg: "@tschk/moonshine-tanstack",
    aliases: tanstackAliases,
    resolveAlias: resolveTanstackAlias,
    reference: "@tanstack/react-router",
    imports: /^@tanstack\/(?:react-router|router-core|react-start|start)$/,
  },
  waku: {
    pkg: "@tschk/moonshine-waku",
    aliases: wakuAliases,
    resolveAlias: resolveWakuAlias,
    reference: "waku/router",
    imports: /^waku(?:\/.*)?$/,
  },
} as const satisfies Record<string, HostAdapter>;

const FRAMEWORK_ADAPTER: Readonly<
  Partial<Record<Framework, keyof typeof ADAPTERS>>
> = {
  "next-app": "next",
  "next-pages": "next",
  "react-router": "react-router",
  tanstack: "tanstack",
  waku: "waku",
};

export function adapterFor(framework: Framework): HostAdapter | undefined {
  const id = FRAMEWORK_ADAPTER[framework];
  return id ? ADAPTERS[id] : undefined;
}
