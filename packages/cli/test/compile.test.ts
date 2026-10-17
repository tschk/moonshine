import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileCommand } from "../src/compile";

async function withCompiler(
  run: (fixture: {
    dir: string;
    compiler: string;
    log: string;
    emitted: string;
  }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "moonshine compile "));
  const compiler = join(dir, "compiler with spaces");
  const log = join(dir, "arguments.json");
  const emitted =
    "// exact compiler bytes\nexport default function CrepusEmit() {}\n";
  try {
    await Bun.write(
      compiler,
      `#!${process.execPath}
      import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';
      const args=process.argv.slice(2);const flag=name=>args[args.indexOf(name)+1];
      writeFileSync(${JSON.stringify(log)},JSON.stringify({args,cwd:process.cwd()}));
      if(flag('--entry').startsWith('asset')){writeFileSync(join(flag('--out-dir'),'CrepusEmit.moonshine-dom.ts'),readFileSync(join(flag('--site'),flag('--entry'))));process.exit(0);}
      if(flag('--entry')==='host-react.crepus'){writeFileSync(join(flag('--out-dir'),'CrepusEmit.react.tsx'),readFileSync(join(flag('--site'),flag('--entry'))));process.exit(0);}
      if(flag('--entry').startsWith('fail'))process.exit(9);
      if(flag('--entry').startsWith('malformed')){writeFileSync(join(flag('--out-dir'),'CrepusEmit.moonshine-dom.ts'),'export default () => (count + );');process.exit(0);}
      if(!flag('--entry').startsWith('missing')){
        const target=flag('--emit');writeFileSync(join(flag('--out-dir'),'CrepusEmit.'+target+(target==='react'?'.tsx':'.ts')),${JSON.stringify(emitted)});
      }
    `,
    );
    await chmod(compiler, 0o755);
    await run({ dir, compiler, log, emitted });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const frontends = [
  ["svelte", [], "moonshine-dom", ".dom.ts"],
  ["vue", ["--ssr"], "moonshine-ssr", ".ssr.ts"],
  ["tsx", ["--react"], "react", ".react.tsx"],
  ...["crepus", "jsx", "csx", "astro", "ng", "html"].map((ext) => [
    ext,
    [],
    "moonshine-dom",
    ".dom.ts",
  ]),
] as Array<[string, string[], string, string]>;

test.each(frontends)(
  "compile delegates %s source and target without changing output",
  async (extension, flags, target, suffix) => {
    await withCompiler(async ({ dir, compiler, log, emitted }) => {
      const input = join(dir, `view with spaces.${extension}`);
      await Bun.write(input, "source must stay unchanged");
      await compileCommand([input, ...flags, "--compiler", compiler]);
      expect(
        await readFile(join(dir, `view with spaces${suffix}`), "utf8"),
      ).toBe(emitted);
      expect(await readFile(input, "utf8")).toBe("source must stay unchanged");
      const recorded = JSON.parse(await readFile(log, "utf8"));
      const out = recorded.args[recorded.args.indexOf("--out-dir") + 1];
      expect(recorded.args).toEqual([
        "web",
        "build",
        "--site",
        dir,
        "--entry",
        `view with spaces.${extension}`,
        "--out-dir",
        out,
        "--emit",
        target,
      ]);
      expect(recorded.cwd).toBe(await realpath(dir));
      expect(existsSync(out)).toBe(false);
    });
  },
  30_000,
);

test.each([
  ["fail", "exit 9"],
  ["missing", "did not emit expected file"],
  ["malformed", "Unexpected"],
])(
  "compiler failure %s preserves output and cleans temporary files",
  async (name, message) => {
    await withCompiler(async ({ dir, compiler, log }) => {
      const input = join(dir, `${name}.crepus`);
      const output = join(dir, `${name}.dom.ts`);
      await Bun.write(input, "source");
      await Bun.write(output, "keep");
      await expect(
        compileCommand([input, "--compiler", compiler]),
      ).rejects.toThrow(message);
      expect(await readFile(output, "utf8")).toBe("keep");
      const { args } = JSON.parse(await readFile(log, "utf8"));
      expect(existsSync(args[args.indexOf("--out-dir") + 1])).toBe(false);
    });
  },
  30_000,
);

const filesystemImports = [
  'import "./view.css";',
  'export {default} from "../part.ts";',
  'export const lazy = () => import("./lazy.ts");',
  `import ${JSON.stringify(".\\view.css")};`,
  `import ${JSON.stringify("C:\\view.css")};`,
  'import "C:/view.css";',
  'import "/tmp/view.css";',
  `import ${JSON.stringify("\\\\server\\view.css")};`,
  'import "file:///tmp/view.css";',
];

test.each(filesystemImports.map((source, index) => ({ source, index })))(
  "filesystem import case $index preserves output and cleans temporary files",
  async ({ source, index }) => {
    await withCompiler(async ({ dir, compiler, log }) => {
      const input = join(dir, `asset-${index}.crepus`);
      const output = join(dir, `asset-${index}.dom.ts`);
      await Bun.write(input, source);
      await Bun.write(output, "keep");
      await expect(
        compileCommand([input, "--compiler", compiler]),
      ).rejects.toThrow("unsupported filesystem import");
      expect(await Bun.file(output).text()).toBe("keep");
      const { args } = JSON.parse(await readFile(log, "utf8"));
      expect(existsSync(args[args.indexOf("--out-dir") + 1])).toBe(false);
    });
  },
  30_000,
);

test("bare package and Node imports preserve exact emitted bytes", async () => {
  await withCompiler(async ({ dir, compiler }) => {
    const bareInput = join(dir, "asset-bare.crepus");
    const bareSource =
      'import {h} from "@tschk/moonshine-dom/dom"; import {basename} from "node:path"; export default () => h("p",null,basename("a"));';
    await Bun.write(bareInput, bareSource);
    await compileCommand([bareInput, "--compiler", compiler]);
    expect(await Bun.file(join(dir, "asset-bare.dom.ts")).text()).toBe(
      bareSource,
    );
  });
}, 30_000);

test.each(["solid-js", "react", "react-dom/client", "vue", "@vue/runtime-dom"])(
  "native single-file output rejects %s before replacing output",
  async (specifier) => {
    await withCompiler(async ({ dir, compiler, log }) => {
      const input = join(dir, "asset-solid.crepus");
      const output = join(dir, "asset-solid.dom.ts");
      await Bun.write(
        input,
        `import ${JSON.stringify(specifier)}; export default () => 1;`,
      );
      await Bun.write(output, "previous output");
      await expect(
        compileCommand([input, "--compiler", compiler]),
      ).rejects.toThrow("Unsupported native runtime import");
      expect(await Bun.file(output).text()).toBe("previous output");
      const { args } = JSON.parse(await readFile(log, "utf8"));
      expect(existsSync(args[args.indexOf("--out-dir") + 1])).toBe(false);
    });
  },
);

test("React target retains explicit Vue runtime imports", async () => {
  await withCompiler(async ({ dir, compiler }) => {
    const input = join(dir, "host-react.crepus");
    const source = 'import {ref} from "vue"; export default () => ref(1);';
    await Bun.write(input, source);
    await compileCommand([input, "--react", "--compiler", compiler]);
    expect(await Bun.file(join(dir, "host-react.react.tsx")).text()).toBe(
      source,
    );
  });
});

test("legacy JSON output and invalid compile arguments retain their contracts", async () => {
  await withCompiler(async ({ dir }) => {
    const json = join(dir, "view.json");
    await Bun.write(json, '{"version":7,"root":[]}');
    await expect(compileCommand([json])).rejects.toThrow(
      "Native JSON IR emission is unavailable",
    );
    await compileCommand([json, "--react"]);
    expect(await readFile(join(dir, "view.tsx"), "utf8")).toContain(
      'from "@tschk/crepus-moonshine"',
    );
    const input = join(dir, "view.crepus");
    await Bun.write(input, "source");
    await expect(
      compileCommand([input, "--compiler", join(dir, "absent")]),
    ).rejects.toThrow("compiler not found");
    await expect(compileCommand([input, "--ssr", "--react"])).rejects.toThrow(
      "Choose only one",
    );
    await expect(compileCommand([input, "--compiler"])).rejects.toThrow(
      "requires a path",
    );
    const unsupported = join(dir, "view.txt");
    await Bun.write(unsupported, "source");
    await expect(compileCommand([unsupported])).rejects.toThrow(
      "Unsupported source extension",
    );
  });
}, 30_000);
