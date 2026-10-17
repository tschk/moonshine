import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildProjectIsolated } from "./build-in-subprocess";
import { readManifest } from "../src/manifest";

async function importGraph(
  out: string,
  entry: string,
): Promise<Map<string, string>> {
  const modules = new Map<string, string>();
  const visit = async (file: string) => {
    if (modules.has(file)) return;
    const source = await Bun.file(file).text();
    modules.set(file, source);
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*)["'](\.\/[^"']+)["']/g,
    )) {
      await visit(resolve(dirname(file), match[1]!));
    }
  };
  await visit(join(out, "public", entry));
  return modules;
}

test("native SPA entries isolate pages and share runtime chunks in one browser build", async () => {
  const project = await mkdtemp(
    join(import.meta.dir, "fixtures/native-client-split-"),
  );
  try {
    await mkdir(join(project, "src/routes"), { recursive: true });
    await mkdir(join(project, "node_modules/@tschk"), { recursive: true });
    await symlink(
      resolve(import.meta.dir, "../../dom"),
      join(project, "node_modules/@tschk/moonshine-dom"),
    );
    await Bun.write(
      join(project, "src/shared.ts"),
      `import "./shared.css"; export const shared = () => "SHARED_RUNTIME_MARKER";`,
    );
    await Bun.write(
      join(project, "src/shared.css"),
      ".common-css-marker { color: black; }",
    );
    for (const id of ["alpha", "beta"]) {
      await Bun.write(
        join(project, `src/${id}.css`),
        `.${id}-css-marker { color: red; }`,
      );
      await Bun.write(
        join(project, `src/server-${id}.ts`),
        `
        export const loader = () => ({ secret: "PRIVATE_${id}_SERVER_ONLY" });
        export default function Page() { throw Error("SPA server page cannot render"); }`,
      );
      await Bun.write(
        join(project, `src/client-${id}.ts`),
        `
        import { h } from "@tschk/moonshine-dom/dom";
        import { createSignal } from "@tschk/moonshine-dom/reactive";
        import { shared } from "./shared";
        import "./${id}.css";
        export default function Page() {
          const [count, set] = createSignal(0);
          return h("button", { onClick: () => set(count() + 1) },
            () => "CLIENT_${id}_ONLY:" + shared() + count());
        }`,
      );
    }
    const options = {
      projectDir: project,
      renderer: "native" as const,
      programmatic: ["alpha", "beta"].map((id) => ({
        id,
        path: `/${id}`,
        file: `src/server-${id}.ts`,
        mode: "spa" as const,
        clientFile: `src/client-${id}.ts`,
      })),
    };
    await buildProjectIsolated(options);
    const out = join(project, ".moonshine");
    const manifest = await readManifest(join(out, "manifest.json"));
    const alpha = manifest.routes.find((route) => route.id === "alpha")!;
    const beta = manifest.routes.find((route) => route.id === "beta")!;
    expect(alpha.clientEntries).toHaveLength(1);
    expect(beta.clientEntries).toHaveLength(1);
    expect(alpha.clientEntries[0]).not.toBe(beta.clientEntries[0]);
    expect(manifest.entries.client).toBe(alpha.clientEntries[0]);
    const alphaGraph = await importGraph(out, alpha.clientEntries[0]!);
    const betaGraph = await importGraph(out, beta.clientEntries[0]!);
    const alphaText = [...alphaGraph.values()].join("\n");
    const betaText = [...betaGraph.values()].join("\n");
    expect(alphaText).toContain("CLIENT_alpha_ONLY");
    expect(alphaText).not.toContain("CLIENT_beta_ONLY");
    expect(betaText).toContain("CLIENT_beta_ONLY");
    expect(betaText).not.toContain("CLIENT_alpha_ONLY");
    const shared = [...alphaGraph.keys()].filter((file) => betaGraph.has(file));
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.map((file) => alphaGraph.get(file)).join("\n")).toContain(
      "SHARED_RUNTIME_MARKER",
    );
    const publicAssets = manifest.assets.filter((asset) =>
      asset.file.startsWith("public/"),
    );
    expect(publicAssets.some((asset) => asset.file.endsWith(".css"))).toBe(
      true,
    );
    expect(alpha.clientStyles).toHaveLength(1);
    expect(beta.clientStyles).toHaveLength(1);
    expect(alpha.clientStyles![0]).not.toBe(beta.clientStyles![0]);
    for (const [route, own, other] of [
      [alpha, "alpha", "beta"],
      [beta, "beta", "alpha"],
    ] as const) {
      const stylesheet = publicAssets.find(
        (asset) => asset.path === route.clientStyles![0],
      );
      expect(stylesheet).toBeDefined();
      expect(stylesheet!.integrity).toStartWith("sha256-");
      const css = await Bun.file(join(out, stylesheet!.file)).text();
      expect(css).toContain(`.${own}-css-marker`);
      expect(css).toContain(".common-css-marker");
      expect(css).not.toContain(`.${other}-css-marker`);
    }
    for (const file of new Set([...alphaGraph.keys(), ...betaGraph.keys()])) {
      const asset = publicAssets.find(
        (candidate) => resolve(out, candidate.file) === file,
      );
      expect(asset).toBeDefined();
      expect(asset!.integrity).toStartWith("sha256-");
    }
    for (const text of [alphaText, betaText]) {
      expect(text).not.toContain("PRIVATE_");
      expect(text).not.toContain("react-dom");
      expect(text).not.toContain("node_modules/solid-js");
    }
    // The guard includes every registered route, not just the importing page.
    await Bun.write(
      join(project, "src/client-beta.ts"),
      `import { loader } from "./server-alpha";
      export default function Page() { return loader().secret; }`,
    );
    await expect(buildProjectIsolated(options)).rejects.toThrow(
      "server-only route module",
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("legacy clients retain the single entry even for prototype-named route ids", async () => {
  const project = await mkdtemp(
    join(import.meta.dir, "fixtures/legacy-client-entry-"),
  );
  try {
    await mkdir(join(project, "src/routes"), { recursive: true });
    await Bun.write(
      join(project, "src/page.ts"),
      "export default function Page() { return null; }",
    );
    await buildProjectIsolated({
      projectDir: project,
      programmatic: [
        { id: "constructor", path: "/", file: "src/page.ts", mode: "spa" },
      ],
    });
    const manifest = await readManifest(
      join(project, ".moonshine/manifest.json"),
    );
    expect(manifest.entries.client).toBe("/client.js");
    expect(manifest.routes[0]!.clientEntries).toEqual(["/client.js"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
