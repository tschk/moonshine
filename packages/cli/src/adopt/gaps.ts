/** What does not carry over: per host, and per compiled template. */
import { templateGlobs } from "./frameworks.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Framework } from "./frameworks.js";
import type { AdoptScan, TemplateFile } from "./types.js";

export async function findManualWork(
  projectDir: string,
  files: string[],
  scan: Pick<AdoptScan, "framework" | "routesDir">,
): Promise<string[]> {
  const manual: string[] = [];
  const note = (text: string) => {
    if (!manual.includes(text)) manual.push(text);
  };

  for (const candidate of [
    "middleware.ts",
    "middleware.js",
    "src/middleware.ts",
  ]) {
    if (existsSync(join(projectDir, candidate))) {
      note(
        `${candidate}: Next middleware does not run. Moonshine has no edge middleware phase — port it to a route loader or a Bun server wrapper.`,
      );
    }
  }
  for (const candidate of [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
  ]) {
    if (existsSync(join(projectDir, candidate))) {
      note(
        `${candidate}: not read. redirects/rewrites/headers/images/webpack options are all ignored.`,
      );
    }
  }

  const results: { file: string; source: string }[] = Array.from({ length: files.length }) as { file: string; source: string }[];
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < files.length) {
      const index = currentIndex++;
      const file = files[index];
      const source = await readFile(join(projectDir, file), "utf8");
      results[index] = { file, source };
    }
  };

  const concurrency = 100;
  const workers = Array.from(
    { length: Math.min(concurrency, files.length) },
    worker,
  );
  await Promise.all(workers);

  const fileContents = results;

  for (const item of fileContents) {
    if (!item) continue;
    const { file, source } = item;
    const stem = file
      .split("/")
      .pop()!
      .replace(/\.[jt]sx?$/, "");

    if (
      /export\s+(?:const|async\s+function|function)\s+generateMetadata/.test(
        source,
      )
    ) {
      note(
        `${file}: generateMetadata() is not called. Moonshine emits its own <head>; move tags into a layout.`,
      );
    } else if (/export\s+const\s+metadata\b/.test(source)) {
      note(
        `${file}: the metadata export is not read. Moonshine emits its own <head>; move tags into a layout.`,
      );
    }
    if (/export\s+const\s+revalidate\b/.test(source)) {
      note(`${file}: ISR (export const revalidate) is not implemented.`);
    }
    if (/^\s*["']use server["']/m.test(source)) {
      note(`${file}: server actions ("use server") are not supported.`);
    }
    if (/export\s+default\s+async\s+function/.test(source) && stem === "page") {
      note(
        `${file}: async server component. Moonshine renders with react-dom/server, which cannot await a component — move the fetch into a loader.`,
      );
    }
    if (stem === "layout" && /<html\b/.test(source)) {
      note(
        `${file}: returns <html>/<body>, but moonshine already emits the document shell. Return a fragment instead.`,
      );
    }
    if (["loading", "template", "not-found", "default"].includes(stem)) {
      note(`${file}: ${stem}.tsx has no moonshine equivalent and is ignored.`);
    }
    if (/getServerSideProps|getStaticProps|getStaticPaths/.test(source)) {
      note(
        `${file}: getServerSideProps/getStaticProps are not called. Rename to a moonshine loader.`,
      );
    }
  }

  if (scan.routesDir) {
    for (const file of files) {
      if (!file.startsWith(`${scan.routesDir}/`)) continue;
      const segments = file.split("/");
      if (segments.some((s) => s.startsWith("@"))) {
        note(`${file}: parallel routes (@slot) are dropped.`);
      }
      if (segments.some((s) => /^\(\.+\)/.test(s))) {
        note(`${file}: intercepting routes are dropped.`);
      }
    }
  }

  return manual;
}

/** Behavioural gaps in the reimplementations the app actually imports. */
export const ALIAS_CAVEATS: Readonly<Record<string, string>> = {
  "next/image":
    "next/image renders a plain <img>: no resizing, no AVIF/WebP negotiation, no blur placeholder.",
  "next/link":
    "next/link navigates through the moonshine router; prefetch is a browser <link rel=prefetch> hint, not an RSC payload warm-up.",
  "next/headers":
    "next/headers reads the moonshine request context; cookie mutations do not propagate to the response.",
  "next/font/google":
    "next/font/google emits a Google Fonts <link> instead of self-hosting; call fontLinks() in your layout head or the family never loads.",
  "next/dynamic":
    "next/dynamic lazy-loads on the client only; `ssr: false` is the effective behaviour either way.",
};

/**
 * The honest boundary of the template path: crepuscularity compiles the markup
 * only. Nothing inside `<script>` runs, so component logic has to be ported.
 */
export function templateManualWork(
  framework: Framework,
  templates: TemplateFile[],
): string[] {
  if (!templateGlobs(framework) || templates.length === 0) return [];
  const boundary: Readonly<Record<string, string>> = {
    svelte:
      "<script> blocks are not executed: runes, stores, reactive statements, lifecycle hooks and event handler bodies are compiled as template text, not run. Port that logic to moonshine signals.",
    vue: "<script> blocks are not executed: the Composition API, reactive refs, computed properties and lifecycle hooks do not run. Port that logic to moonshine signals.",
    astro:
      "The `---` frontmatter is blanked, never executed: imports, top-level awaits, data fetching and `Astro.props` do not run. Only the markup below it is compiled.",
    angular:
      "The component class is not executed: constructors, decorators, DI, `@Input`/`@Output`, pipes and lifecycle hooks do not run. Only the template is compiled.",
  };
  const rejects: Readonly<Record<string, string>> = {
    astro:
      "Astro templates that use an imported component (`<Layout>`, any uppercase tag), `<slot />`, `{...spread}`, `transition:*` or `define:vars` are parse errors — the frontend compiles markup and resolves no modules. In a real Astro app most page files use components, so expect per-file failures rather than a whole-app adoption.",
    angular:
      "Angular templates that use `<ng-template>`, `<ng-content>`, `*ngSwitch`, `[ngStyle]`/`[style.x]`, `#templateRef`, `@switch`, `@defer` or `@empty` are parse errors.",
  };
  const notes: string[] = [boundary[framework]!];
  if (rejects[framework]) notes.push(rejects[framework]!);
  notes.push(
    "Route modules embed the View IR produced at adopt time. Re-run `moonshine adopt --force` after editing a template.",
  );
  if (framework === "angular") {
    notes.push(
      "Angular has no file-based routing, so no component is mounted at a URL. The generated IR is compiled but unrouted until you write route modules that render it.",
    );
  }
  for (const template of templates) {
    if (!template.ok) {
      notes.push(
        `${template.file}: did not compile — ${template.error}. No route was generated for it; unsupported template constructs are parse errors, not silent drops.`,
      );
    } else if (!template.route) {
      notes.push(
        `${template.file}: compiled (${template.nodes} nodes) but maps to no URL, so it is not mounted. Its IR is in ${template.generated} — import that from a route module to render it.`,
      );
    }
  }
  return notes;
}
